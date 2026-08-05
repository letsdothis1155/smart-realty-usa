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
    const url = (authCfg().apiUrl || "").replace(/\/$/, "");
    return url;
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
    const data = await api("/api/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    if (data.token) saveSession(data.token, data.user, !!remember);
    return data;
  }

  async function login({ email, password, remember }) {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    if (data.token) saveSession(data.token, data.user, !!remember);
    return data;
  }

  async function demoLogin(password, remember) {
    // Prefer server so password is not only client-side
    if (apiBase()) {
      const data = await api("/api/auth/demo", {
        method: "POST",
        body: { password },
      });
      if (data.token) saveSession(data.token, data.user, !!remember);
      return data;
    }
    // Explicit local-only fallback. Never enable this in a distributed build.
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
      const data = await api("/api/auth/me", { method: "GET" });
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
    getToken,
    getUser,
    saveSession,
    clearSession,
    register,
    login,
    demoLogin,
    me,
    isSignedIn,
    logout,
    authPageUrl,
  };
})(window);
