"use strict";

function readConfig(env = process.env) {
  const jwtSecret = String(env.JWT_SECRET || "");
  const demoPassword = String(env.DEMO_PASSWORD || "");
  const publishedDemoPassword = ["Smart", "Realty2026"].join("");
  const publishedJwtPlaceholder = "replace-with-a-long-random-secret-at-least-32-chars";
  const issues = [];

  if (
    jwtSecret.length < 32 ||
    jwtSecret === publishedJwtPlaceholder ||
    /change[-_ ]?me|example|paste|replace[-_ ]?with/i.test(jwtSecret)
  ) {
    issues.push("jwt_secret_missing_or_weak");
  }
  if (
    demoPassword &&
    (demoPassword.length < 12 ||
      demoPassword === publishedDemoPassword ||
      /change[-_ ]?me|example|paste/i.test(demoPassword))
  ) {
    issues.push("demo_password_weak");
  }

  return {
    port: Number(env.AUTH_PORT || env.PORT || 8787),
    jwtSecret,
    jwtDays: Number(env.JWT_DAYS || 14),
    demoPassword,
    corsOrigin: env.CORS_ORIGIN || true,
    issues,
    serveStatic: env.SERVE_STATIC === "1",
    adminPassword: String(env.ADMIN_PASSWORD || env.SRU_ADMIN_PASSWORD || ""),
    listings: readListingsConfig(env),
  };
}

function readListingsConfig(env = process.env) {
  const requested = String(env.LISTINGS_MODE || "mock").toLowerCase();
  const mode = ["provider", "hud", "public"].includes(requested) ? requested : "mock";
  return {
    mode,
    resoClientId: String(env.RESO_CLIENT_ID || ""),
    resoClientSecret: String(env.RESO_CLIENT_SECRET || ""),
    resoTokenUrl: String(env.RESO_TOKEN_URL || ""),
    resoQueryUrl: String(env.RESO_QUERY_URL || ""),
    hudRegions: String(
      env.LISTINGS_HUD_REGIONS || "KY,IN,NC,GA,SC,TN,VA,DC,MD,PA,NY,MA,FL,TX,AZ,NV,CO,WA,OR,CA",
    )
      .split(",")
      .map((region) => region.trim())
      .filter(Boolean),
    allowHudSample: env.LISTINGS_ALLOW_HUD_SAMPLE === "1",
    streetViewKey: String(env.GOOGLE_STREET_VIEW_KEY || env.GOOGLE_MAPS_TILES_KEY || ""),
    streetViewMetadataBudget: Number(env.LISTINGS_STREET_VIEW_METADATA_BUDGET || 40),
    streetViewStaticBudget: Number(env.LISTINGS_STREET_VIEW_STATIC_BUDGET || 200),
    syncIntervalMs: Number(env.LISTINGS_SYNC_INTERVAL_MS || 60 * 60 * 1000),
    absentStreakLimit: Number(env.LISTINGS_ABSENT_STREAK_LIMIT || 3),
    disableHourlySync: env.LISTINGS_HOURLY_SYNC === "0",
    // A live provider may only be enabled after a signed IDX/MLS agreement.
    // This legal fact is intentionally not configurable through an env var.
    idxAgreementAccepted: false,
  };
}

function assertRequiredConfig(config) {
  if (config.issues.includes("jwt_secret_missing_or_weak")) {
    throw new Error("JWT_SECRET must be a non-placeholder secret of at least 32 characters.");
  }
}

module.exports = { readConfig, readListingsConfig, assertRequiredConfig };
