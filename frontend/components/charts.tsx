"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty } from "./ui";

export const PALETTE = ["#2f6fe4", "#13a08d", "#d99a1e", "#7c5cd6", "#8a9ab0", "#d64545", "#3aa0c8"];
const axis = { fontSize: 11, fill: "#5b6b80" };
const tip = { contentStyle: { fontSize: 12, borderRadius: 8, border: "1px solid #e3e8ef" } };
type D = Record<string, any>[];

export function Bars({ data, x, bars, height = 220, money }: { data: D; x: string; bars: { key: string; label: string; color?: string }[]; height?: number; money?: boolean }) {
  if (!data?.length) return <Empty title="No data for this period" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef1f5" />
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => (money && v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
        <Tooltip {...tip} cursor={{ fill: "#f3f6fa" }} formatter={(v) => (money ? `₹${Number(v).toLocaleString("en-IN")}` : v) as any} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />}
        {bars.map((b, i) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color || PALETTE[i]} radius={[4, 4, 0, 0]} maxBarSize={36} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, x, lines, height = 220 }: { data: D; x: string; lines: { key: string; label: string }[]; height?: number }) {
  if (!data?.length) return <Empty title="No data for this period" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef1f5" />
        <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tip} />
        {lines.map((l, i) => <Line key={l.key} dataKey={l.key} name={l.label} stroke={PALETTE[i]} strokeWidth={2} dot={{ r: 2.5 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 220, money }: { data: { name: string; value: number }[]; height?: number; money?: boolean }) {
  if (!data?.length || !data.some((d) => d.value)) return <Empty title="No data yet" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip {...tip} formatter={(v) => (money ? `₹${Number(v).toLocaleString("en-IN")}` : v) as any} />
        <Legend wrapperStyle={{ fontSize: 12, textTransform: "capitalize" }} iconType="circle" iconSize={8} layout="vertical" align="right" verticalAlign="middle" formatter={(v) => <span style={{ color: "#0f1b2d" }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}
