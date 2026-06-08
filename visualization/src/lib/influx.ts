import type { AlertAckRow, AlertRow, BikeRow } from "../types";

function getEnv(name: string, fallback = ""): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[name] ?? fallback;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function escapeFluxString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeTag(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/ /g, "\\ ");
}

type InfluxValue = string | number | boolean | undefined;
type InfluxRecord = Record<string, InfluxValue>;

const booleanColumns = new Set(["locked", "acknowledged", "acked"]);
const stringColumns = new Set([
  "_time",
  "id",
  "status",
  "current_ride",
  "bike_id",
  "type",
  "severity",
  "alert_id",
  "message",
  "source",
]);

function coerceValue(column: string, value: string): InfluxValue {
  if (booleanColumns.has(column)) {
    return value === "true";
  }

  if (stringColumns.has(column)) {
    return value;
  }

  if (value === "" || value === "null") {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function parseInfluxCsv(csv: string): InfluxRecord[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const dataLines = lines.filter((line) => !line.startsWith("#"));
  if (dataLines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(dataLines[0]).map((header) => header.trim());
  const rows: InfluxRecord[] = [];

  for (const line of dataLines.slice(1)) {
    const values = parseCsvLine(line);
    const record: InfluxRecord = {};

    headers.forEach((header, index) => {
      record[header] = coerceValue(header, values[index] ?? "");
    });

    if (
      typeof record._time === "string" &&
      (typeof record.id === "string" || typeof record.bike_id === "string")
    ) {
      rows.push(record);
    }
  }

  return rows;
}

async function queryInflux(fluxQuery: string): Promise<InfluxRecord[]> {
  const org = getEnv("VITE_INFLUXDB_ORG", "iot-bikes");
  const token = getEnv("VITE_INFLUXDB_TOKEN", "dev-token-change-in-production");
  const proxyPrefix = getEnv("VITE_INFLUXDB_PROXY_PREFIX", "/influx");

  const response = await fetch(`${proxyPrefix}/api/v2/query?org=${encodeURIComponent(org)}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/csv",
    },
    body: JSON.stringify({
      query: fluxQuery,
      type: "flux",
      dialect: {
        annotations: ["datatype", "group", "default"],
        delimiter: ",",
        header: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const csv = await response.text();
  return parseInfluxCsv(csv);
}

export async function fetchLatestBikeRows(): Promise<BikeRow[]> {
  const bucket = getEnv("VITE_INFLUXDB_BUCKET", "bike_data");

  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: 0)
  |> filter(fn: (r) => r._measurement == "bike")
  |> group(columns: ["id", "_field"])
  |> last()
  |> pivot(rowKey: ["_time", "id"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "id", "lat", "lng", "current_speed", "battery", "locked", "status", "current_ride", "imu_x", "imu_y", "imu_z", "imu_dx", "imu_dy", "imu_dz"])
  |> sort(columns: ["id"])
`;

  return (await queryInflux(fluxQuery)) as BikeRow[];
}

export async function fetchBikeHistory(bikeId: string): Promise<BikeRow[]> {
  const bucket = getEnv("VITE_INFLUXDB_BUCKET", "bike_data");
  const escapedBikeId = escapeFluxString(bikeId);

  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: 0)
  |> filter(fn: (r) => r._measurement == "bike" and r.id == "${escapedBikeId}")
  |> pivot(rowKey: ["_time", "id"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "id", "lat", "lng", "current_speed", "battery", "locked", "status", "current_ride", "imu_x", "imu_y", "imu_z", "imu_dx", "imu_dy", "imu_dz"])
  |> sort(columns: ["_time"])
`;

  return (await queryInflux(fluxQuery)) as BikeRow[];
}

export async function fetchBikeAlerts(bikeId: string): Promise<AlertRow[]> {
  const bucket = getEnv("VITE_INFLUXDB_BUCKET", "bike_data");
  const escapedBikeId = escapeFluxString(bikeId);

  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: 0)
  |> filter(fn: (r) => r._measurement == "alert" and r.bike_id == "${escapedBikeId}")
  |> pivot(rowKey: ["_time", "bike_id"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "bike_id", "type", "severity", "alert_id", "message", "acknowledged"])
  |> sort(columns: ["_time"], desc: true)
`;

  return (await queryInflux(fluxQuery)) as AlertRow[];
}

export async function fetchBikeAlertAcknowledgements(bikeId: string): Promise<AlertAckRow[]> {
  const bucket = getEnv("VITE_INFLUXDB_BUCKET", "bike_data");
  const escapedBikeId = escapeFluxString(bikeId);

  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: 0)
  |> filter(fn: (r) => r._measurement == "alert_ack" and r.bike_id == "${escapedBikeId}")
  |> pivot(rowKey: ["_time", "bike_id", "alert_id"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "bike_id", "alert_id", "acked", "source"])
  |> sort(columns: ["_time"], desc: true)
`;

  return (await queryInflux(fluxQuery)) as AlertAckRow[];
}

export async function acknowledgeBikeAlert(bikeId: string, alertId: string): Promise<void> {
  const org = getEnv("VITE_INFLUXDB_ORG", "iot-bikes");
  const bucket = getEnv("VITE_INFLUXDB_BUCKET", "bike_data");
  const token = getEnv("VITE_INFLUXDB_TOKEN", "dev-token-change-in-production");
  const proxyPrefix = getEnv("VITE_INFLUXDB_PROXY_PREFIX", "/influx");
  const timestamp = `${BigInt(Date.now()) * 1000000n}`;

  const line = [
    `alert_ack,bike_id=${escapeTag(bikeId)},alert_id=${escapeTag(alertId)} acked=true,source="visualization" ${timestamp}`,
  ].join("\n");

  const response = await fetch(
    `${proxyPrefix}/api/v2/write?org=${encodeURIComponent(org)}&bucket=${encodeURIComponent(bucket)}&precision=ns`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: line,
    }
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }
}
