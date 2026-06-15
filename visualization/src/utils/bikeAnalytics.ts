import type { StyleSpecification } from "maplibre-gl";
import type { BikeRow, HeatmapMode } from "../types";
import parkingZonesConfig from "../../../shared/parking-zones.json";

export type RideSummary = {
  id: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  averageSpeed: number | null;
  maxSpeed: number | null;
  sampleCount: number;
  routePoints: Array<{ lat: number; lng: number }>;
};

export type ViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

export const DEFAULT_VIEW_STATE: ViewState = {
  longitude: 8.9463,
  latitude: 44.4056,
  zoom: 12,
  pitch: 0,
  bearing: 0,
};

export const OSM_STYLE: StyleSpecification = {
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

export type RideGeoJson =
  | {
      type: "FeatureCollection";
      features: Array<{
        type: "Feature";
        properties: { kind: "route" };
        geometry: { type: "LineString"; coordinates: Array<[number, number]> };
      }>;
    }
  | null;

export type HeatmapGeoJson =
  | {
      type: "FeatureCollection";
      features: Array<{
        type: "Feature";
        properties: { weight: number };
        geometry: { type: "Point"; coordinates: [number, number] };
      }>;
    }
  | null;

type ParkingZone = {
  zone_id: string;
  name: string;
  center: { lat: number; lng: number };
  radius: number;
};

type ParkingZoneConfig = {
  city: string;
  zones: ParkingZone[];
};

type ParkingZoneGeoJson =
  | {
      type: "FeatureCollection";
      features: Array<{
        type: "Feature";
        properties: { zone_id: string; name: string; radius: number };
        geometry: { type: "Polygon"; coordinates: Array<Array<[number, number]>> };
      }>;
    }
  | null;

const parkingZones = parkingZonesConfig as ParkingZoneConfig;

function buildCircleCoordinates(
  center: { lat: number; lng: number },
  radiusMeters: number,
  steps = 64
): Array<[number, number]> {
  const earthRadiusMeters = 6_371_000;
  const coordinates: Array<[number, number]> = [];
  const latRad = (center.lat * Math.PI) / 180;
  const lngRad = (center.lng * Math.PI) / 180;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinDistance = Math.sin(angularDistance);
  const cosDistance = Math.cos(angularDistance);

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (2 * Math.PI * index) / steps;
    const nextLat = Math.asin(
      sinLat * cosDistance + cosLat * sinDistance * Math.cos(bearing)
    );
    const nextLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * sinDistance * cosLat,
        cosDistance - sinLat * Math.sin(nextLat)
      );

    coordinates.push([(nextLng * 180) / Math.PI, (nextLat * 180) / Math.PI]);
  }

  return coordinates;
}

export function getViewForRows(rows: BikeRow[], fallback: ViewState): ViewState {
  const coordinates = rows
    .map(({ lat, lng}) => ({ lat, lng }))
    .filter((value): value is { lat: number; lng: number } =>
      typeof value.lat === "number" && typeof value.lng === "number"
    );

  return getViewForCoordinates(coordinates, fallback);
}

export function getViewForCoordinates(
  coordinates: Array<{ lat: number; lng: number }>,
  fallback: ViewState
): ViewState {
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

  return {
    longitude,
    latitude,
    zoom: 12,
    pitch: 0,
    bearing: 0,
  };
}

export function summarizeRides(rows: BikeRow[]): RideSummary[] {
  const groups = new globalThis.Map<string, BikeRow[]>();

  for (const row of rows) {
    const rideId = typeof row.current_ride === "string" ? row.current_ride.trim() : "";
    if (!rideId) {
      continue;
    }

    const bucket = groups.get(rideId);
    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(rideId, [row]);
    }
  }

  return Array.from(groups.entries())
    .map(([rideId, rideRows]) => {
      const sortedRows = [...rideRows].sort((a, b) => Date.parse(a._time) - Date.parse(b._time));
      const timestamps = sortedRows.map((row) => Date.parse(row._time)).filter(Number.isFinite);
      const speeds = sortedRows
        .map((row) => row.current_speed)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const routePoints = sortedRows
        .map((row) => ({ lat: row.lat, lng: row.lng }))
        .filter((point): point is { lat: number; lng: number } =>
          typeof point.lat === "number" && typeof point.lng === "number"
        );

      const durationMs =
        timestamps.length >= 2 ? Math.max(0, timestamps[timestamps.length - 1] - timestamps[0]) : 0;
      const averageSpeed =
        speeds.length > 0 ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : null;
      const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;

      return {
        id: rideId,
        startTime: sortedRows[0]?._time ?? "",
        endTime: sortedRows[sortedRows.length - 1]?._time ?? "",
        durationMs,
        averageSpeed,
        maxSpeed,
        sampleCount: sortedRows.length,
        routePoints,
      };
    })
    .sort((a, b) => Date.parse(b.endTime) - Date.parse(a.endTime));
}

export function buildRideGeoJson(ride: RideSummary | null): RideGeoJson {
  if (!ride || ride.routePoints.length < 2) {
    return null;
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "route" },
        geometry: {
          type: "LineString",
          coordinates: ride.routePoints.map((point) => [point.lng, point.lat] as [number, number]),
        },
      },
    ],
  };
}

export function buildBatterySeries(rows: BikeRow[]) {
  return rows
    .map((row) => ({
      time: row._time,
      battery: typeof row.battery === "number" ? row.battery : null,
    }))
    .filter((point): point is { time: string; battery: number } => point.battery !== null)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

export function buildHeatmapGeoJson(rows: BikeRow[], mode: HeatmapMode): HeatmapGeoJson {
  const features = rows
    .filter((row) => {
      if (typeof row.lat !== "number" || typeof row.lng !== "number") {
        return false;
      }

      if (mode === "ride") {
        return typeof row.current_ride === "string" && row.current_ride.trim() !== "";
      } else {
        return row.locked === true;
      }
    })
    .map((row) => ({
      type: "Feature" as const,
      properties: { weight: 1 },
      geometry: {
        type: "Point" as const,
        coordinates: [row.lng, row.lat] as [number, number],
      },
    }));

  if (features.length === 0) {
    return null;
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildParkingZoneGeoJson(): ParkingZoneGeoJson {
  const features = parkingZones.zones
    .filter(
      (zone) =>
        typeof zone.center?.lat === "number" &&
        typeof zone.center?.lng === "number" &&
        typeof zone.radius === "number" &&
        Number.isFinite(zone.radius)
    )
    .map((zone) => ({
      type: "Feature" as const,
      properties: {
        zone_id: zone.zone_id,
        name: zone.name,
        radius: zone.radius,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [buildCircleCoordinates(zone.center, zone.radius)],
      },
    }));

  if (features.length === 0) {
    return null;
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
