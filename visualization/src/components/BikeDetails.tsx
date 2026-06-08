import type { BikeRow } from "../types";
import { BatteryChart } from "./BatteryChart";
import { bikeColumns } from "../types";
import { formatBatteryPercent, formatCell, formatDuration, formatMetric, formatTime } from "../utils/format";
import type { AlertRow } from "../types";
import type { RideSummary } from "../utils/bikeAnalytics";

type Props = {
  selectedBike: BikeRow | null;
  selectedRide: RideSummary | null;
  rides: RideSummary[];
  alerts: AlertRow[];
  batterySeries: Array<{ time: string; battery: number }>;
  loadingHistory: boolean;
  loadingAlerts: boolean;
  detailError: string | null;
  alertsError: string | null;
  alertActionError: string | null;
  selectedRideId: string | null;
  onSelectRide: (rideId: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
};

export function BikeDetails({
  selectedBike,
  selectedRide,
  rides,
  alerts,
  batterySeries,
  loadingHistory,
  loadingAlerts,
  detailError,
  alertsError,
  alertActionError,
  selectedRideId,
  onSelectRide,
  onAcknowledgeAlert,
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

      {alertsError ? (
        <section className="error-panel inline">
          <strong>Alert query failed</strong>
          <pre>{alertsError}</pre>
        </section>
      ) : null}

      {alertActionError ? (
        <section className="error-panel inline">
          <strong>Alert acknowledgement failed</strong>
          <pre>{alertActionError}</pre>
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

      <section className="alert-list-section">
        <div className="panel-heading ride-heading">
          <h3>Alerts for this bike</h3>
          <span>{loadingAlerts ? "Loading" : `${alerts.length} total`}</span>
        </div>
        <div className="table-wrap alert-table">
          <table>
            <thead>
              <tr>
                <th>time</th>
                <th>type</th>
                <th>severity</th>
                <th>message</th>
                <th>acknowledged</th>
                <th>action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr
                  key={alert.alert_id ?? `${alert._time}-${alert.type ?? "alert"}`}
                  className={alert.acknowledged ? "alert-row acknowledged" : "alert-row unacknowledged"}
                >
                  <td>{formatTime(alert._time)}</td>
                  <td>{formatCell(alert.type)}</td>
                  <td>{formatCell(alert.severity)}</td>
                  <td>{formatCell(alert.message)}</td>
                  <td>
                    <span
                      className={`ack-indicator ${alert.acknowledged ? "ack-indicator--acknowledged" : "ack-indicator--unacknowledged"}`}
                      title={alert.acknowledged ? "Acknowledged" : "Pending acknowledgement"}
                      aria-label={alert.acknowledged ? "Acknowledged" : "Pending acknowledgement"}
                    />
                  </td>
                  <td>
                    {alert.acknowledged ? (
                      <span className="alert-ack-status" aria-label="Already acknowledged">
                        Acknowledged
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="ack-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (alert.alert_id) {
                            onAcknowledgeAlert(alert.alert_id);
                          }
                        }}
                        aria-label={`Acknowledge alert ${alert.alert_id ?? ""}`}
                        title="Acknowledge alert"
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                          <path d="M6.5 10.2 3.9 7.6l-1.1 1.1 3.7 3.7L13.2 5.7l-1.1-1.1z" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loadingAlerts && alerts.length === 0 ? (
                <tr>
                  <td colSpan={6}>No alerts found for this bike.</td>
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
