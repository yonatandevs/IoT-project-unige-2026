import MapGL, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { OSM_STYLE, type RideGeoJson, type ViewState } from "../utils/bikeAnalytics";
import type { BikeRow } from "../types";

type Props = {
  viewState: ViewState;
  latestRows: BikeRow[];
  selectedBikeId: string | null;
  rideGeoJson: RideGeoJson;
  onViewStateChange: (viewState: ViewState) => void;
  onSelectBike: (bikeId: string, lat: number, lng: number) => void;
};

export function BikeMap({
  viewState,
  latestRows,
  selectedBikeId,
  rideGeoJson,
  onViewStateChange,
  onSelectBike,
}: Props) {
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

            return (
              <Marker key={bike.id} longitude={bike.lng} latitude={bike.lat} anchor="center">
                <button
                  type="button"
                  className={`map-marker${isSelected ? " selected" : ""}`}
                  aria-label={`Select ${bike.id}`}
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
