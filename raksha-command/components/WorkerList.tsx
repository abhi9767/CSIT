"use client";
import type { WorkerStatus, WorkerView } from "@/types/telemetry";
import { Badge, STATUS_LABEL, STATUS_TONE, fmtAge, fmtTime } from "./ui";

const ORDER: Record<WorkerStatus, number> = { sos: 0, offline: 1, stale: 2, battery_low: 3, active: 4 };

interface Props {
  workers: WorkerView[];
  now: number;
  focusId: string | null;
  onSelect: (id: string) => void;
}

export function WorkerList({ workers, now, focusId, onSelect }: Props) {
  const sorted = [...workers].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.workerId.localeCompare(b.workerId));
  return (
    <section aria-label="Rescue personnel" className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <h2 className="mb-2 text-base font-semibold">Rescue personnel ({workers.length})</h2>
      {sorted.length === 0 && <p className="text-sm text-zinc-400">No rescue nodes have reported yet.</p>}
      <ul className="space-y-1">
        {sorted.map((w) => (
          <li key={w.workerId}>
            <button
              onClick={() => onSelect(w.workerId)}
              aria-pressed={focusId === w.workerId}
              className={`w-full rounded border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                focusId === w.workerId ? "border-sky-500" : "border-zinc-800"
              } hover:bg-zinc-800`}
            >
              <span className="flex items-center justify-between">
                <span className="font-semibold">{w.workerId}</span>
                <span className="flex gap-1">
                  {w.sos && w.freshness !== "live" && <Badge tone="stale">Stale data</Badge>}
                  <Badge tone={STATUS_TONE[w.status]}>{STATUS_LABEL[w.status]}</Badge>
                </span>
              </span>
              <span className="mt-1 block text-xs text-zinc-400 tabular-nums">
                Battery {w.batteryPct}% · heard {fmtAge(now - Date.parse(w.receivedAt))} ago ({fmtTime(w.receivedAt)})
              </span>
              <span className="block text-xs text-zinc-400 tabular-nums">
                {w.lat !== null && w.lng !== null
                  ? `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}${w.gpsFix ? "" : " (last known, no fix)"}`
                  : "No GPS position yet"}
              </span>
              {w.sos && w.sosSince && <span className="block text-xs font-semibold text-red-300">SOS since {fmtTime(w.sosSince)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
