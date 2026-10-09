import "server-only";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { CONFIG, waterConfigFor } from "@/lib/config";
import { freshnessOf } from "@/lib/freshness";
import {
  RESCUE_AUTOCLEAR_KINDS, SENSE_KINDS, SEVERITY_RANK,
  evaluateRescue, evaluateSense, riseRate, riskOf, waterLevel, type Finding,
} from "@/lib/risk";
import type {
  Alert, AlertKind, RescuePayload, SensePayload, SenseReading, Snapshot, WorkerRecord,
} from "@/types/telemetry";

/**
 * In-memory store. This is the ONLY module that touches state, so swapping to
 * Postgres/Supabase means re-implementing these exports (see db/schema.sql).
 * It needs a long-lived Node server: serverless instances do not share memory.
 */
interface Db {
  readings: Map<string, SenseReading[]>;
  lastReceived: Map<string, number>; // sense nodeId -> server ms of last packet
  workers: Map<string, WorkerRecord>;
  alerts: Map<string, Alert>;
  lastIngestAt: number | null;
  bus: EventEmitter;
}
const g = globalThis as unknown as { __rakshaDb?: Db };
const db: Db = (g.__rakshaDb ??= {
  readings: new Map(), lastReceived: new Map(), workers: new Map(),
  alerts: new Map(), lastIngestAt: null, bus: new EventEmitter(),
});
db.bus.setMaxListeners(0);
export const bus = db.bus;

const iso = (ms: number) => new Date(ms).toISOString();
const emitChange = () => db.bus.emit("change");

/** Trust device time unless it is in the future or older than a week (buffered GSM packets are legitimate). */
function observedMs(ts: string | undefined, receivedMs: number): number {
  if (!ts) return receivedMs;
  const t = Date.parse(ts);
  if (!Number.isFinite(t) || t > receivedMs + 60_000 || t < receivedMs - 7 * 86_400_000) return receivedMs;
  return t;
}

/* ---------------- alerts ---------------- */
function reconcile(
  sourceId: string, findings: Finding[], autoClear: AlertKind[],
  pos: { lat: number | null; lng: number | null } = { lat: null, lng: null },
) {
  const now = iso(Date.now());
  const open = [...db.alerts.values()].filter((a) => a.sourceId === sourceId && a.status !== "resolved");

  for (const f of findings) {
    const existing = open.find((a) => a.kind === f.kind);
    if (existing) {
      const escalated = SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity];
      Object.assign(existing, {
        severity: f.severity, title: f.title, detail: f.detail, updatedAt: now,
        lat: pos.lat ?? existing.lat, lng: pos.lng ?? existing.lng,
      });
      if (escalated && existing.status === "acknowledged") {
        Object.assign(existing, { status: "active", acknowledgedAt: null, acknowledgedBy: null });
      }
    } else {
      const alert: Alert = {
        id: randomUUID(), dedupeKey: `${f.kind}:${sourceId}`, kind: f.kind, severity: f.severity,
        status: "active", sourceId, title: f.title, detail: f.detail, lat: pos.lat, lng: pos.lng,
        createdAt: now, updatedAt: now, acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolvedBy: null,
      };
      db.alerts.set(alert.id, alert);
    }
  }
  for (const a of open) {
    if (autoClear.includes(a.kind) && !findings.some((f) => f.kind === a.kind)) closeAlert(a, "system", now);
  }
  pruneAlerts();
}

function closeAlert(a: Alert, by: string, now = iso(Date.now())) {
  Object.assign(a, { status: "resolved", resolvedAt: now, resolvedBy: by, updatedAt: now });
}

function resolveSystem(sourceId: string, kind: AlertKind) {
  for (const a of db.alerts.values())
    if (a.sourceId === sourceId && a.kind === kind && a.status !== "resolved") closeAlert(a, "system");
}

function pruneAlerts() {
  const resolved = [...db.alerts.values()].filter((a) => a.status === "resolved")
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
  for (const a of resolved.slice(200)) db.alerts.delete(a.id);
}

export type AlertAction = "acknowledge" | "resolve";
export function setAlertStatus(id: string, action: AlertAction, operator: string): "ok" | "not_found" | "invalid" {
  const a = db.alerts.get(id);
  if (!a) return "not_found";
  const now = iso(Date.now());
  if (action === "acknowledge") {
    if (a.status !== "active") return "invalid";
    Object.assign(a, { status: "acknowledged", acknowledgedAt: now, acknowledgedBy: operator, updatedAt: now });
  } else {
    if (a.status === "resolved") return "invalid";
    // If the device is still reporting SOS, the next packet opens a fresh alert on purpose.
    closeAlert(a, operator, now);
  }
  emitChange();
  return "ok";
}

