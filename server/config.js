"use strict";

function readConfig(env = process.env) {
  const jwtSecret = String(env.JWT_SECRET || "");
  const demoPassword = String(env.DEMO_PASSWORD || "");
  const issues = [];

  if (jwtSecret.length < 32 || /change[-_ ]?me|example|paste/i.test(jwtSecret)) {
    issues.push("jwt_secret_missing_or_weak");
  }
  if (demoPassword && demoPassword.length < 12) {
    issues.push("demo_password_weak");
  }

  return {
    port: Number(env.AUTH_PORT || env.PORT || 8787),
    jwtSecret,
    jwtDays: Number(env.JWT_DAYS || 14),
    demoPassword,
    corsOrigin: env.CORS_ORIGIN || true,
    issues,
  };
}

function assertRequiredConfig(config) {
  if (config.issues.includes("jwt_secret_missing_or_weak")) {
    throw new Error("JWT_SECRET must be a non-placeholder secret of at least 32 characters.");
  }
}

module.exports = { readConfig, assertRequiredConfig };
