import type { BikeRow } from "../types";

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

function coerceValue(column: string, value: string): string | number | boolean | undefined {
  if (column === "locked") {
    return value === "true";
  }

  if (
    column === "_time" ||
    column === "id" ||
    column === "status" ||
    column === "current_ride"
  ) {
    return value;
  }

  if (value === "" || value === "null") {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function parseInfluxCsv(csv: string): BikeRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const dataLines = lines.filter((line) => !line.startsWith("#"));
  if (dataLines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(dataLines[0]).map((header) => header.trim());
  const rows: BikeRow[] = [];

  for (const line of dataLines.slice(1)) {
    const values = parseCsvLine(line);
    const record: Record<string, string | number | boolean | undefined> = {};

    headers.forEach((header, index) => {
      record[header] = coerceValue(header, values[index] ?? "");
    });

    if (typeof record._time === "string" && typeof record.id === "string") {
      rows.push(record as BikeRow);
    }
  }

  return rows;
}

async function queryInflux(fluxQuery: string): Promise<BikeRow[]> {
  const org = getEnv("VITE_INFLUXDB_ORG", "iot-bikes");
  const bucket = getEnv("VITE_INFLUXDB_BUCKET", "bike_data");
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

  return queryInflux(fluxQuery);
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

  return queryInflux(fluxQuery);
}
