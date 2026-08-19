"use strict";

const { createMockDirectDepositProvider } = require("./mock");
const { createPinwheelDirectDepositProvider } = require("./pinwheel");

function createDirectDepositProvider(config = {}) {
  const requested = String(config.mode || "mock").toLowerCase();
  const pinwheel = createPinwheelDirectDepositProvider({
    apiSecret: config.pinwheelApiSecret,
    apiUrl: config.pinwheelApiUrl,
  });

  if (requested === "provider") {
    if (pinwheel.configured && config.productionApproved === true) {
      return pinwheel;
    }
    // Stay on mock until credentials AND compliance approvals exist.
    const mock = createMockDirectDepositProvider();
    mock.forcedFromProvider = true;
    mock.providerReason = pinwheel.configured
      ? "compliance_not_approved"
      : "missing_partner_credentials";
    return mock;
  }

  return createMockDirectDepositProvider();
}

module.exports = { createDirectDepositProvider };
