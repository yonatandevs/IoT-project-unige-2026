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

export function BatteryChart({
  series,
}: {
  series: Array<{ time: string; battery: number }>;
}) {
  if (series.length === 0) {
    return <div className="empty-chart">No battery history available.</div>;
  }

  const data = series.map((point) => ({
    time: Date.parse(point.time),
    battery: Math.round(point.battery),
  }));

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
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(value) => `${value}%`}
            tick={{ fill: "#66788a", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "#c8d3e0" }}
            width={48}
          />
          <Tooltip
            labelFormatter={(label) => formatTime(Number(label))}
            formatter={(value) => [`${value}%`, "Battery"]}
          />
          <Line
            type="monotone"
            dataKey="battery"
            stroke="#2f6fed"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
