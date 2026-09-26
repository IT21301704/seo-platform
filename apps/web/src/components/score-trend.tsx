"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatShortDate } from "@/lib/utils";

export function ScoreTrend({ points }: { points: { date: string; score: number }[] }) {
  const data = points.map((p) => ({ ...p, label: formatShortDate(p.date) }));
  const min = Math.max(0, Math.min(...data.map((d) => d.score)) - 5);
  return (
    <div
      className="h-[120px] w-full"
      role="img"
      aria-label={`Score trend: ${data.map((d) => `${d.label} ${d.score}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#5C6066" }}
            tickLine={false}
            axisLine={{ stroke: "#E1E1DC" }}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[min, 100]} />
          <Tooltip formatter={(v) => [String(v), "Health score"]} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#2446C7"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#2446C7" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
