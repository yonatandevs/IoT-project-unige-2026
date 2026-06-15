import { useEffect, useMemo, useRef, useState } from "react";
import { BikeDetails } from "./components/BikeDetails";
import { BikeList } from "./components/BikeList";
import { BikeMap } from "./components/BikeMap";
import { useBikeDashboard } from "./hooks/useBikeDashboard";
import { formatCell, formatTime } from "./utils/format";
import { Toaster } from "react-hot-toast";

export default function App() {
  const dashboard = useBikeDashboard();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationWrapRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);

  const openAlertCount = dashboard.openAlerts.length;
  const openAlerts = useMemo(
    () => dashboard.openAlerts,
    [dashboard.openAlerts]
  );

  const handleSelectBike = (bikeId: string, lat?: number, lng?: number) => {
    dashboard.setSelectedBikeId(bikeId);

    const bike = dashboard.latestRows.find((row) => row.id === bikeId);
    const bikeLat = lat ?? bike?.lat;
    const bikeLng = lng ?? bike?.lng;

    if (typeof bikeLat === "number" && typeof bikeLng === "number") {
      dashboard.setViewState((current) => ({
        ...current,
        longitude: bikeLng,
        latitude: bikeLat,
      }));
    }
  };

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!notificationWrapRef.current) {
        return;
      }

      if (!notificationWrapRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const handleSelectRide = (rideId: string) => {
    dashboard.setSelectedRideId(rideId);
  };

  const handleOpenAlert = (bikeId: string) => {
    handleSelectBike(bikeId);
    setNotificationsOpen(false);
    detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Bike Telemetry</h1>
        </div>

        <div className="topbar-actions">
          <div className="notification-wrap" ref={notificationWrapRef}>
            <button
              type="button"
              className="icon-button notification-button"
              onClick={() => setNotificationsOpen((current) => !current)}
              aria-label={`${openAlertCount} open alerts`}
              aria-expanded={notificationsOpen}
              aria-haspopup="true"
              title="Open alerts"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M8 1.5a4 4 0 0 0-4 4v1.7c0 .7-.2 1.4-.6 2L2.5 11v.5h11V11l-.9-1.8c-.4-.6-.6-1.3-.6-2V5.5a4 4 0 0 0-4-4Zm0 13a1.5 1.5 0 0 0 1.45-1.1h-2.9A1.5 1.5 0 0 0 8 14.5Z" />
              </svg>
              {openAlertCount > 0 ? <span className="notification-badge">{openAlertCount}</span> : null}
            </button>

            {notificationsOpen ? (
              <div className="notification-panel" role="menu" aria-label="Open alerts">
                <div className="notification-panel-header">
                  <strong>Open alerts</strong>
                  <span>{openAlertCount}</span>
                </div>
                <div className="notification-list">
                  {openAlerts.length > 0 ? (
                    openAlerts.map((alert) => (
                      <button
                        key={alert.alert_id ?? `${alert.bike_id}-${alert._time}`}
                        type="button"
                        className="notification-item"
                        onClick={() => handleOpenAlert(alert.bike_id)}
                      >
                        <span
                          className="notification-dot notification-dot--open"
                          aria-hidden="true"
                        />
                        <span className="notification-item-body">
                          <strong>{alert.bike_id}</strong>
                          <span>{formatCell(alert.type)}</span>
                          <small>{formatCell(alert.message)}</small>
                          <small>{formatTime(alert._time)}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="notification-empty">No open alerts.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <button type="button" onClick={() => void dashboard.refresh()} disabled={dashboard.loadingLatest}>
            {dashboard.loadingLatest ? "Loading..." : "Refresh Data"}
          </button>
        </div>
      </header>

      <section className="statusbar" aria-live="polite">
        <span>{`${dashboard.latestRows.length} bikes`}</span>
        <span>{dashboard.lastUpdated ? `Last updated ${formatTime(dashboard.lastUpdated)}` : "Not loaded yet"}</span>
      </section>

      {dashboard.error ? (
        <section className="error-panel">
          <strong>List query failed</strong>
          <pre>{dashboard.error}</pre>
        </section>
      ) : null}

      <BikeMap
        viewState={dashboard.viewState}
        latestRows={dashboard.latestRows}
        selectedBikeId={dashboard.selectedBikeId}
        openAlertBikeIds={dashboard.openAlertBikeIds}
        rideGeoJson={dashboard.rideGeoJson}
        onViewStateChange={dashboard.setViewState}
        onSelectBike={handleSelectBike}
      />

      <main className="split-layout">
        <BikeList
          rows={dashboard.latestRows}
          loading={dashboard.loadingLatest}
          selectedBikeId={dashboard.selectedBikeId}
          onSelectBike={(bikeId) => handleSelectBike(bikeId)}
        />

        <aside className="panel detail-panel" aria-label="Bike details" ref={detailPanelRef}>
          <BikeDetails
            selectedBike={dashboard.selectedBike}
            selectedRide={dashboard.selectedRide}
            rides={dashboard.rides}
            alerts={dashboard.alerts}
            batterySeries={dashboard.batterySeries}
            loadingHistory={dashboard.loadingHistory}
            loadingAlerts={dashboard.loadingAlerts}
            detailError={dashboard.detailError}
            alertsError={dashboard.alertsError}
            alertActionError={dashboard.alertActionError}
            selectedRideId={dashboard.selectedRideId}
            onSelectRide={handleSelectRide}
            onAcknowledgeAlert={dashboard.acknowledgeAlert}
          />
        </aside>
        <Toaster></Toaster>
      </main>
    </div>
  );
}
