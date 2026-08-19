/* ============================================
   Smart Realty USA — Auth client
   Shared by auth.html and the main site gate.
   ============================================ */

(function (global) {
  const TOKEN_KEY = "sru_auth_token";
  const USER_KEY = "sru_auth_user";
  const LEGACY_DEMO_KEY = "sru_demo_unlocked";

  function cfg() {
    return global.SRU_CONFIG || {};
  }

  function authCfg() {
    return cfg().auth || {};
  }

  function apiBase() {
    const raw = authCfg().apiUrl;
    // Explicit empty / "auto" / missing → same origin (GoDaddy website + PHP api/)
    if (raw === "" || raw === "auto" || raw == null) {
      if (typeof location !== "undefined" && /^https?:$/i.test(location.protocol)) {
        return location.origin;
      }
      return "";
    }
    return String(raw).replace(/\/$/, "");
  }

  /** GitHub Pages serves PHP as files and rejects POST (405). Probe once. */
  let liveApiCache = null;
  let liveApiProbe = null;

  async function hasLiveApi() {
    if (liveApiCache != null) return liveApiCache;
    if (liveApiProbe) return liveApiProbe;
    liveApiProbe = (async () => {
      const base = apiBase();
      if (!base) {
        liveApiCache = false;
        return false;
      }
      try {
        const res = await fetch(`${base}${ep("health")}`, { method: "GET", cache: "no-store" });
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (!res.ok || !ct.includes("json")) {
          liveApiCache = false;
          return false;
        }
        const data = await res.json();
        liveApiCache = !!(data && data.ok === true);
        return liveApiCache;
      } catch {
        liveApiCache = false;
        return false;
      }
    })();
    return liveApiProbe;
  }

  /** GoDaddy PHP uses .php files; local Node API does not */
  function usePhp() {
    if (typeof authCfg().usePhp === "boolean") return authCfg().usePhp;
    // default: PHP when same-origin / empty apiUrl; Node when localhost:8787
    const base = apiBase();
    if (/:8787\b/.test(base) || /localhost:87/.test(base)) return false;
    return true;
  }

  function ep(name) {
    const php = usePhp();
    const map = {
      register: php ? "/api/auth/register.php" : "/api/auth/register",
      login: php ? "/api/auth/login.php" : "/api/auth/login",
      demo: php ? "/api/auth/demo.php" : "/api/auth/demo",
      me: php ? "/api/auth/me.php" : "/api/auth/me",
      changePassword: php ? "/api/auth/change-password.php" : "/api/auth/change-password",
      forgotPassword: php ? "/api/auth/forgot-password.php" : "/api/auth/forgot-password",
      resetPassword: php ? "/api/auth/reset-password.php" : "/api/auth/reset-password",
      leads: php ? "/api/leads.php" : "/api/leads",
      health: php ? "/api/health.php" : "/health",
    };
    return map[name] || name;
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveSession(token, user, remember) {
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    try {
      store.setItem(TOKEN_KEY, token);
      store.setItem(USER_KEY, JSON.stringify(user || {}));
      other.removeItem(TOKEN_KEY);
      other.removeItem(USER_KEY);
      // keep legacy gate happy
      sessionStorage.setItem(LEGACY_DEMO_KEY, "1");
    } catch (e) {
      console.warn("Could not persist session", e);
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(LEGACY_DEMO_KEY);
    } catch {
      /* ignore */
    }
  }

  async function api(path, options = {}) {
    const base = apiBase();
    if (!base) {
      const err = new Error("Auth API not configured");
      err.code = "NO_API";
      throw err;
    }
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const token = getToken();
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function register({ name, email, password, remember }) {
    const data = await api(ep("register"), {
      method: "POST",
      body: { name, email, password },
    });
    if (data.token) saveSession(data.token, data.user, !!remember);
    return data;
  }

  async function login({ email, password, remember }) {
    const data = await api(ep("login"), {
      method: "POST",
      body: { email, password },
    });
    if (data.token) saveSession(data.token, data.user, !!remember);
    return data;
  }

  async function demoLogin(password, remember) {
    // Prefer server so password is not only client-side
    if (apiBase()) {
      const data = await api(ep("demo"), {
        method: "POST",
        body: { password },
      });
      if (data.token) saveSession(data.token, data.user, !!remember);
      return data;
    }
    // Explicit local-only fallback. Never enable this in a public build because
    // browser-delivered configuration cannot keep a password secret.
    const expected = authCfg().allowOfflineDemo === true ? authCfg().demoPassword : "";
    if (expected && password === expected) {
      const user = {
        id: "demo",
        name: "Demo Guest",
        email: "demo@smartrealty.us",
        role: "demo",
      };
      saveSession("offline-demo", user, !!remember);
      return { ok: true, user, message: "Demo unlocked (offline)." };
    }
    const err = new Error("Demo access requires a configured authentication API.");
    err.code = "NO_API";
    err.status = 503;
    throw err;
  }

  async function me() {
    const token = getToken();
    if (!token) return null;
    if (token === "offline-demo") return getUser();
    if (!apiBase()) return getUser();
    try {
      const data = await api(ep("me"), { method: "GET" });
      if (data.user) {
        // refresh cached user
        const remember = !!localStorage.getItem(TOKEN_KEY);
        saveSession(token, data.user, remember);
      }
      return data.user || null;
    } catch {
      clearSession();
      return null;
    }
  }

  async function changePassword({ currentPassword, newPassword }) {
    return api(ep("changePassword"), {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  }

  async function forgotPassword(email) {
    return api(ep("forgotPassword"), {
      method: "POST",
      body: { email },
    });
  }

  async function resetPassword({ email, token, password, remember }) {
    const data = await api(ep("resetPassword"), {
      method: "POST",
      body: { email, token, password },
    });
    if (data.token) saveSession(data.token, data.user, !!remember);
    return data;
  }

  async function submitLead({ email, name, source, interest }) {
    if (!(await hasLiveApi())) {
      const err = new Error("API offline");
      err.code = "NO_API";
      err.status = 503;
      throw err;
    }
    return api(ep("leads"), {
      method: "POST",
      body: { email, name, source, interest },
    });
  }

  function isSignedIn() {
    return !!getToken();
  }

  function logout() {
    clearSession();
  }

  function authPageUrl(next) {
    const n = next || "index.html";
    return `auth.html?next=${encodeURIComponent(n)}`;
  }

  global.SRU_AUTH = {
    TOKEN_KEY,
    USER_KEY,
    apiBase,
    hasLiveApi,
    usePhp,
    ep,
    getToken,
    getUser,
    saveSession,
    clearSession,
    register,
    login,
    demoLogin,
    me,
    changePassword,
    forgotPassword,
    resetPassword,
    submitLead,
    isSignedIn,
    logout,
    authPageUrl,
  };
})(window);
