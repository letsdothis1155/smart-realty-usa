"use strict";

const { createMockListingsProvider } = require("./mock");
const { createResoListingsProvider } = require("./reso");
const { createHudListingsProvider } = require("./hud");
const { createIdxListingsProvider } = require("./idx");
const { HUD_COVERAGE_STATES, HUD_FOCUS_REGIONS } = require("../locations");

function createCompositeProvider(providers, name = "composite") {
  return {
    name,
    sandbox: providers.every((p) => p.sandbox),
    configured: true,
    children: providers,
    async fetchListings(opts) {
      const batches = await fetchProviderBatches(providers, opts);
      return {
        listings: batches.filter((b) => b.ok).flatMap((b) => b.listings || []),
        syncedAt: new Date().toISOString(),
        complete: batches.filter((b) => b.ok).every((b) => b.complete !== false),
      };
    },
    async fetchBatches(opts) {
      return fetchProviderBatches(providers, opts);
    },
  };
}

async function fetchProviderBatches(providers, opts = {}) {
  const batches = [];
  for (const p of providers) {
    try {
      const result = await p.fetchListings(opts);
      batches.push({
        provider: p.name,
        ok: true,
        complete: result.complete !== false,
        listings: result.listings || [],
      });
    } catch (error) {
      batches.push({
        provider: p.name,
        ok: false,
        complete: false,
        listings: [],
        error: error.message,
      });
    }
  }
  return batches;
}

function createListingsProvider(config = {}) {
  const requested = String(config.mode || "mock").toLowerCase();
  const reso = createResoListingsProvider({
    clientId: config.resoClientId,
    clientSecret: config.resoClientSecret,
    tokenUrl: config.resoTokenUrl,
    queryUrl: config.resoQueryUrl,
  });
  const hud = createHudListingsProvider({
    regions: config.hudRegions && config.hudRegions.length ? config.hudRegions : HUD_COVERAGE_STATES,
    extraRegions: HUD_FOCUS_REGIONS,
    fetchImpl: config.hudFetchImpl,
    allowSampleFallback: config.allowHudSample === true,
  });
  hud.kind = "PublicPropertyProvider";
  const mock = createMockListingsProvider();
  mock.kind = "DevelopmentDemoProvider";
  reso.kind = "ResoListingProvider";
  const idx = createIdxListingsProvider({
    feedUrl: config.idxFeedUrl,
    token: config.idxToken,
    agreementAccepted: config.idxAgreementAccepted === true,
  });

  if (requested === "hud") return hud;
  if (requested === "idx") return idx.configured ? idx : mock;
  if (requested === "public") return createCompositeProvider([mock, hud], "public");

  if (requested === "provider") {
    if (reso.configured && config.idxAgreementAccepted === true) {
      return reso;
    }
    mock.forcedFromProvider = true;
    mock.providerReason = reso.configured ? "idx_agreement_not_accepted" : "missing_reso_credentials";
    return mock;
  }

  return mock;
}

module.exports = { createListingsProvider, createCompositeProvider, createIdxListingsProvider };
