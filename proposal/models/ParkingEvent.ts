/**
 * Raised by Node-RED when a bike's speed drops to 0 for more than 60 seconds.
 * Records whether the parking location falls within an authorized zone.
 */
export interface ParkingEvent {
  /** UUID uniquely identifying this parking event */
  event_id: string;

  /** References BikeDevice.bike_id */
  bike_id: string;

  /** ISO 8601 timestamp when the bike stopped */
  start_time: string;

  /** ISO 8601 timestamp when the bike moved again. null while still parked */
  end_time: string | null;

  /** Latitude where the bike stopped */
  latitude: number;

  /** Longitude where the bike stopped */
  longitude: number;

  /** Whether the parking location is inside an authorized zone polygon */
  is_authorized: boolean;

  /** ID of the matched authorized zone, or null if outside all zones */
  zone_id: string | null;
}
