"use strict";

const LISTING_STATUS = {
  ACTIVE: "active",
  PENDING: "pending",
  SOLD: "sold",
  OFF_MARKET: "off_market",
};

// Maps RESO Data Dictionary StandardStatus values to SmartRealty's status enum.
const RESO_STATUS_MAP = {
  Active: LISTING_STATUS.ACTIVE,
  "Active Under Contract": LISTING_STATUS.PENDING,
  Pending: LISTING_STATUS.PENDING,
  Closed: LISTING_STATUS.SOLD,
  Withdrawn: LISTING_STATUS.OFF_MARKET,
  Canceled: LISTING_STATUS.OFF_MARKET,
  Expired: LISTING_STATUS.OFF_MARKET,
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

module.exports = { LISTING_STATUS, RESO_STATUS_MAP, USER_ERROR, userError };
