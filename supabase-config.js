/*
 * Smart Realty USA — public Supabase browser configuration.
 *
 * Replace these two placeholders with Project URL and the publishable anon key
 * from Supabase Dashboard -> Project Settings -> Data API.
 *
 * The anon key is intentionally browser-visible and is safe only because every
 * exposed table is protected by Row Level Security (RLS).
 * NEVER put a service_role key in this repository or any browser-delivered file.
 */
window.SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

window.SRU_SUPABASE_CONFIG = Object.freeze({
  url: window.SUPABASE_URL,
  anonKey: window.SUPABASE_ANON_KEY,

  // Set true only after Google is enabled in Supabase Authentication -> Providers.
  googleOAuthEnabled: false,
});
