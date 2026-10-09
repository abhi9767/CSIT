import { CONFIG, waterConfigFor } from "@/lib/config";
import type { AlertKind, RiskLevel, SenseReading, Severity, WorkerRecord } from "@/types/telemetry";

export interface Finding {
  kind: AlertKind;
  severity: Severity;
  title: string;
  detail: string;
}

export const SEVERITY_RANK: Record<Severity, number> = { warning: 1, danger: 2, sos: 3 };

export const SENSE_KINDS: AlertKind[] = [
  "water_level_high", "water_rising_fast", "heavy_rain", "soil_saturated", "landslide_risk", "heat",
];
export const RESCUE_AUTOCLEAR_KINDS: AlertKind[] = ["battery_low"]; // SOS is never auto-cleared

export function riskOf(findings: Finding[]): RiskLevel {
  if (findings.some((f) => f.severity !== "warning")) return "danger";
  return findings.length ? "warning" : "normal";
}

export function waterLevel(distanceCm: number | null, mountHeightCm: number): number | null {
  return distanceCm === null ? null : Math.max(0, +(mountHeightCm - distanceCm).toFixed(1));
}

/** Rise rate in cm/min, smoothed over the 3 oldest readings inside the window. */
export function riseRate(history: SenseReading[], level: number | null, observedMs: number): number | null {
  if (level === null) return null;
  const prior = history
    .filter((r) => {
      const t = Date.parse(r.observedAt);
      return r.waterLevelCm !== null && t >= observedMs - CONFIG.riseWindowMs && t <= observedMs - 60_000;
    })
    .slice(0, 3);
  if (!prior.length) return null;
  const avgLevel = prior.reduce((s, r) => s + (r.waterLevelCm ?? 0), 0) / prior.length;
  const avgT = prior.reduce((s, r) => s + Date.parse(r.observedAt), 0) / prior.length;
  return +((level - avgLevel) / ((observedMs - avgT) / 60_000)).toFixed(2);
}

export function evaluateSense(r: SenseReading): Finding[] {
  const w = waterConfigFor(r.nodeId);
  const out: Finding[] = [];
  const at = r.nodeId;

  if (r.waterLevelCm !== null) {
    if (r.waterLevelCm >= w.dangerLevelCm)
      out.push({ kind: "water_level_high", severity: "danger", title: `Water level critical at ${at}`, detail: `${r.waterLevelCm} cm (danger from ${w.dangerLevelCm} cm)` });
    else if (r.waterLevelCm >= w.warnLevelCm)
      out.push({ kind: "water_level_high", severity: "warning", title: `Water level high at ${at}`, detail: `${r.waterLevelCm} cm (warning from ${w.warnLevelCm} cm)` });
  }
  if (r.waterRiseCmPerMin !== null) {
    if (r.waterRiseCmPerMin >= w.riseDangerCmPerMin)
      out.push({ kind: "water_rising_fast", severity: "danger", title: `Water rising rapidly at ${at}`, detail: `+${r.waterRiseCmPerMin} cm/min` });
    else if (r.waterRiseCmPerMin >= w.riseWarnCmPerMin)
      out.push({ kind: "water_rising_fast", severity: "warning", title: `Water rising at ${at}`, detail: `+${r.waterRiseCmPerMin} cm/min` });
  }
  if (r.rainPct !== null) {
    if (r.rainPct >= CONFIG.rain.danger)
      out.push({ kind: "heavy_rain", severity: "danger", title: `Very heavy rain at ${at}`, detail: `Intensity ${r.rainPct}%` });
    else if (r.rainPct >= CONFIG.rain.warn)
      out.push({ kind: "heavy_rain", severity: "warning", title: `Heavy rain at ${at}`, detail: `Intensity ${r.rainPct}%` });
  }
  if (r.soilMoisturePct !== null) {
    if (r.soilMoisturePct >= CONFIG.soil.danger)
      out.push({ kind: "soil_saturated", severity: "danger", title: `Soil saturated at ${at}`, detail: `Moisture ${r.soilMoisturePct}%` });
    else if (r.soilMoisturePct >= CONFIG.soil.warn)
      out.push({ kind: "soil_saturated", severity: "warning", title: `Soil near saturation at ${at}`, detail: `Moisture ${r.soilMoisturePct}%` });
  }
  if (r.rainPct !== null && r.soilMoisturePct !== null && r.rainPct >= CONFIG.rain.warn && r.soilMoisturePct >= CONFIG.soil.warn)
    out.push({ kind: "landslide_risk", severity: "danger", title: `Landslide conditions at ${at}`, detail: `Heavy rain (${r.rainPct}%) on saturated soil (${r.soilMoisturePct}%)` });
  if (r.temperatureC !== null && r.temperatureC >= CONFIG.heatWarnC)
    out.push({ kind: "heat", severity: "warning", title: `High temperature at ${at}`, detail: `${r.temperatureC} °C` });
  return out;
}

export function evaluateRescue(w: WorkerRecord): Finding[] {
  const out: Finding[] = [];
  if (w.sos)
    out.push({ kind: "sos", severity: "sos", title: `SOS from ${w.workerId}`, detail: w.gpsFix ? "Position is a live GPS fix." : "No GPS fix. Position is last known." });
  if (w.batteryPct <= CONFIG.batteryCriticalPct)
    out.push({ kind: "battery_low", severity: "danger", title: `${w.workerId} battery critical`, detail: `${w.batteryPct}% remaining` });
  else if (w.batteryPct <= CONFIG.batteryLowPct)
    out.push({ kind: "battery_low", severity: "warning", title: `${w.workerId} battery low`, detail: `${w.batteryPct}% remaining` });
  return out;
}
