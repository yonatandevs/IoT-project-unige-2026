import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";
import {
  OSM_STYLE,
  buildParkingZoneGeoJson,
  type RideGeoJson,
  type ViewState,
} from "../utils/bikeAnalytics";
import type { BikeRow } from "../types";

type Props = {
  viewState: ViewState;
  latestRows: BikeRow[];
  selectedBikeId: string | null;
  openAlertBikeIds: string[];
  rideGeoJson: RideGeoJson;
  onViewStateChange: (viewState: ViewState) => void;
  onSelectBike: (bikeId: string, lat: number, lng: number) => void;
};

export function BikeMap({
  viewState,
  latestRows,
  selectedBikeId,
  openAlertBikeIds,
  rideGeoJson,
  onViewStateChange,
  onSelectBike,
}: Props) {
  const openAlertSet = new Set(openAlertBikeIds);
  const parkingZoneGeoJson = useMemo(() => buildParkingZoneGeoJson(), []);
  const [hoveredZoneName, setHoveredZoneName] = useState<string | null>(null);
  const [hoverLngLat, setHoverLngLat] = useState<{ lng: number; lat: number } | null>(null);

  return (
    <section className="panel map-panel" aria-label="Bike position map">
      <div className="map-canvas">
        <MapGL
          {...viewState}
          style={{ width: "100%", height: "100%" }}
          interactiveLayerIds={["parking-zones-fill"]}
          onMove={(event) => onViewStateChange(event.viewState)}
          onMouseMove={(event) => {
            const feature = event.features?.find(
              (value) => value.layer?.id === "parking-zones-fill"
            );

            if (feature && typeof feature.properties?.name === "string") {
              setHoveredZoneName(feature.properties.name);
              setHoverLngLat(event.lngLat);
              return;
            }

            setHoveredZoneName(null);
            setHoverLngLat(null);
          }}
          onMouseLeave={() => {
            setHoveredZoneName(null);
            setHoverLngLat(null);
          }}
          mapStyle={OSM_STYLE}
        >
          {parkingZoneGeoJson ? (
            <Source id="parking-zones" type="geojson" data={parkingZoneGeoJson}>
              <Layer
                id="parking-zones-fill"
                type="fill"
                paint={{
                  "fill-color": "#a7d7a1",
                  "fill-opacity": 0.18,
                }}
              />
              <Layer
                id="parking-zones-outline"
                type="line"
                paint={{
                  "line-color": "#7fbf7a",
                  "line-width": 2,
                  "line-opacity": 0.45,
                }}
              />
            </Source>
          ) : null}

          {rideGeoJson ? (
            <Source id="ride-route" type="geojson" data={rideGeoJson}>
              <Layer
                id="ride-route-line"
                type="line"
                paint={{
                  "line-color": "#d64545",
                  "line-width": 4,
                  "line-opacity": 0.9,
                }}
              />
            </Source>
          ) : null}

          {hoveredZoneName && hoverLngLat ? (
            <Popup
              longitude={hoverLngLat.lng}
              latitude={hoverLngLat.lat}
              closeButton={false}
              closeOnClick={false}
              anchor="top"
              offset={12}
              className="parking-zone-tooltip"
            >
              {hoveredZoneName}
            </Popup>
          ) : null}

          <NavigationControl position="top-right" />

          {latestRows.map((bike) => {
            if (typeof bike.lat !== "number" || typeof bike.lng !== "number") {
              return null;
            }

            const isSelected = bike.id === selectedBikeId;
            const hasOpenAlerts = openAlertSet.has(bike.id);

            return (
              <Marker key={bike.id} longitude={bike.lng} latitude={bike.lat} anchor="center">
                <button
                  type="button"
                  className={`map-marker${hasOpenAlerts ? " alert-open" : " alert-clear"}${isSelected ? " selected" : ""}`}
                  aria-label={`Select ${bike.id}${hasOpenAlerts ? ", has open alerts" : ""}`}
                  title={bike.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectBike(bike.id, bike.lat!, bike.lng!);
                  }}
                />
              </Marker>
            );
          })}
        </MapGL>
      </div>
    </section>
  );
}