/* ---------------- ingestion ---------------- */
export function ingestSense(p: SensePayload, receivedMs: number): SenseReading {
  const obs = observedMs(p.ts, receivedMs);
  const history = db.readings.get(p.nodeId) ?? [];
  const level = waterLevel(p.waterDistanceCm ?? null, waterConfigFor(p.nodeId).mountHeightCm);

  const reading: SenseReading = {
    nodeId: p.nodeId, observedAt: iso(obs), receivedAt: iso(receivedMs),
    rainPct: p.rainPct ?? null, waterDistanceCm: p.waterDistanceCm ?? null,
    waterLevelCm: level, waterRiseCmPerMin: riseRate(history, level, obs),
    soilMoisturePct: p.soilMoisturePct ?? null, temperatureC: p.temperatureC ?? null,
    humidityPct: p.humidityPct ?? null, risk: "normal",
  };
  const findings = evaluateSense(reading);
  reading.risk = riskOf(findings);

  history.push(reading);
  history.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (history.length > CONFIG.historyPerNode) history.splice(0, history.length - CONFIG.historyPerNode);
  db.readings.set(p.nodeId, history);
  db.lastReceived.set(p.nodeId, receivedMs);
  db.lastIngestAt = receivedMs;

  resolveSystem(p.nodeId, "node_offline");
  // A buffered, out-of-order packet must not overwrite alerts driven by newer data.
  if (history[history.length - 1] === reading) reconcile(p.nodeId, findings, SENSE_KINDS);
  emitChange();
  return reading;
}

export function ingestRescue(p: RescuePayload, receivedMs: number): WorkerRecord {
  const obs = observedMs(p.ts, receivedMs);
  const prev = db.workers.get(p.workerId);
  const noFix = p.gpsFix === false || p.lat === null || p.lng === null || (p.lat === 0 && p.lng === 0);

  let rec: WorkerRecord;
  if (prev && obs < Date.parse(prev.observedAt)) {
    rec = { ...prev, receivedAt: iso(receivedMs) }; // late packet: we heard from them, state unchanged
  } else {
    rec = {
      workerId: p.workerId, nodeId: p.nodeId,
      lat: noFix ? prev?.lat ?? null : p.lat, lng: noFix ? prev?.lng ?? null : p.lng,
      gpsFix: !noFix, sos: p.sos,
      sosSince: p.sos ? (prev?.sos ? prev.sosSince : iso(obs)) : null,
      batteryPct: p.batteryPct, observedAt: iso(obs), receivedAt: iso(receivedMs),
      deviceLastCommAt: p.lastCommTs ?? prev?.deviceLastCommAt ?? null,
    };
    reconcile(p.workerId, evaluateRescue(rec), RESCUE_AUTOCLEAR_KINDS, { lat: rec.lat, lng: rec.lng });
  }
  db.workers.set(p.workerId, rec);
  db.lastIngestAt = receivedMs;
  resolveSystem(p.workerId, "node_offline");
  emitChange();
  return rec;
}

/* ---------------- staleness ---------------- */
function sweepOffline(nowMs: number) {
  const cfg = CONFIG;
  for (const [nodeId, last] of db.lastReceived) {
    const f = freshnessOf(last, nowMs, cfg);
    if (f === "offline")
      reconcile(nodeId, [{ kind: "node_offline", severity: "warning", title: `${nodeId} offline`, detail: `No packets since ${iso(last)}` }], []);
    else if (f === "live") resolveSystem(nodeId, "node_offline");
  }
  for (const w of db.workers.values()) {
    const f = freshnessOf(Date.parse(w.receivedAt), nowMs, cfg);
    if (f === "offline")
      reconcile(w.workerId, [{
        kind: "node_offline", severity: w.sos ? "danger" : "warning",
        title: `${w.workerId} offline`, detail: w.sos ? "Went silent while SOS was active. Last known position only." : `No packets since ${w.receivedAt}`,
      }], [], { lat: w.lat, lng: w.lng });
    else if (f === "live") resolveSystem(w.workerId, "node_offline");
  }
}

/* ---------------- read side ---------------- */
export function snapshot(nowMs: number): Snapshot {
  sweepOffline(nowMs);
  const alerts = [...db.alerts.values()].sort((a, b) => {
    const open = Number(b.status !== "resolved") - Number(a.status !== "resolved");
    if (open) return open;
    const act = Number(b.status === "active") - Number(a.status === "active");
    return act || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.updatedAt.localeCompare(a.updatedAt);
  });
  const history: Snapshot["history"] = {};
  const sensors = [...db.readings.entries()].map(([nodeId, rows]) => {
    history[nodeId] = rows.slice(-CONFIG.historyInSnapshot);
    const latest = rows[rows.length - 1] ?? null;
    const last = db.lastReceived.get(nodeId);
    return { nodeId, latest, lastReceivedAt: last ? iso(last) : null, risk: latest?.risk ?? "normal" };
  });
  return {
    serverTime: iso(nowMs),
    config: {
      staleAfterMs: CONFIG.staleAfterMs, offlineAfterMs: CONFIG.offlineAfterMs, batteryLowPct: CONFIG.batteryLowPct,
      rain: CONFIG.rain, soil: CONFIG.soil,
      water: { warn: CONFIG.water.warnLevelCm, danger: CONFIG.water.dangerLevelCm },
    },
    gateway: { lastIngestAt: db.lastIngestAt ? iso(db.lastIngestAt) : null },
    sensors, workers: [...db.workers.values()], alerts, history,
  };
}
