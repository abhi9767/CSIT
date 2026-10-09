export type GatewayKind = "lora" | "gsm";
export type RiskLevel = "normal" | "warning" | "danger";
export type Freshness = "live" | "stale" | "offline";
export type WorkerStatus = "sos" | "battery_low" | "active" | "stale" | "offline";
export type Severity = "warning" | "danger" | "sos";
export type AlertStatus = "active" | "acknowledged" | "resolved";
export type AlertKind =
  | "sos" | "battery_low" | "node_offline"
  | "water_level_high" | "water_rising_fast" | "heavy_rain"
  | "soil_saturated" | "landslide_risk" | "heat";

/* ---------- Incoming payloads (gateway -> POST /api/telemetry) ---------- */
interface BasePayload {
  nodeId: string;
  /** Device/gateway ISO-8601 time. Optional: nodes without an RTC omit it. */
  ts?: string;
  gateway?: GatewayKind;
  rssi?: number;
}

/** RAKSHA SENSE. Any reading may be null/absent when its sensor failed (DHT11 does this often). */
export interface SensePayload extends BasePayload {
  type: "sense";
  rainPct?: number | null;
  /** Raw HC-SR04 distance from sensor to water surface. Server converts to level. */
  waterDistanceCm?: number | null;
  soilMoisturePct?: number | null;
  temperatureC?: number | null;
  humidityPct?: number | null;
}

/** RAKSHA RESCUE. */
export interface RescuePayload extends BasePayload {
  type: "rescue";
  workerId: string;
  lat: number | null;
  lng: number | null;
  gpsFix?: boolean;
  sos: boolean;
  batteryPct: number;
  /** Last time the device itself had a successful uplink. */
  lastCommTs?: string;
}

export type TelemetryPayload = SensePayload | RescuePayload;

/* ---------- Stored state ---------- */
export interface SenseReading {
  nodeId: string;
  observedAt: string; // device time if sane, else receivedAt
  receivedAt: string; // server clock
  rainPct: number | null;
  waterDistanceCm: number | null;
  waterLevelCm: number | null;
  waterRiseCmPerMin: number | null;
  soilMoisturePct: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  risk: RiskLevel;
}

export interface WorkerRecord {
  workerId: string;
  nodeId: string;
  lat: number | null; // last known fix
  lng: number | null;
  gpsFix: boolean;
  sos: boolean;
  sosSince: string | null;
  batteryPct: number;
  observedAt: string;
  receivedAt: string; // last time ANY packet from this worker arrived
  deviceLastCommAt: string | null;
}

export interface Alert {
  id: string;
  dedupeKey: string; // `${kind}:${sourceId}`
  kind: AlertKind;
  severity: Severity;
  status: AlertStatus;
  sourceId: string;
  title: string;
  detail: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null; // operator name or "system"
}

/* ---------- Dashboard snapshot ---------- */
export interface Band { warn: number; danger: number }
export interface PublicConfig {
  staleAfterMs: number;
  offlineAfterMs: number;
  batteryLowPct: number;
  rain: Band;
  soil: Band;
  water: Band;
}
export interface SensorNodeView {
  nodeId: string;
  latest: SenseReading | null;
  lastReceivedAt: string | null;
  risk: RiskLevel;
}
export interface Snapshot {
  serverTime: string;
  config: PublicConfig;
  gateway: { lastIngestAt: string | null };
  sensors: SensorNodeView[];
  workers: WorkerRecord[];
  alerts: Alert[];
  history: Record<string, SenseReading[]>;
}
export type WorkerView = WorkerRecord & { freshness: Freshness; status: WorkerStatus };
