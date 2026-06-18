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
}

export interface BikeUsageRow {
  id: string;
  usage_percent?: number;
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
}

export interface AlertAckRow {
  _time: string;
  bike_id: string;
  alert_id: string;
  acked?: boolean;
  source?: string;
}
