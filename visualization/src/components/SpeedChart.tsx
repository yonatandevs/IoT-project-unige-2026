import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTime } from "../utils/format";

export function SpeedChart({
  series,
}: {
  series: Array<{ time: string; speed: number }>;
}) {
  if (series.length === 0) {
    return <div className="empty-chart">No speed history available.</div>;
  }

  const data = series.map((point) => ({
    time: Date.parse(point.time),
    speed: Math.round(point.speed * 100) / 100,
  }));

  const maxSpeed = Math.max(...data.map((point) => point.speed));
  const yMax = Number.isFinite(maxSpeed) ? Math.max(5, Math.ceil(maxSpeed / 5) * 5) : 5;

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value) => formatTime(Number(value))}
            tick={{ fill: "#66788a", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "#c8d3e0" }}
          />
          <YAxis
            domain={[0, yMax]}
            tickFormatter={(value) => `${value} km/h`}
            tick={{ fill: "#66788a", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "#c8d3e0" }}
            width={56}
          />
          <Tooltip
            labelFormatter={(label) => formatTime(Number(label))}
            formatter={(value) => [`${Number(value).toFixed(2)} km/h`, "Speed"]}
          />
          <Line
            type="monotone"
            dataKey="speed"
            stroke="#d64545"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
