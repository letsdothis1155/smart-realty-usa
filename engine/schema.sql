-- Supabase schema for finished listing models.
-- Do not apply this yet. supabase-config.js is still https://YOUR_PROJECT_REF.supabase.co.
-- Never put a service_role key in this repo. The anon key is browser-visible only with RLS.

create table if not exists public.listing_models (
  listing_id text primary key,
  sqft integer,
  estimated boolean not null default true,
  rooms jsonb not null,
  glb_path text,
  built_at timestamptz not null default now(),
  smart_realty_id text not null
);

alter table public.listing_models enable row level security;

-- No insert or update policy. A later signed-URL worker can read this table
-- with the service role. That key stays in the worker secret, not in git.
