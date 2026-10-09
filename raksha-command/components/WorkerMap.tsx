"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { WorkerView } from "@/types/telemetry";
import { STATUS_LABEL, fmtAge, fmtTime } from "./ui";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function pin(w: WorkerView) {
  return L.divIcon({
    className: "",
    html: `<div class="raksha-pin raksha-pin--${w.status}">${esc(w.workerId.slice(-3))}</div>`,
    iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18],
  });
}

function Viewport({ workers, focusId }: { workers: WorkerView[]; focusId: string | null }) {
  const map = useMap();
  const fitted = useRef(false);
  const latest = useRef(workers);
  latest.current = workers;

  useEffect(() => {
    if (fitted.current) return;
    const pts = workers.filter((w) => w.lat !== null && w.lng !== null).map((w) => [w.lat, w.lng] as [number, number]);
    if (pts.length) { map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 15 }); fitted.current = true; }
  }, [map, workers]);

  useEffect(() => {
    const w = latest.current.find((x) => x.workerId === focusId);
    if (w && w.lat !== null && w.lng !== null) map.flyTo([w.lat, w.lng], Math.max(map.getZoom(), 15));
  }, [map, focusId]);
  return null;
}

export default function WorkerMap({ workers, now, focusId }: { workers: WorkerView[]; now: number; focusId: string | null }) {
  const located = useMemo(() => workers.filter((w) => w.lat !== null && w.lng !== null), [workers]);
  return (
    <MapContainer center={[28.0, 84.0]} zoom={7} className="h-[420px] w-full rounded-lg" scrollWheelZoom>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <Viewport workers={workers} focusId={focusId} />
      {located.map((w) => (
        <Marker key={w.workerId} position={[w.lat as number, w.lng as number]} icon={pin(w)} zIndexOffset={w.sos ? 1000 : 0}>
          <Popup>
            <strong>{w.workerId}</strong> · {STATUS_LABEL[w.status]}
            <br />Battery {w.batteryPct}%
            <br />{(w.lat as number).toFixed(5)}, {(w.lng as number).toFixed(5)}{w.gpsFix ? "" : " (last known)"}
            <br />Heard {fmtTime(w.receivedAt)} ({fmtAge(now - Date.parse(w.receivedAt))} ago)
            {w.deviceLastCommAt && <><br />Device last uplink {fmtTime(w.deviceLastCommAt)}</>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
