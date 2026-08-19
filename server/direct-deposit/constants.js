"use strict";

const SWITCH_STATUS = {
  NOT_CONFIGURED: "not_configured",
  SETUP_STARTED: "setup_started",
  PENDING: "pending",
  ACTIVE: "active",
  ACTION_REQUIRED: "action_required",
  FAILED: "failed",
  DISABLED: "disabled",
};

const CONNECTION_STATUS = {
  STARTED: "started",
  CONNECTED: "connected",
  FAILED: "failed",
  EXPIRED: "expired",
  ACTION_REQUIRED: "action_required",
};

const ALLOCATION_TYPES = ["entire", "percent", "fixed"];

const PAYER_TYPES = ["popular", "employer", "payroll", "gig", "government"];

const USER_ERROR = {
  EMPLOYER_NOT_FOUND: {
    code: "EMPLOYER_NOT_FOUND",
    status: 404,
    message: "We couldn't find that employer. Try a payroll provider or another spelling.",
  },
  UNSUPPORTED_PAYROLL: {
    code: "UNSUPPORTED_PAYROLL",
    status: 422,
    message: "That payroll system isn't supported yet. Choose another payer from the list.",
  },
  SESSION_EXPIRED: {
    code: "SESSION_EXPIRED",
    status: 401,
    message: "Your connection session expired. Start again.",
  },
  CONNECTION_FAILED: {
    code: "CONNECTION_FAILED",
    status: 422,
    message: "We couldn't connect that payer. No payroll password was stored.",
  },
  IDENTITY_REQUIRED: {
    code: "IDENTITY_REQUIRED",
    status: 403,
    message: "Identity verification is required before we can continue.",
  },
  ACCOUNT_UNAVAILABLE: {
    code: "ACCOUNT_UNAVAILABLE",
    status: 409,
    message: "A SmartRealty-linked receiving account isn't available yet.",
  },
  SWITCH_REJECTED: {
    code: "SWITCH_REJECTED",
    status: 422,
    message: "The direct-deposit request was not accepted. No funds were moved.",
  },
  PROVIDER_UNAVAILABLE: {
    code: "PROVIDER_UNAVAILABLE",
    status: 503,
    message: "The payroll partner is temporarily unavailable. Try again later.",
  },
  WEBHOOK_DELAY: {
    code: "WEBHOOK_DELAY",
    status: 202,
    message: "Setup was submitted. Employer or payroll processing can take one or more pay cycles.",
  },
  DUPLICATE_SWITCH: {
    code: "DUPLICATE_SWITCH",
    status: 409,
    message: "A direct-deposit setup is already in progress or active for this payer.",
  },
  NETWORK_FAILURE: {
    code: "NETWORK_FAILURE",
    status: 503,
    message: "Network error. Check your connection and try again.",
  },
  NOT_SIGNED_IN: {
    code: "NOT_SIGNED_IN",
    status: 401,
    message: "Sign in to set up Direct Deposit.",
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    status: 403,
    message: "You don't have access to that Direct Deposit record.",
  },
  INVALID_ALLOCATION: {
    code: "INVALID_ALLOCATION",
    status: 400,
    message: "Choose entire paycheck, a percentage from 1 to 100, or a fixed dollar amount.",
  },
  REAUTH_REQUIRED: {
    code: "REAUTH_REQUIRED",
    status: 401,
    message: "Confirm your password to reveal account details.",
  },
  NOT_PROVISIONED: {
    code: "NOT_PROVISIONED",
    status: 409,
    message: "A banking partner has not issued account and routing numbers yet.",
  },
  PROVIDER_MODE_DISABLED: {
    code: "PROVIDER_MODE_DISABLED",
    status: 503,
    message: "Live payroll switching is not enabled. Sandbox/mock mode is the only available path.",
  },
};

const WEBHOOK_EVENTS = [
  "connection.created",
  "connection.updated",
  "switch.created",
  "switch.pending",
  "switch.active",
  "switch.failed",
  "switch.cancelled",
];

function userError(code, extra = {}) {
  const base = USER_ERROR[code] || {
    code: "UNKNOWN",
    status: 500,
    message: "Something went wrong. No funds were moved.",
  };
  const err = new Error(base.message);
  err.code = base.code;
  err.status = extra.status || base.status;
  err.expose = true;
  return err;
}

module.exports = {
  SWITCH_STATUS,
  CONNECTION_STATUS,
  ALLOCATION_TYPES,
  PAYER_TYPES,
  USER_ERROR,
  WEBHOOK_EVENTS,
  userError,
};
