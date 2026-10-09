import type { NextRequest } from "next/server";
import { bus, snapshot } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events: a snapshot on every change (throttled to 2/s) plus a 5 s heartbeat so staleness keeps updating. */
export function GET(req: NextRequest) {
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let last = 0;
      let pending: ReturnType<typeof setTimeout> | null = null;

      const send = () => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: snapshot\ndata: ${JSON.stringify(snapshot(Date.now()))}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onChange = () => {
        if (pending) return;
        pending = setTimeout(() => { pending = null; last = Date.now(); send(); }, Math.max(0, 500 - (Date.now() - last)));
      };

      bus.on("change", onChange);
      const heartbeat = setInterval(send, 5_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (pending) clearTimeout(pending);
        bus.off("change", onChange);
        try { controller.close(); } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
      controller.enqueue(enc.encode("retry: 3000\n\n"));
      send();
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
