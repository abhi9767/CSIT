const num = (v: string | undefined, d: number): number => {
  if (v === undefined || v.trim() === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface WaterConfig {
  /** Distance from the ultrasonic sensor to the dry channel bed. Calibrate per site. */
  mountHeightCm: number;
  warnLevelCm: number;
  dangerLevelCm: number;
  riseWarnCmPerMin: number;
  riseDangerCmPerMin: number;
}

// Thresholds are placeholders. Calibrate against the real site before relying on them.
export const CONFIG = {
  apiKey: process.env.RAKSHA_API_KEY ?? "",
  staleAfterMs: num(process.env.RAKSHA_STALE_MS, 120_000),
  offlineAfterMs: num(process.env.RAKSHA_OFFLINE_MS, 600_000),
  historyPerNode: 720,
  historyInSnapshot: 180,
  riseWindowMs: 5 * 60_000,
  batteryLowPct: 20,
  batteryCriticalPct: 10,
  rain: { warn: 60, danger: 85 },
  soil: { warn: 80, danger: 92 },
  heatWarnC: 38,
  water: {
    mountHeightCm: 400,
    warnLevelCm: 150,
    dangerLevelCm: 250,
    riseWarnCmPerMin: 2,
    riseDangerCmPerMin: 5,
  } satisfies WaterConfig,
};

export const NODE_OVERRIDES: Record<string, Partial<WaterConfig>> = {
  // "SENSE-01": { mountHeightCm: 350 },
};

export const waterConfigFor = (nodeId: string): WaterConfig => ({
  ...CONFIG.water,
  ...NODE_OVERRIDES[nodeId],
});
