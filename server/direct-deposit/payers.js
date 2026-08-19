"use strict";

/**
 * Sandbox payer catalog used by the mock DirectDepositProvider.
 * Employer results in production must come from the payroll partner API —
 * this list is labeled sandbox and is not a production employer database.
 */
const SANDBOX_PAYERS = [
  { id: "adp", name: "ADP", type: "payroll", popular: true },
  { id: "paychex", name: "Paychex", type: "payroll", popular: true },
  { id: "paylocity", name: "Paylocity", type: "payroll", popular: true },
  { id: "paycor", name: "Paycor", type: "payroll" },
  { id: "dayforce", name: "Dayforce", type: "payroll" },
  { id: "workday", name: "Workday", type: "payroll", popular: true },
  { id: "ukg", name: "UKG", type: "payroll" },
  { id: "gusto", name: "Gusto", type: "payroll" },
  { id: "adp-run", name: "ADP RUN", type: "payroll" },
  { id: "uber", name: "Uber", type: "gig", popular: true },
  { id: "uber-eats", name: "Uber Eats", type: "gig", popular: true },
  { id: "lyft", name: "Lyft", type: "gig", popular: true },
  { id: "doordash", name: "DoorDash", type: "gig", popular: true },
  { id: "instacart", name: "Instacart", type: "gig" },
  { id: "amazon-flex", name: "Amazon Flex", type: "gig" },
  { id: "ssa", name: "Social Security (SSA)", type: "government", popular: true },
  { id: "irs", name: "IRS", type: "government" },
  { id: "va", name: "U.S. Department of Veterans Affairs", type: "government" },
  { id: "ky-unemployment", name: "Kentucky Unemployment", type: "government" },
  { id: "opm", name: "U.S. Office of Personnel Management", type: "government" },
  {
    id: "louisville-demo-employer",
    name: "Louisville Demo Employer",
    type: "employer",
    sandboxOnly: true,
  },
  {
    id: "kentuckiana-sandbox-co",
    name: "Kentuckiana Sandbox Co.",
    type: "employer",
    sandboxOnly: true,
  },
  {
    id: "harmony-rd-holdings",
    name: "Harmony Road Holdings (sandbox)",
    type: "employer",
    sandboxOnly: true,
  },
  {
    id: "unsupported-payroll",
    name: "Legacy Desk Payroll",
    type: "payroll",
    unsupported: true,
    sandboxOnly: true,
  },
  {
    id: "fail-connect",
    name: "Sandbox Fail Connect",
    type: "payroll",
    sandboxOnly: true,
    simulate: "connection_failed",
  },
  {
    id: "kyc-required",
    name: "Sandbox Identity Check",
    type: "payroll",
    sandboxOnly: true,
    simulate: "identity_required",
  },
];

function publicPayer(p) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    popular: !!p.popular,
    unsupported: !!p.unsupported,
    sandbox: true,
  };
}

function searchPayers(query, type) {
  const q = String(query || "").trim().toLowerCase();
  let list = SANDBOX_PAYERS.slice();
  if (!q) {
    list = list.filter((p) => !p.simulate);
    if (type === "popular") list = list.filter((p) => p.popular);
    else if (type) list = list.filter((p) => p.type === type);
  } else {
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    if (type && type !== "popular") {
      list = list.filter((p) => p.type === type);
    }
  }
  return list.map(publicPayer);
}

function findPayer(id) {
  return SANDBOX_PAYERS.find((p) => p.id === id) || null;
}

module.exports = { SANDBOX_PAYERS, publicPayer, searchPayers, findPayer };
