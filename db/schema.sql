-- Visit Sark — Supabase Schema
-- Run this in the Supabase SQL editor to set up the database.

-- ── PROVIDERS ────────────────────────────────────────────────────────────────
-- Businesses / operators listed on the platform (bus, ferry, carriage, etc.)

create table if not exists providers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null check (category in ('bus','ferry','carriage','bike','adventure','food','boat')),
  contact     jsonb,           -- { phone, email, website }
  created_at  timestamptz default now()
);

-- ── PENDING BOOKINGS ─────────────────────────────────────────────────────────
-- Created when a checkout is initiated; updated to 'paid' on success.

create table if not exists pending_bookings (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique,
  checkout_id text,
  amount      numeric(8,2) not null,
  description text,
  status      text not null default 'pending' check (status in ('pending','paid','expired','failed')),
  created_at  timestamptz default now()
);

-- ── BOOKINGS ─────────────────────────────────────────────────────────────────
-- Confirmed bookings with QR tokens; used for validation by operators.

create table if not exists bookings (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique,
  checkout_id text,
  token       uuid not null unique default gen_random_uuid(),
  amount      numeric(8,2),
  description text,            -- human-readable summary shown on QR ticket
  category    text,            -- 'bus', 'ferry', 'carriage', etc.
  provider_id uuid references providers(id),
  booking_date date,
  time_slot   text,
  pax         jsonb,           -- { adults: 2, children: 1 }
  extras      jsonb,           -- any additional booking data
  status      text not null default 'valid' check (status in ('valid','used','cancelled','refunded')),
  used_at     timestamptz,
  created_at  timestamptz default now()
);

-- ── VALIDATION LOG ───────────────────────────────────────────────────────────
-- Audit trail of every scan attempt.

create table if not exists validation_log (
  id          uuid primary key default gen_random_uuid(),
  token       uuid,
  booking_id  uuid references bookings(id),
  operator    text,            -- who scanned (e.g. 'charlie-bus', 'ferry-operator')
  result      text not null check (result in ('valid','already_used','not_found')),
  scanned_at  timestamptz default now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Only the Cloudflare Worker (service-role key) can read/write.
-- Public access is intentionally blocked.

alter table pending_bookings enable row level security;
alter table bookings         enable row level security;
alter table validation_log   enable row level security;
alter table providers        enable row level security;

-- Allow the service role (Cloudflare Worker) full access
create policy "service role full access" on pending_bookings for all using (auth.role() = 'service_role');
create policy "service role full access" on bookings         for all using (auth.role() = 'service_role');
create policy "service role full access" on validation_log   for all using (auth.role() = 'service_role');
create policy "service role full access" on providers        for all using (auth.role() = 'service_role');

-- ── INDEXES ──────────────────────────────────────────────────────────────────

create index if not exists bookings_token_idx     on bookings(token);
create index if not exists bookings_reference_idx on bookings(reference);
create index if not exists bookings_date_idx      on bookings(booking_date);
