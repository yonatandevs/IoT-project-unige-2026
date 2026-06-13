import { useEffect, useMemo, useState } from "react";
import {
  acknowledgeBikeAlert,
  fetchAllBikeAlertAcknowledgements,
  fetchAllBikeAlerts,
  fetchBikeHistory,
  fetchLatestBikeRows,
} from "../lib/influx";
import type { AlertAckRow, AlertRow, BikeRow } from "../types";
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
  const [alertRows, setAlertRows] = useState<AlertRow[]>([]);
  const [ackRows, setAckRows] = useState<AlertAckRow[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertActionError, setAlertActionError] = useState<string | null>(null);
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

  async function loadAlertData() {
    setLoadingAlerts(true);
    setAlertsError(null);

    try {
      const [alertsData, ackData] = await Promise.all([
        fetchAllBikeAlerts(),
        fetchAllBikeAlertAcknowledgements(),
      ]);
      setAlertRows(alertsData);
      setAckRows(ackData);
    } catch (err) {
      setAlertsError(err instanceof Error ? err.message : "Failed to load bike alerts");
      setAlertRows([]);
      setAckRows([]);
    } finally {
      setLoadingAlerts(false);
    }
  }

  useEffect(() => {
    void loadLatestRows();
    void loadAlertData();
  }, []);

  useEffect(() => {
    const bikeId = selectedBikeId;

    if (!bikeId) {
      setHistoryRows([]);
      setSelectedRideId(null);
      setAlertActionError(null);
      setLoadingHistory(false);
      return;
    }

    setSelectedRideId(null);
    setHistoryRows([]);

    let active = true;

    async function loadHistory(targetBikeId: string) {
      setLoadingHistory(true);
      setDetailError(null);

      try {
        const data = await fetchBikeHistory(targetBikeId);
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

    void loadHistory(bikeId);

    return () => {
      active = false;
    };
  }, [selectedBikeId]);

  async function acknowledgeAlert(bikeId: string, alertId: string) {
    if (!bikeId) {
      return;
    }

    setAlertActionError(null);

    try {
      await acknowledgeBikeAlert(bikeId, alertId);
      setAckRows((current) => {
        if (current.some((row) => row.alert_id === alertId)) {
          return current;
        }

        return [
          {
            _time: new Date().toISOString(),
            bike_id: bikeId,
            alert_id: alertId,
            acked: true,
            source: "visualization",
          },
          ...current,
        ];
      });
    } catch (err) {
      setAlertActionError(err instanceof Error ? err.message : "Failed to acknowledge alert");
    }
  }

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
  const alerts = useMemo(() => {
    const acknowledgedIds = new Set(
      ackRows.filter((row) => row.acked !== false).map((row) => row.alert_id)
    );

    return alertRows.map((row) => ({
      ...row,
      acknowledged: row.acknowledged === true || acknowledgedIds.has(row.alert_id ?? ""),
    }));
  }, [ackRows, alertRows]);
  const selectedBikeAlerts = useMemo(
    () => alerts.filter((row) => row.bike_id === selectedBikeId),
    [alerts, selectedBikeId]
  );
  const openAlerts = useMemo(() => alerts.filter((row) => !row.acknowledged), [alerts]);
  const openAlertBikeIds = useMemo(() => {
    return Array.from(new Set(openAlerts.map((row) => row.bike_id)));
  }, [openAlerts]);

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
    alerts: selectedBikeAlerts,
    openAlerts,
    openAlertBikeIds,
    rideGeoJson,
    loadingLatest,
    loadingHistory,
    loadingAlerts,
    error,
    detailError,
    alertsError,
    alertActionError,
    lastUpdated,
    viewState,
    setViewState,
    setSelectedBikeId,
    setSelectedRideId,
    acknowledgeAlert,
    refresh: () => {
      void loadLatestRows();
      void loadAlertData();
    },
  };
}
