import MapGL, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { OSM_STYLE, type RideGeoJson, type ViewState } from "../utils/bikeAnalytics";
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

  return (
    <section className="panel map-panel" aria-label="Bike position map">
      <div className="map-canvas">
        <MapGL
          {...viewState}
          style={{ width: "100%", height: "100%" }}
          onMove={(event) => onViewStateChange(event.viewState)}
          mapStyle={OSM_STYLE}
        >
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
