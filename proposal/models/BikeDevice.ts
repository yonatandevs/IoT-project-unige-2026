export type ConnectivityStatus = "online" | "offline" | "degraded";
export type LockState = "locked" | "unlocked";

/**
 * Device registry and current health state for a single bike.
 * Updated on every MQTT heartbeat received from the bike node.
 */
export interface BikeDevice {
  /** Unique identifier, e.g. "bike-001" */
  bike_id: string;

  /** Battery percentage 0–100. Triggers low-battery alert when < 15 */
  battery_level: number;

  /** Connection state, updated on MQTT heartbeat */
  connectivity_status: ConnectivityStatus;

  /** GNSS fix quality 0–100 based on satellite count */
  gnss_signal_quality: number;

  /** List of active sensors, e.g. ["gnss", "imu", "pir"] */
  sensors: string[];

  /** Current state of the electronic lock actuator */
  lock_state: LockState;

  /** Whether the buzzer / LED alarm is currently active */
  alarm_active: boolean;

  /** ISO 8601 timestamp of the last MQTT message received */
  last_seen: string;
}
