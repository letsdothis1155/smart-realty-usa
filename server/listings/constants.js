"use strict";

const LISTING_STATUS = {
  ACTIVE: "active",
  PENDING: "pending",
  CONTINGENT: "contingent",
  SOLD: "sold",
  OFF_MARKET: "off_market",
  WITHDRAWN: "withdrawn",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  REMOVED: "removed",
};

const ACTIVE_SEARCH_STATUSES = new Set([LISTING_STATUS.ACTIVE]);

const EXPLICIT_INACTIVE_STATUSES = new Set([
  LISTING_STATUS.SOLD,
  LISTING_STATUS.OFF_MARKET,
  LISTING_STATUS.WITHDRAWN,
  LISTING_STATUS.EXPIRED,
  LISTING_STATUS.CANCELLED,
  LISTING_STATUS.REMOVED,
]);

const SYNC_DEFAULTS = {
  intervalMs: 60 * 60 * 1000,
  absentStreakLimit: 3,
  providerTimeoutMs: 180_000,
  streetViewRecheckMs: 7 * 24 * 60 * 60 * 1000,
  streetViewMetadataBudgetPerSync: 40,
  streetViewStaticBudgetPerHour: 200,
  lockTtlMs: 50 * 60 * 1000,
  maxRunLog: 50,
};

// Maps RESO Data Dictionary StandardStatus values to SmartRealty's status enum.
const RESO_STATUS_MAP = {
  Active: LISTING_STATUS.ACTIVE,
  "Active Under Contract": LISTING_STATUS.PENDING,
  Pending: LISTING_STATUS.PENDING,
  Contingent: LISTING_STATUS.CONTINGENT,
  Closed: LISTING_STATUS.SOLD,
  Sold: LISTING_STATUS.SOLD,
  Withdrawn: LISTING_STATUS.WITHDRAWN,
  Canceled: LISTING_STATUS.CANCELLED,
  Cancelled: LISTING_STATUS.CANCELLED,
  Expired: LISTING_STATUS.EXPIRED,
  Delete: LISTING_STATUS.REMOVED,
};

const USER_ERROR = {
  LISTING_NOT_FOUND: {
    code: "LISTING_NOT_FOUND",
    status: 404,
    message: "We couldn't find that listing.",
  },
  PROVIDER_MODE_DISABLED: {
    code: "PROVIDER_MODE_DISABLED",
    status: 503,
    message: "Live MLS data is not enabled. Sample listings are the only available source.",
  },
  PROVIDER_UNAVAILABLE: {
    code: "PROVIDER_UNAVAILABLE",
    status: 503,
    message: "The MLS data provider is temporarily unavailable. Try again later.",
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    status: 403,
    message: "You don't have access to trigger a listings sync.",
  },
};

function userError(code, extra = {}) {
  const base = USER_ERROR[code] || {
    code: "UNKNOWN",
    status: 500,
    message: "Something went wrong.",
  };
  const err = new Error(base.message);
  err.code = base.code;
  err.status = extra.status || base.status;
  err.expose = true;
  return err;
}

module.exports = {
  LISTING_STATUS,
  RESO_STATUS_MAP,
  ACTIVE_SEARCH_STATUSES,
  EXPLICIT_INACTIVE_STATUSES,
  SYNC_DEFAULTS,
  USER_ERROR,
  userError,
};
