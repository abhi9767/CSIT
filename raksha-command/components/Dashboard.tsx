"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useCommandStream } from "@/hooks/useCommandStream";
import { freshnessOf, workerStatus } from "@/lib/freshness";
import type { WorkerView } from "@/types/telemetry";
import { AlertPanel } from "./AlertPanel";
import { SensorPanel } from "./SensorPanel";
import { WorkerList } from "./WorkerList";
import { Badge, fmtAge, fmtTime } from "./ui";

const WorkerMap = dynamic(() => import("./WorkerMap"), {
  ssr: false,
  loading: () => <div className="h-[420px] rounded-lg bg-zinc-900" />,
});

export default function Dashboard() {
  const { snapshot, link, lastMsgAt, now, act } = useCommandStream();
  const [focusId, setFocusId] = useState<string | null>(null);

  const workers = useMemo<WorkerView[]>(() => {
    if (!snapshot) return [];
    return snapshot.workers.map((w) => {
      const freshness = freshnessOf(Date.parse(w.receivedAt), now, snapshot.config);
      return { ...w, freshness, status: workerStatus(w, freshness, snapshot.config.batteryLowPct) };
    });
  }, [snapshot, now]);

  if (!snapshot) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <p className="text-zinc-300">
          {link === "disconnected" ? "Cannot reach the RAKSHA server. Retrying automatically." : "Connecting to RAKSHA Command…"}
        </p>
      </main>
    );
  }

  const lastIngest = snapshot.gateway.lastIngestAt ? Date.parse(snapshot.gateway.lastIngestAt) : null;
  const gateway = freshnessOf(lastIngest, now, snapshot.config);
  const lost = link === "disconnected";
  const sosCount = snapshot.alerts.filter((a) => a.kind === "sos" && a.status !== "resolved").length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[1000] border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <h1 className="text-lg font-semibold">RAKSHA Command</h1>
          <div className="flex items-center gap-2 text-sm">
            {sosCount > 0 && <Badge tone="sos">{sosCount} active SOS</Badge>}
            {lost ? <Badge tone="danger">Server link lost</Badge>
              : gateway === "live" ? <Badge tone="ok">Gateways live</Badge>
              : gateway === "stale" ? <Badge tone="stale">Gateways quiet</Badge>
              : <Badge tone="offline">Gateways offline</Badge>}
          </div>
        </div>
        {lost && (
          <p role="alert" className="bg-red-700 px-4 py-2 text-sm font-medium text-white">
            Lost connection to the RAKSHA server{lastMsgAt ? ` at ${fmtTime(new Date(lastMsgAt).toISOString())}` : ""}. Reconnecting automatically.
            Everything below is stale data. No signal does not mean no danger.
          </p>
        )}
        {!lost && gateway !== "live" && (
          <p role="status" className="bg-amber-400 px-4 py-2 text-sm font-medium text-black">
            No packets from the field gateways for {lastIngest ? fmtAge(now - lastIngest) : "this session"}. Readings may be out of date.
            No signal does not mean no danger.
          </p>
        )}
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <SensorPanel sensors={snapshot.sensors} history={snapshot.history} config={snapshot.config} now={now} linkLost={lost} />
          <section aria-label="Rescue map">
            <WorkerMap workers={workers} now={now} focusId={focusId} />
          </section>
        </div>
        <aside className="order-first space-y-4 lg:order-none">
          <AlertPanel alerts={snapshot.alerts} now={now} onAct={act} />
          <WorkerList workers={workers} now={now} focusId={focusId} onSelect={setFocusId} />
        </aside>
      </main>
    </div>
  );
}
