import type { AlertAckRow, AlertRow, BikeRow, BikeUsageRow, HeatmapMode } from "../types";
import { InfluxDB, Point } from "@influxdata/influxdb-client";

function getEnv(name: string, fallback = ""): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[name] ?? fallback;
}

const org = getEnv("VITE_INFLUXDB_ORG", "iot-bikes");
const token = getEnv("VITE_INFLUXDB_TOKEN", "dev-token-change-in-production");
const proxyPrefix = getEnv("VITE_INFLUXDB_PROXY_PREFIX", "/influx");
const queryApi = new InfluxDB({url: proxyPrefix, token}).getQueryApi(org)
const bucket = getEnv("VITE_INFLUXDB_BUCKET", "bike_data");
const writeApi = new InfluxDB({url: proxyPrefix, token}).getWriteApi(org, bucket, 'ns')

function escapeFluxString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function fetchLatestBikeRows(start = '0'): Promise<BikeRow[]> {
  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: ${start})
  |> filter(fn: (r) => r._measurement == "bike")
  |> group(columns: ["id", "_field"])
  |> last()
  |> pivot(rowKey: ["_time", "id"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["id"])
`;

  return queryApi.collectRows<BikeRow>(fluxQuery);
}

export function fetchBikeHistory(bikeId: string): Promise<BikeRow[]> {
  const escapedBikeId = escapeFluxString(bikeId);

  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: 0)
  |> filter(fn: (r) => r._measurement == "bike" and r.id == "${escapedBikeId}")
  |> pivot(rowKey: ["_time", "id"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])
`;

  return queryApi.collectRows<BikeRow>(fluxQuery);
}

export function fetchBikeHeatmapRows(mode: HeatmapMode, showAllData: boolean): Promise<BikeRow[]> {
  const rangeStart = showAllData ? "0" : "-24h";
  const modeFilter =
    mode === "ride"
      ? 'exists r.current_ride and string(v: r.current_ride) != ""'
      : 'exists r.locked and string(v: r.locked) == "true"';

  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: ${rangeStart})
  |> filter(fn: (r) => r._measurement == "bike")
  |> pivot(rowKey: ["_time", "id"], columnKey: ["_field"], valueColumn: "_value")
  |> filter(fn: (r) => ${modeFilter} and exists r.lat and exists r.lng)
  |> sort(columns: ["_time"])
`;

  return queryApi.collectRows<BikeRow>(fluxQuery);
}

export function fetchBikeUsageRows(): Promise<BikeUsageRow[]> {
  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: 0)
  |> filter(fn: (r) => r._measurement == "bike")
  |> pivot(rowKey: ["_time", "id"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "id", "current_ride"])
  |> group(columns: ["id"])
  |> sort(columns: ["_time"])
  |> elapsed(unit: 1ms)
  |> reduce(
    identity: {total_ms: 0.0, used_ms: 0.0},
    fn: (r, accumulator) => ({
      total_ms: accumulator.total_ms + float(v: r.elapsed),
      used_ms: accumulator.used_ms + (if exists r.current_ride and string(v: r.current_ride) != "" then float(v: r.elapsed) else 0.0)
    })
  )
  |> map(fn: (r) => ({
    id: r.id,
    usage_percent: if r.total_ms <= 0.0 then 0.0 else r.used_ms / r.total_ms * 100.0
  }))
`;

  return queryApi.collectRows<BikeUsageRow>(fluxQuery);
}

export function fetchAllBikeAlerts(start = '0'): Promise<AlertRow[]> {
  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: ${start})
  |> filter(fn: (r) => r._measurement == "alert")
  |> pivot(rowKey: ["_time", "bike_id"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
`;

  return queryApi.collectRows<AlertRow>(fluxQuery);
}


export function fetchAllBikeAlertAcknowledgements(): Promise<AlertAckRow[]> {
  const fluxQuery = `
from(bucket: "${bucket}")
  |> range(start: 0)
  |> filter(fn: (r) => r._measurement == "alert_ack")
  |> pivot(rowKey: ["_time", "bike_id", "alert_id"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
`;

  return queryApi.collectRows<AlertAckRow>(fluxQuery);
}

export function acknowledgeBikeAlert(bikeId: string, alertId: string): Promise<void> {
  const point = new Point('alert_ack')
    .tag('bike_id', bikeId)
    .tag('alert_id', alertId)
    .booleanField('acked', true)
    .stringField('source', 'visualization')
  writeApi.writePoint(point)
  return writeApi.close()
}
