import { z } from "zod";
import type { TelemetryPayload } from "@/types/telemetry";

const id = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9._-]+$/);
const ts = z.string().datetime({ offset: true }).optional();
const reading = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();
const coord = (min: number, max: number) => z.number().min(min).max(max).nullable();

const base = {
  nodeId: id,
  ts,
  gateway: z.enum(["lora", "gsm"]).optional(),
  rssi: z.number().min(-200).max(0).optional(),
};

const sense = z.object({
  ...base,
  type: z.literal("sense"),
  rainPct: reading(0, 100),
  waterDistanceCm: reading(0, 500),
  soilMoisturePct: reading(0, 100),
  temperatureC: reading(-40, 85),
  humidityPct: reading(0, 100),
});

const rescue = z.object({
  ...base,
  type: z.literal("rescue"),
  workerId: id,
  lat: coord(-90, 90),
  lng: coord(-180, 180),
  gpsFix: z.boolean().optional(),
  sos: z.boolean(),
  batteryPct: z.number().min(0).max(100),
  lastCommTs: ts,
});

export const TelemetrySchema: z.ZodType<TelemetryPayload> = z.discriminatedUnion("type", [sense, rescue]);
