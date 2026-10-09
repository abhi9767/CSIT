# RAKSHA Command

Next.js 15 (App Router) + strict TypeScript + Tailwind 4. Drop these folders into a `create-next-app` project (alias `@/*`).

```bash
npm i zod recharts leaflet react-leaflet server-only
npm i -D @types/leaflet
echo 'RAKSHA_API_KEY=change-me' >> .env.local   # optional: RAKSHA_STALE_MS, RAKSHA_OFFLINE_MS
npm run dev
```

## Contract test (hand-built payloads against the real endpoint, not seed data)
```bash
curl -X POST localhost:3000/api/telemetry -H 'content-type: application/json' -H 'x-raksha-key: change-me' -d '{
  "type":"sense","nodeId":"SENSE-01","rainPct":72,"waterDistanceCm":210,"soilMoisturePct":85,"temperatureC":24.5,"humidityPct":88}'
curl -X POST localhost:3000/api/telemetry -H 'content-type: application/json' -H 'x-raksha-key: change-me' -d '{
  "type":"rescue","nodeId":"RESCUE-01","workerId":"RW-012","lat":27.8,"lng":85.9,"gpsFix":true,"sos":true,"batteryPct":18}'
```
The endpoint also accepts an array of payloads (up to 100) so a gateway can flush buffered packets after reconnecting.

## Before you rely on it
- State is in memory (`lib/store.ts`). Run one long-lived Node server, not serverless, or re-implement the store on `db/schema.sql`.
- Set `mountHeightCm` and all thresholds in `lib/config.ts` from real calibration. Defaults are placeholders.
- `PATCH /api/alerts/:id` has no operator authentication yet.
- Staleness is measured from when the server last received a packet, so it still works when a node has no RTC.
