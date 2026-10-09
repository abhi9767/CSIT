import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { setAlertStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["acknowledge", "resolve"]),
  operator: z.string().trim().min(1).max(40).default("HQ operator"),
});

// TODO: put operator authentication in front of this route before deploying.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const result = setAlertStatus(id, parsed.data.action, parsed.data.operator);
  if (result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result === "invalid") return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
