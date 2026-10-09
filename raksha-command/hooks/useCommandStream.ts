"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/types/telemetry";

/** "disconnected" = this browser lost the server, which is separate from the gateways going quiet. */
export type LinkState = "connecting" | "live" | "disconnected";
const SILENCE_LIMIT_MS = 15_000;

export function useCommandStream() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [errored, setErrored] = useState(false);
  const [lastMsgAt, setLastMsgAt] = useState<number | null>(null);
  const [localNow, setLocalNow] = useState(() => Date.now());
  const offset = useRef(0); // server clock minus local clock

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("snapshot", (e) => {
      const s = JSON.parse((e as MessageEvent<string>).data) as Snapshot;
      offset.current = Date.parse(s.serverTime) - Date.now();
      setSnapshot(s);
      setLastMsgAt(Date.now());
      setErrored(false);
    });
    es.onerror = () => setErrored(true); // EventSource retries on its own
    return () => es.close();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setLocalNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const link: LinkState =
    lastMsgAt === null ? (errored ? "disconnected" : "connecting")
    : errored || localNow - lastMsgAt > SILENCE_LIMIT_MS ? "disconnected"
    : "live";

  const act = useCallback(async (id: string, action: "acknowledge" | "resolve") => {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  }, []);

  return { snapshot, link, lastMsgAt, now: localNow + offset.current, act };
}
