import type { BikeRow } from "../types";
import { BatteryChart } from "./BatteryChart";
import { bikeColumns } from "../types";
import { formatBatteryPercent, formatCell, formatDuration, formatMetric, formatTime } from "../utils/format";
import type { RideSummary } from "../utils/bikeAnalytics";

type Props = {
  selectedBike: BikeRow | null;
  selectedRide: RideSummary | null;
  rides: RideSummary[];
  batterySeries: Array<{ time: string; battery: number }>;
  loadingHistory: boolean;
  detailError: string | null;
  selectedRideId: string | null;
  onSelectRide: (rideId: string) => void;
};

export function BikeDetails({
  selectedBike,
  selectedRide,
  rides,
  batterySeries,
  loadingHistory,
  detailError,
  selectedRideId,
  onSelectRide,
}: Props) {
  if (!selectedBike) {
    return <div className="empty-state">Select a bike to see details.</div>;
  }

  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>{selectedBike.id}</h2>
          <span>{selectedRide ? `${rides.length} rides` : formatTime(selectedBike._time)}</span>
        </div>
        <span>{selectedBike.status ?? "unknown"}</span>
      </div>

      {detailError ? (
        <section className="error-panel inline">
          <strong>History query failed</strong>
          <pre>{detailError}</pre>
        </section>
      ) : null}

      <section className="overview-section">
        <div className="overview-grid">
          <div>
            <label>In use</label>
            <strong>{selectedBike.current_ride ? "yes" : "no"}</strong>
          </div>
          <div>
            <label>Current ride</label>
            <strong>{selectedBike.current_ride || "—"}</strong>
          </div>
          <div>
            <label>Current speed</label>
            <strong>{formatMetric(selectedBike.current_speed, "km/h")}</strong>
          </div>
          <div>
            <label>Current status</label>
            <strong>{selectedBike.status ?? "—"}</strong>
          </div>
          <div>
            <label>Last time seen</label>
            <strong>{formatTime(selectedBike._time)}</strong>
          </div>
        </div>
      </section>

      <section className="ride-list-section">
        <div className="panel-heading ride-heading">
          <h3>Rides</h3>
          <span>{rides.length} total</span>
        </div>
        <div className="table-wrap ride-table">
          <table>
            <thead>
              <tr>
                <th>ride</th>
                <th>duration</th>
                <th>avg speed</th>
                <th>max speed</th>
                <th>start</th>
                <th>end</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((ride) => {
                const isSelected = ride.id === selectedRideId;

                return (
                  <tr
                    key={ride.id}
                    className={isSelected ? "selected" : undefined}
                    onClick={() => onSelectRide(ride.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectRide(ride.id);
                      }
                    }}
                  >
                    <td>{ride.id}</td>
                    <td>{formatDuration(ride.durationMs)}</td>
                    <td>{formatMetric(ride.averageSpeed, "km/h")}</td>
                    <td>{formatMetric(ride.maxSpeed, "km/h")}</td>
                    <td>{formatTime(ride.startTime)}</td>
                    <td>{formatTime(ride.endTime)}</td>
                  </tr>
                );
              })}
              {!loadingHistory && rides.length === 0 ? (
                <tr>
                  <td colSpan={6}>No rides found for this bike.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="chart-panel">
        <div className="panel-heading chart-heading">
          <h3>Battery charge over time</h3>
          <span>{loadingHistory ? "Loading" : `${batterySeries.length} points`}</span>
        </div>
        <BatteryChart series={batterySeries} />
      </section>

      <section className="detail-table">
        <div className="panel-heading">
          <h3>Latest record</h3>
          <span>Telemetry snapshot</span>
        </div>
        <div className="table-wrap detail-snapshot">
          <table>
            <tbody>
              {bikeColumns.map((key) => (
                <tr key={key}>
                  <th>{key}</th>
                  <td>{key === "battery" ? formatBatteryPercent(selectedBike.battery) : formatCell(selectedBike[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
