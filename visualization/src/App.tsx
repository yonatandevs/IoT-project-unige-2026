import { BikeDetails } from "./components/BikeDetails";
import { BikeList } from "./components/BikeList";
import { BikeMap } from "./components/BikeMap";
import { useBikeDashboard } from "./hooks/useBikeDashboard";
import { DEFAULT_VIEW_STATE, getViewForRows } from "./utils/bikeAnalytics";

export default function App() {
  const dashboard = useBikeDashboard();

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

  const handleSelectRide = (rideId: string) => {
    dashboard.setSelectedRideId(rideId);
  };

  const handleFitBikes = () => {
    dashboard.setViewState(getViewForRows(dashboard.latestRows, DEFAULT_VIEW_STATE));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Bike Telemetry</h1>
        </div>

        <div className="topbar-actions">
          <button type="button" onClick={() => void dashboard.refresh()} disabled={dashboard.loadingLatest}>
            {dashboard.loadingLatest ? "Loading..." : "Refresh Data"}
          </button>
        </div>
      </header>

      <section className="statusbar" aria-live="polite">
        <span>{`${dashboard.latestRows.length} bikes`}</span>
        <span>{dashboard.lastUpdated ? `Last updated ${dashboard.lastUpdated}` : "Not loaded yet"}</span>
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
        rideGeoJson={dashboard.rideGeoJson}
        onViewStateChange={dashboard.setViewState}
        onSelectBike={handleSelectBike}
        onZoomIn={() =>
          dashboard.setViewState((current) => ({
            ...current,
            zoom: Math.min(22, current.zoom + 1),
          }))
        }
        onZoomOut={() =>
          dashboard.setViewState((current) => ({
            ...current,
            zoom: Math.max(0, current.zoom - 1),
          }))
        }
        onFitBikes={handleFitBikes}
      />

      <main className="split-layout">
        <BikeList
          rows={dashboard.latestRows}
          loading={dashboard.loadingLatest}
          selectedBikeId={dashboard.selectedBikeId}
          onSelectBike={(bikeId) => handleSelectBike(bikeId)}
        />

        <aside className="panel detail-panel" aria-label="Bike details">
          <BikeDetails
            selectedBike={dashboard.selectedBike}
            selectedRide={dashboard.selectedRide}
            rides={dashboard.rides}
            batterySeries={dashboard.batterySeries}
            loadingHistory={dashboard.loadingHistory}
            detailError={dashboard.detailError}
            selectedRideId={dashboard.selectedRideId}
            onSelectRide={handleSelectRide}
          />
        </aside>
      </main>
    </div>
  );
}
