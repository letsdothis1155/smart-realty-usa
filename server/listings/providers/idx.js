"use strict";

const { userError } = require("../constants");

/**
 * IDX feed adapter (designed, not live).
 * A brokerage IDX feed is a licensed subset of MLS data, usually delivered
 * as RETS, RESO Web API, or a vendor JSON dump. This adapter stays inert
 * until IDX credentials AND a signed display agreement exist.
 *
 * Do not scrape IDX websites. Connect the contracted feed only.
 */
function createIdxListingsProvider(config = {}) {
  const feedUrl = String(config.feedUrl || "");
  const token = String(config.token || "");
  const ready = !!(feedUrl && token && config.agreementAccepted === true);

  return {
    name: "idx",
    kind: "IdxListingProvider",
    sandbox: false,
    configured: ready,
    async fetchListings() {
      if (!ready) throw userError("PROVIDER_MODE_DISABLED");
      const res = await fetch(feedUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) throw userError("PROVIDER_UNAVAILABLE");
      const data = await res.json();
      const rows = Array.isArray(data) ? data : data.listings || data.value || [];
      return {
        listings: rows,
        complete: true,
        incremental: false,
        syncedAt: new Date().toISOString(),
      };
    },
  };
}

module.exports = { createIdxListingsProvider };
