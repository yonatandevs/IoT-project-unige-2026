export type CommandType = "lock" | "unlock" | "alarm_on" | "alarm_off";
export type CommandStatus = "pending" | "sent" | "acknowledged" | "failed";

/**
 * A command issued by an operator and delivered to a bike via MQTT.
 * Status progresses from "pending" → "sent" → "acknowledged" (or "failed").
 */
export interface ActuatorCommand {
  /** UUID uniquely identifying this command */
  command_id: string;

  /** References BikeDevice.bike_id */
  bike_id: string;

  /** ISO 8601 timestamp when the command was issued */
  timestamp: string;

  /** The action to perform on the bike */
  command_type: CommandType;

  /** Delivery and acknowledgement state, updated as MQTT ACK arrives */
  status: CommandStatus;

  /** Operator username who issued the command, or "system" for automated commands */
  issued_by: string;
}
