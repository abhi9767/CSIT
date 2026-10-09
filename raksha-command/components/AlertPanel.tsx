"use client";
import type { Alert } from "@/types/telemetry";
import { Badge, SEVERITY_TONE, fmtAge } from "./ui";

interface Props {
  alerts: Alert[];
  now: number;
  onAct: (id: string, action: "acknowledge" | "resolve") => void;
}

const BORDER = { sos: "border-red-500 bg-red-950/60", danger: "border-red-700 bg-red-950/30", warning: "border-amber-500 bg-zinc-900" } as const;
const BTN = "rounded border border-zinc-500 px-2 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400";

export function AlertPanel({ alerts, now, onAct }: Props) {
  const open = alerts.filter((a) => a.status !== "resolved");
  const closed = alerts.filter((a) => a.status === "resolved").slice(0, 5);

  return (
    <section aria-label="Incidents" className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <h2 className="mb-2 flex items-center justify-between text-base font-semibold">
        Incidents {open.length > 0 && <Badge tone={open.some((a) => a.severity === "sos") ? "sos" : "danger"}>{open.length} open</Badge>}
      </h2>
      {open.length === 0 && <p className="text-sm text-zinc-400">No open incidents. SOS calls and environmental warnings appear here as they trigger.</p>}
      <ul className="space-y-2" aria-live="polite">
        {open.map((a) => (
          <li key={a.id} className={`rounded border-l-4 p-2 ${BORDER[a.severity]}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold">{a.title}</span>
              <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity === "sos" ? "SOS" : a.severity}</Badge>
            </div>
            <p className="text-xs text-zinc-300">{a.detail}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Opened {fmtAge(now - Date.parse(a.createdAt))} ago{a.acknowledgedBy && ` · acknowledged by ${a.acknowledgedBy}`}
            </p>
            <div className="mt-2 flex gap-2">
              {a.status === "active" && <button className={BTN} onClick={() => onAct(a.id, "acknowledge")}>Acknowledge</button>}
              <button className={BTN} onClick={() => onAct(a.id, "resolve")}>Resolve</button>
            </div>
          </li>
        ))}
      </ul>
      {closed.length > 0 && (
        <details className="mt-3 text-xs text-zinc-400">
          <summary className="cursor-pointer">Recently resolved ({closed.length})</summary>
          <ul className="mt-1 space-y-1">
            {closed.map((a) => <li key={a.id}>{a.title} · by {a.resolvedBy}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
