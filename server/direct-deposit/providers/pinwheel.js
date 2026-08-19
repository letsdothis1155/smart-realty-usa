"use strict";

const { userError } = require("../constants");

/**
 * Pinwheel adapter (designed, not live).
 * Pinwheel is an established payroll / direct-deposit switching partner.
 * This module never runs production money movement.
 *
 * Enable only when:
 *   DIRECT_DEPOSIT_MODE=provider
 *   PINWHEEL_API_SECRET is set
 *   legal/compliance review is complete
 *
 * SmartRealty never collects payroll usernames or passwords. Those stay
 * inside the partner-hosted Link session.
 */
function createPinwheelDirectDepositProvider(config = {}) {
  const secret = String(config.apiSecret || "");
  const baseUrl = String(config.apiUrl || "https://sandbox.getpinwheel.com").replace(/\/$/, "");
  const ready = secret.length >= 16;

  async function partnerFetch() {
    throw userError("PROVIDER_MODE_DISABLED");
  }

  return {
    name: "pinwheel",
    sandbox: true,
    configured: ready,
    baseUrl,

    async createConnectionSession() {
      if (!ready) throw userError("PROVIDER_MODE_DISABLED");
      return partnerFetch();
    },
    async getPayers() {
      if (!ready) throw userError("PROVIDER_MODE_DISABLED");
      return partnerFetch();
    },
    async getConnection() {
      if (!ready) throw userError("PROVIDER_MODE_DISABLED");
      return partnerFetch();
    },
    async createSwitch() {
      if (!ready) throw userError("PROVIDER_MODE_DISABLED");
      return partnerFetch();
    },
    async getSwitchStatus() {
      if (!ready) throw userError("PROVIDER_MODE_DISABLED");
      return partnerFetch();
    },
    async cancelSwitch() {
      if (!ready) throw userError("PROVIDER_MODE_DISABLED");
      return partnerFetch();
    },
  };
}

module.exports = { createPinwheelDirectDepositProvider };
