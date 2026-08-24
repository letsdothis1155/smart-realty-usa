"use strict";

const { userError } = require("../constants");
const { mapResoProperty } = require("../mapper");

/**
 * RESO Web API adapter (designed, not live).
 * Targets the RESO Web API / Data Dictionary standard used by MLS Grid,
 * Bridge Interactive, and Spark API (FBS) — OAuth2 client-credentials
 * against a token endpoint, then OData queries against a Property resource.
 *
 * Enable only when:
 *   LISTINGS_MODE=provider
 *   RESO_CLIENT_ID / RESO_CLIENT_SECRET / RESO_TOKEN_URL / RESO_QUERY_URL set
 *   an active IDX/MLS data-license agreement is in place — set
 *   LISTINGS_IDX_AGREEMENT_ACCEPTED=1 only once that's true. IDX rules
 *   require broker/agent attribution and an "as of" timestamp on every
 *   listing shown publicly (see mapper.js) and honoring the MLS's
 *   do-not-display / opt-out flags — this adapter never strips them.
 *
 * This module makes no live network calls until configured; it is a
 * scaffold for whichever RESO Web API vendor you contract with.
 */
function createResoListingsProvider(config = {}) {
  const clientId = String(config.clientId || "");
  const clientSecret = String(config.clientSecret || "");
  const tokenUrl = String(config.tokenUrl || "");
  const queryUrl = String(config.queryUrl || "").replace(/\/$/, "");
  const ready = !!(clientId && clientSecret && tokenUrl && queryUrl);

  let cachedToken = null; // { accessToken, expiresAt }

  async function getAccessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
      return cachedToken.accessToken;
    }
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) throw userError("PROVIDER_UNAVAILABLE");
    const data = await res.json();
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    };
    return cachedToken.accessToken;
  }

  async function odataGet(pathAndQuery) {
    const token = await getAccessToken();
    const res = await fetch(`${queryUrl}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) throw userError("PROVIDER_UNAVAILABLE");
    return res.json();
  }

  async function fetchMediaByListingKeys(listingKeys) {
    if (!listingKeys.length) return {};
    const filter = listingKeys.map((k) => `ResourceRecordKey eq '${k}'`).join(" or ");
    const data = await odataGet(`/Media?$filter=${encodeURIComponent(filter)}&$orderby=Order`);
    const byKey = {};
    for (const record of data.value || []) {
      const key = record.ResourceRecordKey;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(record);
    }
    return byKey;
  }

  return {
    name: "reso",
    sandbox: false,
    configured: ready,

    async fetchListings({ top = 50, skip = 0, filter, modifiedSince } = {}) {
      if (!ready) throw userError("PROVIDER_MODE_DISABLED");
      let resolvedFilter = filter || "StandardStatus eq 'Active'";
      if (!filter && modifiedSince) {
        resolvedFilter = `ModificationTimestamp gt ${modifiedSince}`;
      }
      const data = await odataGet(`/Property?$filter=${encodeURIComponent(resolvedFilter)}&$top=${top}&$skip=${skip}`);
      const records = data.value || [];
      const mediaByKey = await fetchMediaByListingKeys(records.map((r) => r.ListingKey).filter(Boolean));
      return {
        listings: records.map((r) => mapResoProperty(r, mediaByKey)),
        complete: !modifiedSince,
        incremental: !!modifiedSince,
        syncedAt: new Date().toISOString(),
      };
    },
  };
}

module.exports = { createResoListingsProvider };
