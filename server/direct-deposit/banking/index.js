"use strict";

const { createMockBankingProvider } = require("./mock");

function createBankingProvider(config = {}) {
  // Production BaaS (Treasury Prime, Unit, Synapse-class, etc.) is not wired.
  // Always mock until a regulated partner is contracted and approved.
  return createMockBankingProvider({
    sandboxAccountDetails: config.sandboxAccountDetails === true,
  });
}

module.exports = { createBankingProvider };
