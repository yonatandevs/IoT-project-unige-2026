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
