"use strict";

const { createMockListingsProvider } = require("./mock");
const { createResoListingsProvider } = require("./reso");

function createListingsProvider(config = {}) {
  const requested = String(config.mode || "mock").toLowerCase();
  const reso = createResoListingsProvider({
    clientId: config.resoClientId,
    clientSecret: config.resoClientSecret,
    tokenUrl: config.resoTokenUrl,
    queryUrl: config.resoQueryUrl,
  });

  if (requested === "provider") {
    if (reso.configured && config.idxAgreementAccepted === true) {
      return reso;
    }
    // Stay on mock until credentials AND an accepted IDX/MLS data-license
    // agreement exist. Serving live MLS data without a license is exactly
    // the kind of unauthorized scraping this gate exists to prevent.
    const mock = createMockListingsProvider();
    mock.forcedFromProvider = true;
    mock.providerReason = reso.configured ? "idx_agreement_not_accepted" : "missing_reso_credentials";
    return mock;
  }

  return createMockListingsProvider();
}

module.exports = { createListingsProvider };
