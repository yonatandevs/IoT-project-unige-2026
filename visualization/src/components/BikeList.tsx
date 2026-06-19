import type { BikeRow } from "../types";
import { formatPercent, formatTime } from "../utils/format";

type Props = {
  rows: BikeRow[];
  bikeUsageById: Record<string, number | null | undefined>;
  loading: boolean;
  selectedBikeId: string | null;
  onSelectBike: (bikeId: string) => void;
};

export function BikeList({ rows, bikeUsageById, loading, selectedBikeId, onSelectBike }: Props) {
  return (
    <section className="panel list-panel" aria-label="Latest bike list">
      <div className="panel-heading">
        <h2>Bikes</h2>
        <span>{loading ? "Loading" : `${rows.length} rows`}</span>
      </div>

      <div className="table-wrap compact">
        <table>
          <thead>
            <tr>
              <th>id</th>
              <th>status</th>
              <th>locked</th>
              <th>battery</th>
              <th>usage</th>
              <th>last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = row.id === selectedBikeId;

              return (
                <tr
                  key={row.id}
                  className={isSelected ? "selected" : undefined}
                  onClick={() => onSelectBike(row.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectBike(row.id);
                    }
                  }}
                >
                  <td>{row.id}</td>
                  <td>{row.status ?? "—"}</td>
                  <td>{row.locked ? "true" : "false"}</td>
                  <td>{formatPercent(row.battery)}</td>
                  <td>{formatPercent(bikeUsageById[row.id])}</td>
                  <td>{formatTime(row._time)}</td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6}>No bike data found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
