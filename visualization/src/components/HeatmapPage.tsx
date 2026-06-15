import { useEffect, useMemo, useState } from "react";
import MapGL, { Layer, NavigationControl, Source } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BikeRow, HeatmapMode, HeatmapTimeRange } from "../types";
import { fetchBikeHeatmapRows } from "../lib/influx";
import {
  DEFAULT_VIEW_STATE,
  OSM_STYLE,
  buildHeatmapGeoJson,
  getViewForCoordinates,
  type ViewState,
} from "../utils/bikeAnalytics";
import { formatTime } from "../utils/format";

type Props = {
  onNavigateHome: () => void;
};

const HEATMAP_COLORS: any = [
  "interpolate",
  ["linear"],
  ["heatmap-density"],
  0,
  "rgba(47, 111, 237, 0)",
  0.2,
  "rgba(47, 111, 237, 0.35)",
  0.4,
  "rgba(47, 158, 68, 0.5)",
  0.6,
  "rgba(255, 193, 7, 0.75)",
  0.8,
  "rgba(214, 69, 69, 0.82)",
  1,
  "rgba(136, 19, 55, 0.95)",
] as const;

function HeatmapToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`toggle-button${active ? " active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

export function HeatmapPage({ onNavigateHome }: Props) {
  const [mode, setMode] = useState<HeatmapMode>("ride");
  const [timeRange, setTimeRange] = useState<HeatmapTimeRange>("24h");
  const [rows, setRows] = useState<BikeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);

  useEffect(() => {
    let active = true;

    async function loadHeatmapData() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchBikeHeatmapRows(mode, timeRange === "all");
        if (!active) {
          return;
        }

        setRows(data);
        setLastUpdated(new Date().toISOString());
        setViewState((current) => getViewForCoordinates(
          data
            .map((row) => ({ lat: row.lat, lng: row.lng }))
            .filter((point): point is { lat: number; lng: number } =>
              typeof point.lat === "number" && typeof point.lng === "number"
            ),
          current
        ));
      } catch (err) {
        if (!active) {
          return;
        }

        setError(err instanceof Error ? err.message : "Failed to load heatmap data");
        setRows([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadHeatmapData();

    return () => {
      active = false;
    };
  }, [mode, timeRange]);

  const heatmapGeoJson = useMemo(() => buildHeatmapGeoJson(rows, mode), [mode, rows]);
  const pointCount = rows.length;

  return (
    <div className="app-shell heatmap-shell">
      <header className="topbar heatmap-topbar">
        <div className="topbar-title">
          <h1>Bike Heatmap</h1>
          <p>{mode === "ride" ? "Riding points" : "Parking points"}</p>
        </div>

        <div className="topbar-actions heatmap-actions">
          <div className="toggle-group" role="group" aria-label="Heatmap mode">
            <HeatmapToggle label="Ride" active={mode === "ride"} onClick={() => setMode("ride")} />
            <HeatmapToggle label="Parking" active={mode === "parking"} onClick={() => setMode("parking")} />
          </div>

          <div className="toggle-group" role="group" aria-label="Time range">
            <HeatmapToggle label="Last 24h" active={timeRange === "24h"} onClick={() => setTimeRange("24h")} />
            <HeatmapToggle label="All data" active={timeRange === "all"} onClick={() => setTimeRange("all")} />
          </div>

          <button type="button" onClick={onNavigateHome}>
            Dashboard
          </button>
        </div>
      </header>

      <section className="statusbar heatmap-status" aria-live="polite">
        <span>{loading ? "Loading heatmap" : `${pointCount} points`}</span>
        <span>{lastUpdated ? `Last updated ${formatTime(lastUpdated)}` : "Not loaded yet"}</span>
        <span>{timeRange === "24h" ? "Last 24 hours" : "All data"}</span>
      </section>

      {error ? (
        <section className="error-panel">
          <strong>Heatmap query failed</strong>
          <pre>{error}</pre>
        </section>
      ) : null}

      <section className="panel heatmap-panel" aria-label="Bike heatmap map">
        <div className="map-canvas">
          <MapGL
            {...viewState}
            style={{ width: "100%", height: "100%" }}
            onMove={(event) => setViewState(event.viewState)}
            mapStyle={OSM_STYLE}
          >
            {heatmapGeoJson ? (
              <Source id="heatmap-points" type="geojson" data={heatmapGeoJson}>
                <Layer
                  id="heatmap-layer"
                  type="heatmap"
                  paint={{
                    "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 1, 1],
                    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 2, 16, 3],
                    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 3, 12, 20, 16, 32],
                    "heatmap-opacity": 0.9,
                    "heatmap-color": HEATMAP_COLORS,
                  }}
                />
              </Source>
            ) : null}

            <NavigationControl position="top-right" />
          </MapGL>
        </div>
      </section>
    </div>
  );
}
