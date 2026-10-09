import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { CONFIG } from "@/lib/config";
import { ingestRescue, ingestSense } from "@/lib/store";
import { TelemetrySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 100;

function authorized(req: NextRequest): boolean {
  if (!CONFIG.apiKey) return process.env.NODE_ENV !== "production"; // fail closed in production
  const given = Buffer.from(req.headers.get("x-raksha-key") ?? "");
  const want = Buffer.from(CONFIG.apiKey);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Accepts one payload or an array (gateways often flush buffered packets after reconnecting). */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > MAX_BATCH)
    return NextResponse.json({ error: `batch must contain 1-${MAX_BATCH} payloads` }, { status: 413 });

  const receivedMs = Date.now();
  const results = items.map((item, index) => {
    const parsed = TelemetrySchema.safeParse(item);
    if (!parsed.success)
      return { index, ok: false as const, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "payload"}: ${i.message}`) };
    const p = parsed.data;
    if (p.type === "sense") {
      const r = ingestSense(p, receivedMs);
      return { index, ok: true as const, risk: r.risk, waterLevelCm: r.waterLevelCm };
    }
    const w = ingestRescue(p, receivedMs);
    return { index, ok: true as const, sos: w.sos };
  });

  const okCount = results.filter((r) => r.ok).length;
  const status = okCount === results.length ? 200 : okCount === 0 ? 422 : 207;
  return NextResponse.json({ receivedAt: new Date(receivedMs).toISOString(), accepted: okCount, results }, { status });
}
