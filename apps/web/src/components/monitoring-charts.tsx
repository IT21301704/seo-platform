"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ScorePoint {
  date: string;
  label: string;
  score: number;
}

/** Health score over time; the biggest drop is marked in red (screen 10). */
export function ScoreHistory({
  points,
  drop,
}: {
  points: ScorePoint[];
  drop: { label: string; score: number; text: string } | null;
}) {
  const scores = points.map((p) => p.score);
  const min = Math.max(0, Math.floor((Math.min(...scores, 100) - 5) / 5) * 5);
  return (
    <div
      className="h-[200px] w-full"
      role="img"
      aria-label={`Health score history: ${points.map((p) => `${p.label} ${p.score}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#EDEDE8" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#5C6066" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[min, 100]}
            tick={{ fontSize: 12, fill: "#5C6066" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip formatter={(v) => [String(v), "Health score"]} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#2446C7"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          {drop && (
            <ReferenceDot
              x={drop.label}
              y={drop.score}
              r={5}
              fill="#B42318"
              stroke="none"
              label={{ value: drop.text, position: "bottom", fill: "#B42318", fontSize: 12 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Failing items of one rule per audit (M11 change history, e.g. broken links 34 → 12 → 0). */
export function IssueHistory({
  points,
  rule,
}: {
  points: { label: string; count: number }[];
  rule: string;
}) {
  return (
    <div
      className="h-[150px] w-full"
      role="img"
      aria-label={`${rule} per audit: ${points.map((p) => `${p.label} ${p.count}`).join(", ")}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#5C6066" }}
            tickLine={false}
            axisLine={{ stroke: "#E1E1DC" }}
          />
          <Bar
            dataKey="count"
            fill="#2446C7"
            radius={[3, 3, 0, 0]}
            minPointSize={2}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="count"
              position="top"
              style={{ fontSize: 12, fill: "#1A1D21", fontFamily: "IBM Plex Mono, monospace" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Select that updates one query parameter (range, rule). */
export function QuerySelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      {label}
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set(name, e.target.value);
          router.push(`?${next.toString()}`);
        }}
        className="h-10 rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm font-normal"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
