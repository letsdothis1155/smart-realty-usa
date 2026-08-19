"use strict";

/**
 * SmartSplit — future allocation of incoming income toward:
 *   available balance, rent/mortgage reserve, home fund,
 *   property reserve, security deposit, closing costs, maintenance.
 *
 * NOT activated. Automatic investment / sweep features require
 * regulatory and legal review before any live use.
 *
 * Direct Deposit Switching (this project) is system A.
 * SmartRealty Payouts (commissions, contractor pay) is system B — separate.
 */

const SMARTSPLIT_DISABLED = true;

const FUTURE_BUCKETS = [
  { id: "available", label: "Available balance" },
  { id: "home_fund", label: "Home fund" },
  { id: "housing_reserve", label: "Rent / mortgage reserve" },
  { id: "property_reserve", label: "Property reserve" },
  { id: "security_deposit", label: "Security deposit savings" },
  { id: "closing_costs", label: "Closing-cost savings" },
  { id: "maintenance", label: "Maintenance reserves" },
];

function assertSmartSplitInactive(input) {
  if (!input) return;
  if (input.smartSplit || input.buckets || input.autoInvest) {
    const err = new Error("SmartSplit is not available. Allocation is limited to a single destination.");
    err.code = "SMARTSPLIT_DISABLED";
    err.status = 400;
    err.expose = true;
    throw err;
  }
}

module.exports = { SMARTSPLIT_DISABLED, FUTURE_BUCKETS, assertSmartSplitInactive };
