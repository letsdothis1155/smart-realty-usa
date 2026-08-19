"use strict";

const { BANNED_MONETIZATION, ETHICS } = require("./constants");

const SENSITIVE_KEYS =
  /account[_\s-]?number|routing|ssn|social.?security|password|payroll|credential|pin|cvv|card.?number|iban|swift|bank.?account/i;

function rejectSensitivePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  for (const [k, v] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.test(String(k))) {
      return `Refused: ${k} is sensitive financial data and is never stored in the profit engine.`;
    }
    if (typeof v === "string" && /^\d{8,17}$/.test(v.replace(/\s+/g, ""))) {
      return "Refused: value looks like an account or routing number.";
    }
    if (v && typeof v === "object") {
      const nested = rejectSensitivePayload(v);
      if (nested) return nested;
    }
  }
  return null;
}

function assertEthicalRevenue(event) {
  if (!event || typeof event !== "object") {
    throw Object.assign(new Error("Revenue event required."), { expose: true, status: 400, code: "BAD_REVENUE" });
  }
  if (event.kind === "user_deposit" || event.source === "direct_deposit" || event.source === "paycheck") {
    throw Object.assign(
      new Error("A user paycheck or bank deposit is not SmartRealty revenue."),
      { expose: true, status: 400, code: "DEPOSIT_IS_NOT_REVENUE" }
    );
  }
  if (event.sellsUserFinancialData) {
    throw Object.assign(new Error("Selling user financial data is banned."), {
      expose: true,
      status: 400,
      code: "BANNED_MONETIZATION",
    });
  }
  const sensitive = rejectSensitivePayload(event);
  if (sensitive) {
    throw Object.assign(new Error(sensitive), { expose: true, status: 400, code: "SENSITIVE_DATA" });
  }
  return true;
}

function assertEthicalCheckout(input, catalog) {
  if (input?.autoEnroll) {
    throw Object.assign(new Error("Silent enrollment in paid services is banned."), {
      expose: true,
      status: 400,
      code: "BANNED_MONETIZATION",
    });
  }
  if (input?.hidePrice || input?.deceptiveTrial) {
    throw Object.assign(new Error("Deceptive pricing and hidden trials are banned."), {
      expose: true,
      status: 400,
      code: "BANNED_MONETIZATION",
    });
  }
  if (input?.planId === "free") {
    throw Object.assign(new Error("The free plan is not billed."), {
      expose: true,
      status: 400,
      code: "FREE_NOT_BILLED",
    });
  }
  if (catalog && catalog.liveCharging === true && catalog.productionComplianceReview !== "completed") {
    throw Object.assign(new Error("Live charging requires a completed production compliance review."), {
      expose: true,
      status: 403,
      code: "COMPLIANCE_REQUIRED",
    });
  }
  return true;
}

function publicEthics() {
  return {
    ...ETHICS,
    banned: BANNED_MONETIZATION,
    liveMoneyMovement: "disabled",
    note: "Customer trust is an economic asset. Direct deposit is not a paid gate.",
  };
}

module.exports = {
  rejectSensitivePayload,
  assertEthicalRevenue,
  assertEthicalCheckout,
  publicEthics,
  SENSITIVE_KEYS,
};
