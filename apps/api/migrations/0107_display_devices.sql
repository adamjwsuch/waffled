-- Up Migration
-- ESP32-P4 kitchen panel device auth (Option A: the panel holds only a revocable
-- DEVICE token). Unlike kiosk_devices, there is no secret-for-JWT exchange step —
-- the panel sends the raw token as `Authorization: Bearer <token>` on every poll,
-- and display_devices.token_hash (sha256, same scheme as kiosk/API-key secrets)
-- is checked directly on each request. Minting happens out-of-band via
-- scripts/mint-display-token.ts; revocation is deleting the row (no revoked_at —
-- this table has nothing else worth keeping once a device is retired).
create table if not exists display_devices (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  label        text not null default 'Display',
  token_hash   text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);
create unique index if not exists ux_display_devices_token  on display_devices (token_hash);
create index if not exists ix_display_devices_household     on display_devices (household_id);

-- Down Migration
drop table if exists display_devices;
