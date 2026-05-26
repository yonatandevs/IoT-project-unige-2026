/**
 * A single IMU sample published by a bike node.
 * Published approximately 10 times per second.
 * A fall is detected when |accel_z| exceeds ~25 m/s².
 */
export interface IMUReading {
  /** References BikeDevice.bike_id */
  bike_id: string;

  /** ISO 8601 measurement timestamp */
  timestamp: string;

  /** Linear acceleration in m/s² on the X axis */
  accel_x: number;

  /** Linear acceleration in m/s² on the Y axis */
  accel_y: number;

  /** Linear acceleration in m/s² on the Z axis (vertical). Fall detected on spike */
  accel_z: number;

  /** Angular velocity in rad/s on the X axis */
  gyro_x: number;

  /** Angular velocity in rad/s on the Y axis */
  gyro_y: number;

  /** Angular velocity in rad/s on the Z axis */
  gyro_z: number;
}
