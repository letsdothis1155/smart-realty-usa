-- SmartRealty listings
-- Neon / Postgres migration. File-store mock mode (server/listings/store.js)
-- mirrors this table. mls_number/source together are the natural key from
-- whichever data source populated a row (mock sample data today; a RESO Web
-- API provider once LISTINGS_MODE=provider and idxAgreementAccepted=true).
-- IDX rules require listing_office/listing_agent/mls_source_name/as_of to be
-- carried and displayed with any live MLS record — never drop them on write.

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  mls_number TEXT,
  source TEXT NOT NULL DEFAULT 'mock',
  title TEXT NOT NULL,
  location TEXT,
  image TEXT,
  images JSONB NOT NULL DEFAULT '[]',
  beds INTEGER NOT NULL DEFAULT 0,
  baths NUMERIC NOT NULL DEFAULT 0,
  sqft INTEGER NOT NULL DEFAULT 0,
  list_price NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  property_type TEXT,
  description TEXT,
  listing_office TEXT,
  listing_agent TEXT,
  mls_source_name TEXT,
  as_of TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT listings_status
    CHECK (status IN ('active', 'pending', 'sold', 'off_market'))
);

CREATE INDEX IF NOT EXISTS listings_status ON listings (status);
CREATE INDEX IF NOT EXISTS listings_list_price ON listings (list_price);
CREATE INDEX IF NOT EXISTS listings_beds ON listings (beds);
CREATE UNIQUE INDEX IF NOT EXISTS listings_mls_number_source
  ON listings (mls_number, source)
  WHERE mls_number IS NOT NULL;
