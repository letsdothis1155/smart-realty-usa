/* SmartRealty Direct Deposit API client — talks only to SmartRealty APIs */
(function (global) {
  const USER_ERRORS = {
    EMPLOYER_NOT_FOUND: "We couldn't find that employer. Try a payroll provider or another spelling.",
    UNSUPPORTED_PAYROLL: "That payroll system isn't supported yet. Choose another payer from the list.",
    SESSION_EXPIRED: "Your connection session expired. Start again.",
    CONNECTION_FAILED: "We couldn't connect that payer. No payroll password was stored.",
    IDENTITY_REQUIRED: "Identity verification is required before we can continue.",
    ACCOUNT_UNAVAILABLE: "A SmartRealty-linked receiving account isn't available yet.",
    SWITCH_REJECTED: "The direct-deposit request was not accepted. No funds were moved.",
    PROVIDER_UNAVAILABLE: "The payroll partner is temporarily unavailable. Try again later.",
    WEBHOOK_DELAY: "Setup was submitted. Status updates can take time.",
    DUPLICATE_SWITCH: "A direct-deposit setup is already in progress or active for this payer.",
    NETWORK_FAILURE: "Network error. Check your connection and try again.",
    NOT_SIGNED_IN: "Sign in to set up Direct Deposit.",
    FORBIDDEN: "You don't have access to that Direct Deposit record.",
    INVALID_ALLOCATION: "Choose entire paycheck, a percentage from 1 to 100, or a fixed dollar amount.",
    REAUTH_REQUIRED: "Confirm your password to reveal account details.",
    NOT_PROVISIONED: "A banking partner has not issued account and routing numbers yet.",
    PROVIDER_MODE_DISABLED: "Live payroll switching is not enabled.",
  };

  function friendly(err) {
    if (!err) return USER_ERRORS.NETWORK_FAILURE;
    if (err.code && USER_ERRORS[err.code]) return USER_ERRORS[err.code];
    if (err.message && !/stack|exception|sql|econn/i.test(err.message)) return err.message;
    return USER_ERRORS.NETWORK_FAILURE;
  }

  function cfg() {
    return (global.SRU_CONFIG && global.SRU_CONFIG.directDeposit) || {};
  }

  function apiBase() {
    const explicit = cfg().apiUrl;
    if (explicit) return String(explicit).replace(/\/$/, "");
    if (global.SRU_AUTH && typeof global.SRU_AUTH.apiBase === "function") {
      const base = global.SRU_AUTH.apiBase();
      if (base) return base;
    }
    if (typeof location !== "undefined" && /^https?:$/i.test(location.protocol)) {
      return location.origin;
    }
    return "";
  }

  async function request(path, options = {}) {
    const base = apiBase();
    if (!base) {
      const err = new Error(USER_ERRORS.PROVIDER_UNAVAILABLE);
      err.code = "PROVIDER_UNAVAILABLE";
      throw err;
    }
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body != null) headers["Content-Type"] = "application/json";
    const token = global.SRU_AUTH && global.SRU_AUTH.getToken ? global.SRU_AUTH.getToken() : "";
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body != null ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      const err = new Error(USER_ERRORS.NETWORK_FAILURE);
      err.code = "NETWORK_FAILURE";
      throw err;
    }
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      const err = new Error(friendly({ code: data.code, message: data.error }));
      err.code = data.code || "NETWORK_FAILURE";
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const client = {
    apiBase,
    friendly,
    dashboard: () => request("/api/direct-deposit"),
    payers: (q, type) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (type) params.set("type", type);
      const qs = params.toString();
      return request(`/api/direct-deposit/payers${qs ? `?${qs}` : ""}`);
    },
    session: () => request("/api/direct-deposit/session", { method: "POST", body: {} }),
    connect: (sessionId, payerId) =>
      request(`/api/direct-deposit/session/${encodeURIComponent(sessionId)}/connect`, {
        method: "POST",
        body: { payerId },
      }),
    createSwitch: (body) => request("/api/direct-deposit/switch", { method: "POST", body }),
    getSwitch: (id) => request(`/api/direct-deposit/switch/${encodeURIComponent(id)}`),
    cancelSwitch: (id) => request(`/api/direct-deposit/switch/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} }),
    account: () => request("/api/direct-deposit/account"),
    reveal: (password) =>
      request("/api/direct-deposit/account/reveal", { method: "POST", body: { password } }),
  };

  global.SRU_DD = global.SRU_DD || {};
  global.SRU_DD.client = client;
  global.SRU_DD.USER_ERRORS = USER_ERRORS;
})(window);
