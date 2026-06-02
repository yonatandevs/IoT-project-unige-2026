/**
 * A single GPS position sample published by a bike node.
 * Published approximately once per second while the bike is moving.
 */
export interface GPSReading {
  /** References BikeDevice.bike_id */
  bike_id: string;

  /** ISO 8601 measurement timestamp */
  timestamp: string;

  /** Decimal degrees, WGS-84 */
  latitude: number;

  /** Decimal degrees, WGS-84 */
  longitude: number;

  /** Meters above sea level */
  altitude: number;

  /** Speed in km/h. 0 when the bike is parked */
  speed: number;

  /** Direction of travel in degrees 0–360 */
  heading: number;

  /** GPS fix accuracy radius in meters */
  accuracy: number;
}
