export interface BikeRow {
  _time: string;
  id: string;
  lat?: number;
  lng?: number;
  current_speed?: number;
  battery?: number;
  locked?: boolean;
  status?: string;
  current_ride?: string;
  imu_x?: number;
  imu_y?: number;
  imu_z?: number;
  imu_dx?: number;
  imu_dy?: number;
  imu_dz?: number;
  [key: string]: string | number | boolean | undefined;
}

export type HeatmapMode = "ride" | "parking";

export type HeatmapTimeRange = "24h" | "all";

export interface AlertRow {
  _time: string;
  bike_id: string;
  type?: string;
  severity?: string;
  alert_id?: string;
  message?: string;
  acknowledged?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export interface AlertAckRow {
  _time: string;
  bike_id: string;
  alert_id: string;
  acked?: boolean;
  source?: string;
  [key: string]: string | number | boolean | undefined;
}

export const bikeColumns = [
  "_time",
  "id",
  "status",
  "locked",
  "current_ride",
  "battery",
  "current_speed",
  "lat",
  "lng",
  "imu_x",
  "imu_y",
  "imu_z",
  "imu_dx",
  "imu_dy",
  "imu_dz",
] as const;

export const alertColumns = [
  "_time",
  "bike_id",
  "type",
  "severity",
  "alert_id",
  "message",
  "acknowledged",
] as const;
