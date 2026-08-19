-- SmartRealty profit engine
-- Neon / Postgres migration. File-store mock mode mirrors these tables.
-- Never store card PAN/CVV, payroll passwords, SSNs, or raw bank numbers.
-- User deposits are NOT company revenue. Do not join this ledger to bank tables.

CREATE TABLE IF NOT EXISTS billing_customers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_customers_user_id ON billing_customers (user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  billing_period TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  sandbox BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  canceled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status ON subscriptions (status);

-- Entitlements are stored separately from provider-specific billing rows.
CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT,
  subscription_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS entitlements_user_id ON entitlements (user_id);

CREATE TABLE IF NOT EXISTS plan_catalog (
  id TEXT PRIMARY KEY DEFAULT 'default',
  document JSONB NOT NULL,
  live_charging BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  business_id TEXT,
  revenue_type TEXT NOT NULL,
  source TEXT,
  gross_amount INTEGER NOT NULL,
  fees INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  external_reference TEXT,
  sandbox BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT revenue_events_type_check
    CHECK (revenue_type IN ('subscription','marketplace','agent','business','enterprise','partner','affiliate','service','other'))
);

CREATE INDEX IF NOT EXISTS revenue_events_created_at ON revenue_events (created_at);
CREATE INDEX IF NOT EXISTS revenue_events_type ON revenue_events (revenue_type);

CREATE TABLE IF NOT EXISTS cost_events (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  user_id TEXT,
  variable BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  sandbox BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  status TEXT,
  commission_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_events (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates (id),
  user_id TEXT,
  event TEXT NOT NULL,
  conversion_value INTEGER NOT NULL DEFAULT 0,
  revenue INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_events (
  id TEXT PRIMARY KEY,
  partner_id TEXT,
  campaign_id TEXT,
  referral_id TEXT,
  click_id TEXT,
  conversion_id TEXT,
  user_id TEXT,
  category TEXT,
  revenue_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  disclosed BOOLEAN NOT NULL DEFAULT TRUE,
  sandbox BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS professionals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT,
  service_area TEXT,
  website TEXT,
  services JSONB,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  paid_placement BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message TEXT,
  city TEXT,
  consent BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL,
  financial_data_attached BOOLEAN NOT NULL DEFAULT FALSE,
  matching_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS churn_surveys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_id TEXT,
  reason TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pricing_experiments (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  variants JSONB NOT NULL,
  metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employer_programs (
  id TEXT PRIMARY KEY,
  employer_name TEXT NOT NULL,
  billing_model TEXT,
  status TEXT,
  employees_must_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  employer_sees_financial_activity BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
