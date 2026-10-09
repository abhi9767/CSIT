"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { freshnessOf } from "@/lib/freshness";
import type { Band, PublicConfig, RiskLevel, SenseReading, SensorNodeView } from "@/types/telemetry";
import { Badge, RISK_TONE, fmtAge } from "./ui";

interface Props {
  sensors: SensorNodeView[];
  history: Record<string, SenseReading[]>;
  config: PublicConfig;
  now: number;
  linkLost: boolean;
}

const band = (v: number | null, b: Band): RiskLevel => (v === null ? "normal" : v >= b.danger ? "danger" : v >= b.warn ? "warning" : "normal");
const show = (v: number | null, d = 0) => (v === null ? null : v.toFixed(d));
const hhmm = (v: number) => new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Metric(p: { label: string; value: string | null; unit: string; note?: string; risk: RiskLevel; stale: boolean }) {
  const border = p.risk === "danger" ? "border-red-500" : p.risk === "warning" ? "border-amber-400" : "border-zinc-800";
  return (
    <div className={`rounded-lg border-2 bg-zinc-900 p-3 ${border}`}>
      <div className="flex items-center justify-between text-sm text-zinc-400">
        {p.label} {p.stale && <Badge tone="stale">Stale data</Badge>}
      </div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${p.stale ? "text-zinc-500" : "text-zinc-50"}`}>
        {p.value ?? "No reading"}
        {p.value !== null && <span className="ml-1 text-base text-zinc-400">{p.unit}</span>}
      </div>
      <div className="h-4 text-xs text-zinc-400">{p.note}</div>
    </div>
  );
}

interface Series { key: string; label: string; color: string }
function ChartCard(p: { title: string; data: Record<string, number | null>[]; lines: Series[]; refs?: { y: number; color: string }[] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <h3 className="mb-1 flex flex-wrap gap-x-3 text-sm font-medium">
        {p.title}
        {p.lines.map((l) => <span key={l.key} className="text-xs font-normal" style={{ color: l.color }}>{l.label}</span>)}
      </h3>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={p.data}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={hhmm} stroke="#71717a" fontSize={11} />
          <YAxis stroke="#71717a" fontSize={11} width={36} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} labelFormatter={(v) => new Date(v as number).toLocaleTimeString("en-GB")} />
          {p.refs?.map((r) => <ReferenceLine key={r.y} y={r.y} stroke={r.color} strokeDasharray="4 4" />)}
          {p.lines.map((l) => <Line key={l.key} dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SensorPanel({ sensors, history, config, now, linkLost }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const node = sensors.find((s) => s.nodeId === sel) ?? sensors[0];
  const rows = history[node?.nodeId ?? ""];
  const data = useMemo(
    () => (rows ?? []).map((r) => ({
      t: Date.parse(r.observedAt), rain: r.rainPct, water: r.waterLevelCm, soil: r.soilMoisturePct, temp: r.temperatureC, hum: r.humidityPct,
    })),
    [rows],
  );

  if (!node) {
    return <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">Waiting for the first RAKSHA SENSE packet. Charts and readings appear as soon as a node reports.</section>;
  }

  const last = node.lastReceivedAt ? Date.parse(node.lastReceivedAt) : null;
  const fresh = freshnessOf(last, now, config);
  const stale = fresh !== "live" || linkLost;
  const r = node.latest;

  return (
    <section aria-label="Environmental sensors" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {sensors.map((s) => (
          <button key={s.nodeId} onClick={() => setSel(s.nodeId)} aria-pressed={s.nodeId === node.nodeId}
            className={`rounded border px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${s.nodeId === node.nodeId ? "border-sky-500 bg-zinc-800" : "border-zinc-700"}`}>
            {s.nodeId}
          </button>
        ))}
        <Badge tone={fresh === "live" ? "ok" : fresh === "stale" ? "stale" : "offline"}>
          {fresh === "live" ? "Live" : fresh === "stale" ? "Stale data" : "Offline"}
        </Badge>
        <span className="text-xs text-zinc-400">{last ? `last packet ${fmtAge(now - last)} ago` : "no packets yet"}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Rain" unit="%" value={show(r?.rainPct ?? null)} risk={band(r?.rainPct ?? null, config.rain)} stale={stale} />
        <Metric label="Water level" unit="cm" value={show(r?.waterLevelCm ?? null, 1)} risk={band(r?.waterLevelCm ?? null, config.water)} stale={stale}
          note={r?.waterRiseCmPerMin != null ? `${r.waterRiseCmPerMin > 0 ? "+" : ""}${r.waterRiseCmPerMin} cm/min` : undefined} />
        <Metric label="Soil moisture" unit="%" value={show(r?.soilMoisturePct ?? null)} risk={band(r?.soilMoisturePct ?? null, config.soil)} stale={stale} />
        <Metric label="Temp / humidity" unit="°C" value={show(r?.temperatureC ?? null, 1)} risk="normal" stale={stale}
          note={r?.humidityPct != null ? `${r.humidityPct.toFixed(0)}% humidity` : undefined} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Water level (cm)" data={data} lines={[{ key: "water", label: "Level", color: "#38bdf8" }]}
          refs={[{ y: config.water.warn, color: "#fbbf24" }, { y: config.water.danger, color: "#ef4444" }]} />
        <ChartCard title="Rain intensity (%)" data={data} lines={[{ key: "rain", label: "Rain", color: "#a78bfa" }]}
          refs={[{ y: config.rain.warn, color: "#fbbf24" }, { y: config.rain.danger, color: "#ef4444" }]} />
        <ChartCard title="Soil moisture (%)" data={data} lines={[{ key: "soil", label: "Soil", color: "#34d399" }]}
          refs={[{ y: config.soil.warn, color: "#fbbf24" }, { y: config.soil.danger, color: "#ef4444" }]} />
        <ChartCard title="Temperature and humidity" data={data}
          lines={[{ key: "temp", label: "°C", color: "#fb923c" }, { key: "hum", label: "% RH", color: "#94a3b8" }]} />
      </div>
    </section>
  );
}
