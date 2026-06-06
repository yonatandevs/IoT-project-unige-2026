import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchBikeHistory, fetchLatestBikeRows } from "./lib/influx";
import { bikeColumns, type BikeRow } from "./types";

type BikeMetrics = {
  averageSpeed: number;
  maxSpeed: number;
  sampleCount: number;
};

type ViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

const DEFAULT_VIEW_STATE: ViewState = {
  longitude: 8.9463,
  latitude: 44.4056,
  zoom: 12,
  pitch: 0,
  bearing: 0,
};

const OSM_STYLE: StyleSpecification = {
  version: 8,
  name: "OpenStreetMap Raster",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
} as const;

export default function App() {
  const [latestRows, setLatestRows] = useState<BikeRow[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<BikeRow[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);
  const mapRef = useRef<MapRef | null>(null);

  async function loadLatestRows() {
    setLoadingLatest(true);
    setError(null);

    try {
      const data = await fetchLatestBikeRows();
      setLatestRows(data);
      setLastUpdated(new Date().toLocaleString());
      setSelectedBikeId((current) => {
        if (current && data.some((row) => row.id === current)) {
          return current;
        }
        return data[0]?.id ?? null;
      });
      setViewState((current) => getViewForRows(data, current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bike data");
    } finally {
      setLoadingLatest(false);
    }
  }

  useEffect(() => {
    void loadLatestRows();
  }, []);

  useEffect(() => {
    if (!selectedBikeId) {
      setHistoryRows([]);
      return;
    }

    let active = true;

    async function loadHistory() {
      setLoadingHistory(true);
      setDetailError(null);

      try {
        const data = await fetchBikeHistory(selectedBikeId);
        if (active) {
          setHistoryRows(data);
        }
      } catch (err) {
        if (active) {
          setDetailError(err instanceof Error ? err.message : "Failed to load bike details");
          setHistoryRows([]);
        }
      } finally {
        if (active) {
          setLoadingHistory(false);
        }
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [selectedBikeId]);

  const selectedBike = useMemo(
    () => latestRows.find((row) => row.id === selectedBikeId) ?? null,
    [latestRows, selectedBikeId]
  );

  const metrics = useMemo(() => computeBikeMetrics(historyRows), [historyRows]);
  const batterySeries = useMemo(() => buildBatterySeries(historyRows), [historyRows]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Bike Telemetry</h1>
          <p>Latest readings on the map and in the list, details on the right.</p>
        </div>

        <div className="topbar-actions">
          <button type="button" onClick={() => void loadLatestRows()} disabled={loadingLatest}>
            {loadingLatest ? "Loading..." : "Refresh"}
          </button>
        </div>
      </header>

      <section className="statusbar" aria-live="polite">
        <span>{`${latestRows.length} bikes`}</span>
        <span>{lastUpdated ? `Last updated ${lastUpdated}` : "Not loaded yet"}</span>
      </section>

      {error ? (
        <section className="error-panel">
          <strong>List query failed</strong>
          <pre>{error}</pre>
        </section>
      ) : null}

      <section className="panel map-panel" aria-label="Bike position map">
        <div className="map-canvas">
          <Map
            ref={mapRef}
            {...viewState}
            style={{ width: "100%", height: "100%" }}
            onMove={(event) => setViewState(event.viewState)}
            mapStyle={OSM_STYLE}
          >
            {latestRows.map((bike) => {
              if (typeof bike.lat !== "number" || typeof bike.lng !== "number") {
                return null;
              }

              const isSelected = bike.id === selectedBikeId;

              return (
                <Marker
                  key={bike.id}
                  longitude={bike.lng}
                  latitude={bike.lat}
                  anchor="center"
                >
                  <button
                    type="button"
                    className={`map-marker${isSelected ? " selected" : ""}`}
                    aria-label={`Select ${bike.id}`}
                    title={bike.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedBikeId(bike.id);
                      setViewState((current) => ({
                        ...current,
                        longitude: bike.lng!,
                        latitude: bike.lat!,
                      }));
                    }}
                  />
                </Marker>
              );
            })}
          </Map>

          <div className="map-controls" aria-label="Map controls">
            <button type="button" onClick={() => setViewState((current) => ({ ...current, zoom: clamp(0, 22, current.zoom + 1) }))} aria-label="Zoom in" title="Zoom in">
              <SvgPlus />
            </button>
            <button type="button" onClick={() => setViewState((current) => ({ ...current, zoom: clamp(0, 22, current.zoom - 1) }))} aria-label="Zoom out" title="Zoom out">
              <SvgMinus />
            </button>
            <button type="button" onClick={() => setViewState(getViewForRows(latestRows, DEFAULT_VIEW_STATE))} aria-label="Fit bikes" title="Fit bikes">
              <SvgTarget />
            </button>
          </div>
        </div>
      </section>

      <main className="split-layout">
        <section className="panel list-panel" aria-label="Latest bike list">
          <div className="panel-heading">
            <h2>Latest bikes</h2>
            <span>{loadingLatest ? "Loading" : `${latestRows.length} rows`}</span>
          </div>

          <div className="table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>id</th>
                  <th>status</th>
                  <th>locked</th>
                  <th>battery</th>
                  <th>speed</th>
                  <th>time</th>
                </tr>
              </thead>
              <tbody>
                {latestRows.map((row) => {
                  const isSelected = row.id === selectedBikeId;

                  return (
                    <tr
                      key={row.id}
                      className={isSelected ? "selected" : undefined}
                      onClick={() => setSelectedBikeId(row.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedBikeId(row.id);
                        }
                      }}
                    >
                      <td>{row.id}</td>
                      <td>{formatCell(row.status)}</td>
                      <td>{formatCell(row.locked)}</td>
                      <td>{formatCell(row.battery)}</td>
                      <td>{formatCell(row.current_speed)}</td>
                      <td>{formatTime(row._time)}</td>
                    </tr>
                  );
                })}
                {!loadingLatest && latestRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No bike data found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel detail-panel" aria-label="Bike details">
          {selectedBike ? (
            <>
              <div className="panel-heading">
                <div>
                  <h2>{selectedBike.id}</h2>
                  <span>{formatTime(selectedBike._time)}</span>
                </div>
                <span>{selectedBike.status ?? "unknown"}</span>
              </div>

              {detailError ? (
                <section className="error-panel inline">
                  <strong>History query failed</strong>
                  <pre>{detailError}</pre>
                </section>
              ) : null}

              <section className="detail-grid">
                <div>
                  <label>Average speed</label>
                  <strong>{formatMetric(metrics?.averageSpeed, "km/h")}</strong>
                </div>
                <div>
                  <label>Max speed</label>
                  <strong>{formatMetric(metrics?.maxSpeed, "km/h")}</strong>
                </div>
                <div>
                  <label>Samples</label>
                  <strong>{metrics ? metrics.sampleCount : "—"}</strong>
                </div>
                <div>
                  <label>Battery</label>
                  <strong>{formatCell(selectedBike.battery)}%</strong>
                </div>
              </section>

              <section className="detail-grid detail-grid-wide">
                <div>
                  <label>Position</label>
                  <strong>
                    {formatCell(selectedBike.lat)}
                    {", "}
                    {formatCell(selectedBike.lng)}
                  </strong>
                </div>
                <div>
                  <label>Ride</label>
                  <strong>{formatCell(selectedBike.current_ride)}</strong>
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
                      {bikeColumns.map((column) => (
                        <tr key={column}>
                          <th>{column}</th>
                          <td>{formatCell(selectedBike[column])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <div className="empty-state">
              {loadingLatest ? "Loading bikes..." : "Select a bike to see details."}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

function getViewForRows(rows: BikeRow[], fallback: ViewState): ViewState {
  const coordinates = rows
    .map((row) => ({ lat: row.lat, lng: row.lng }))
    .filter((value): value is { lat: number; lng: number } =>
      typeof value.lat === "number" && typeof value.lng === "number"
    );

  if (coordinates.length === 0) {
    return fallback;
  }

  if (coordinates.length === 1) {
    return {
      longitude: coordinates[0].lng,
      latitude: coordinates[0].lat,
      zoom: 14,
      pitch: 0,
      bearing: 0,
    };
  }

  const lngs = coordinates.map((point) => point.lng);
  const lats = coordinates.map((point) => point.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const longitude = (minLng + maxLng) / 2;
  const latitude = (minLat + maxLat) / 2;
  const span = Math.max(maxLng - minLng, maxLat - minLat);
  const zoom = clamp(5, 14, 13 - Math.log2(Math.max(span, 0.0005) * 300));

  return {
    longitude,
    latitude,
    zoom,
    pitch: 0,
    bearing: 0,
  };
}

function computeBikeMetrics(rows: BikeRow[]): BikeMetrics | null {
  const speeds = rows
    .map((row) => row.current_speed)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (speeds.length === 0) {
    return null;
  }

  const sum = speeds.reduce((total, value) => total + value, 0);
  return {
    averageSpeed: sum / speeds.length,
    maxSpeed: Math.max(...speeds),
    sampleCount: rows.length,
  };
}

function buildBatterySeries(rows: BikeRow[]) {
  return rows
    .map((row) => ({
      time: row._time,
      battery: typeof row.battery === "number" ? row.battery : null,
    }))
    .filter((point): point is { time: string; battery: number } => point.battery !== null)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

function BatteryChart({
  series,
}: {
  series: Array<{ time: string; battery: number }>;
}) {
  if (series.length === 0) {
    return <div className="empty-chart">No battery history available.</div>;
  }

  const width = 780;
  const height = 220;
  const padding = 24;
  const values = series.map((point) => point.battery);
  const minBattery = Math.min(...values);
  const maxBattery = Math.max(...values);
  const timeValues = series.map((point) => Date.parse(point.time));
  const minTime = Math.min(...timeValues);
  const maxTime = Math.max(...timeValues);
  const xSpan = Math.max(1, maxTime - minTime);
  const ySpan = Math.max(1, maxBattery - minBattery);

  const points = series
    .map((point) => {
      const x = padding + ((Date.parse(point.time) - minTime) / xSpan) * (width - padding * 2);
      const y = padding + (1 - (point.battery - minBattery) / ySpan) * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Battery level over time chart">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
        <polyline points={points} />
        {series.map((point, index) => {
          const x = padding + ((Date.parse(point.time) - minTime) / xSpan) * (width - padding * 2);
          const y = padding + (1 - (point.battery - minBattery) / ySpan) * (height - padding * 2);
          return <circle key={`${point.time}-${index}`} cx={x} cy={y} r={3.5} />;
        })}
      </svg>

      <div className="chart-labels">
        <span>{formatTime(series[0].time)}</span>
        <span>{formatTime(series[series.length - 1].time)}</span>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }

  return String(value);
}

function formatMetric(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(2)} ${unit}`;
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(timestamp);
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

function SvgPlus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5h2v14h-2z" />
      <path d="M5 11h14v2H5z" />
    </svg>
  );
}

function SvgMinus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 11h14v2H5z" />
    </svg>
  );
}

function SvgTarget() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 3h2v4h-2zM11 17h2v4h-2zM3 11h4v2H3zM17 11h4v2h-4z" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
