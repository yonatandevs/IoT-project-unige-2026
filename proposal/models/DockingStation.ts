export type StationStatus = "operational" | "maintenance" | "offline";

/**
 * Fixed device registry for a smart docking rack.
 * Published by the Docking Station Node on connect and on every slot change.
 */
export interface DockingStation {
  /** Unique identifier, e.g. "station-001" */
  station_id: string;

  /** Human-readable label, e.g. "Piazza de Ferrari" */
  name: string;

  /** Fixed GPS latitude of the station */
  latitude: number;

  /** Fixed GPS longitude of the station */
  longitude: number;

  /** Total number of physical docking slots */
  total_slots: number;

  /** Number of slots currently free */
  available_slots: number;

  /** List of bike_ids currently docked at this station */
  bikes_docked: string[];

  /** Operational state of the station */
  status: StationStatus;
}
