-- Postgres schema mirroring types/telemetry.ts. Re-implement lib/store.ts against this to persist data.
create table sense_readings (
  id bigserial primary key,
  node_id text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  rain_pct real, water_distance_cm real, water_level_cm real, water_rise_cm_per_min real,
  soil_moisture_pct real, temperature_c real, humidity_pct real,
  risk text not null check (risk in ('normal','warning','danger'))
);
create index on sense_readings (node_id, observed_at desc);

create table worker_positions (
  id bigserial primary key,
  worker_id text not null, node_id text not null,
  lat double precision, lng double precision, gps_fix boolean not null,
  sos boolean not null, battery_pct real not null,
  observed_at timestamptz not null, received_at timestamptz not null default now(),
  device_last_comm_at timestamptz
);
create index on worker_positions (worker_id, observed_at desc);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null, severity text not null check (severity in ('warning','danger','sos')),
  status text not null check (status in ('active','acknowledged','resolved')),
  source_id text not null, title text not null, detail text not null,
  lat double precision, lng double precision,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  acknowledged_at timestamptz, acknowledged_by text, resolved_at timestamptz, resolved_by text
);
-- One open alert per (kind, source): this is the dedupe rule used by reconcile().
create unique index alerts_one_open on alerts (kind, source_id) where status <> 'resolved';
