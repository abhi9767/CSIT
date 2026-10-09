import type { Freshness, WorkerRecord, WorkerStatus } from "@/types/telemetry";

export function freshnessOf(
  lastMs: number | null,
  nowMs: number,
  cfg: { staleAfterMs: number; offlineAfterMs: number },
): Freshness {
  if (lastMs === null || Number.isNaN(lastMs)) return "offline";
  const age = nowMs - lastMs;
  if (age >= cfg.offlineAfterMs) return "offline";
  if (age >= cfg.staleAfterMs) return "stale";
  return "live";
}

/** An SOS always outranks staleness: a stale SOS is still an SOS. */
export function workerStatus(w: WorkerRecord, f: Freshness, batteryLowPct: number): WorkerStatus {
  if (w.sos) return "sos";
  if (f === "offline") return "offline";
  if (f === "stale") return "stale";
  if (w.batteryPct <= batteryLowPct) return "battery_low";
  return "active";
}
