import type { ReactNode } from "react";
import type { RiskLevel, Severity, WorkerStatus } from "@/types/telemetry";

export type Tone = "sos" | "danger" | "warning" | "ok" | "stale" | "offline";
const TONES: Record<Tone, string> = {
  sos: "bg-red-600 text-white border-red-200 motion-safe:animate-pulse",
  danger: "bg-red-950 text-red-100 border-red-500",
  warning: "bg-amber-400 text-black border-amber-200",
  ok: "bg-emerald-950 text-emerald-200 border-emerald-600",
  stale: "bg-zinc-900 text-amber-300 border-amber-500 border-dashed",
  offline: "bg-zinc-800 text-zinc-300 border-zinc-500 border-dashed",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export const STATUS_TONE: Record<WorkerStatus, Tone> = { sos: "sos", battery_low: "warning", active: "ok", stale: "stale", offline: "offline" };
export const STATUS_LABEL: Record<WorkerStatus, string> = { sos: "SOS", battery_low: "Battery low", active: "Active", stale: "Stale data", offline: "Offline" };
export const RISK_TONE: Record<RiskLevel, Tone> = { normal: "ok", warning: "warning", danger: "danger" };
export const SEVERITY_TONE: Record<Severity, Tone> = { sos: "sos", danger: "danger", warning: "warning" };

export function fmtAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-GB") : "never";
}
