-- SmartRealty Direct Deposit
-- Neon / Postgres migration. File-store mock mode mirrors these tables.
-- Never store payroll usernames or passwords.
-- Prefer provider IDs over raw bank account numbers.

CREATE TABLE IF NOT EXISTS direct_deposit_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_connection_id TEXT,
  payer_id TEXT,
  payer_name TEXT,
  payer_type TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dd_connections_user_id
  ON direct_deposit_connections (user_id);

CREATE INDEX IF NOT EXISTS dd_connections_provider_connection_id
  ON direct_deposit_connections (provider_connection_id);

CREATE TABLE IF NOT EXISTS direct_deposit_switches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES direct_deposit_connections (id),
  destination_account_id TEXT,
  allocation_type TEXT NOT NULL,
  allocation_value NUMERIC,
  provider_switch_id TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dd_switches_allocation_type
    CHECK (allocation_type IN ('entire', 'percent', 'fixed'))
);

CREATE INDEX IF NOT EXISTS dd_switches_user_id
  ON direct_deposit_switches (user_id);

CREATE INDEX IF NOT EXISTS dd_switches_provider_switch_id
  ON direct_deposit_switches (provider_switch_id);

CREATE TABLE IF NOT EXISTS direct_deposit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  switch_id TEXT,
  event_type TEXT NOT NULL,
  provider_event_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dd_events_provider_event_id
  ON direct_deposit_events (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dd_events_switch_id
  ON direct_deposit_events (switch_id);

CREATE TABLE IF NOT EXISTS direct_deposit_webhook_receipts (
  provider_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SmartRealty Payouts (commissions, contractor pay) is a SEPARATE system.
-- Do not reuse these tables for outbound payouts.
