import { useEffect, useMemo, useState } from "react";
import { fetchBikeHistory, fetchLatestBikeRows } from "../lib/influx";
import type { BikeRow } from "../types";
import {
  DEFAULT_VIEW_STATE,
  buildBatterySeries,
  buildRideGeoJson,
  getViewForCoordinates,
  getViewForRows,
  summarizeRides,
  type ViewState,
} from "../utils/bikeAnalytics";

export function useBikeDashboard() {
  const [latestRows, setLatestRows] = useState<BikeRow[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(null);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<BikeRow[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);

  async function loadLatestRows() {
    setLoadingLatest(true);
    setError(null);

    try {
      const data = await fetchLatestBikeRows();
      setLatestRows(data);
      setLastUpdated(new Date().toISOString());
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
      setSelectedRideId(null);
      return;
    }

    setSelectedRideId(null);
    setHistoryRows([]);

    let active = true;

    async function loadHistory() {
      setLoadingHistory(true);
      setDetailError(null);

      try {
        const data = await fetchBikeHistory(selectedBikeId!);
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
  const rides = useMemo(() => summarizeRides(historyRows), [historyRows]);
  const selectedRide = useMemo(
    () => rides.find((ride) => ride.id === selectedRideId) ?? null,
    [rides, selectedRideId]
  );
  const batterySeries = useMemo(() => buildBatterySeries(historyRows), [historyRows]);
  const rideGeoJson = useMemo(() => buildRideGeoJson(selectedRide), [selectedRide]);

  useEffect(() => {
    if (rides.length === 0) {
      setSelectedRideId(null);
      return;
    }

    setSelectedRideId((current) => {
      if (current && rides.some((ride) => ride.id === current)) {
        return current;
      }
      return rides[0]?.id ?? null;
    });
  }, [rides]);

  useEffect(() => {
    if (!selectedRide) {
      return;
    }

    setViewState((current) => getViewForCoordinates(selectedRide.routePoints, current));
  }, [selectedRide]);

  return {
    latestRows,
    selectedBikeId,
    selectedRideId,
    selectedBike,
    selectedRide,
    rides,
    batterySeries,
    rideGeoJson,
    loadingLatest,
    loadingHistory,
    error,
    detailError,
    lastUpdated,
    viewState,
    setViewState,
    setSelectedBikeId,
    setSelectedRideId,
    refresh: loadLatestRows,
  };
}
