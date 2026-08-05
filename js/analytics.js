/* Lightweight product analytics — local ring buffer + optional server beacon */
(function (global) {
  const KEY = "sru_analytics_events";
  const MAX = 200;

  function cfg() {
    return global.SRU_CONFIG || {};
  }

  function enabled() {
    const a = cfg().analytics;
    if (a && a.enabled === false) return false;
    return true;
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    } catch {
      /* quota */
    }
  }

  function track(event, props) {
    if (!enabled() || !event) return;
    const row = {
      e: String(event).slice(0, 64),
      p: props && typeof props === "object" ? props : {},
      t: new Date().toISOString(),
      path: typeof location !== "undefined" ? location.pathname + location.search : "",
    };
    const list = load();
    list.push(row);
    save(list);

    // Optional: POST to API when available (best-effort)
    const base =
      (global.SRU_AUTH && global.SRU_AUTH.apiBase && global.SRU_AUTH.apiBase()) ||
      (typeof location !== "undefined" && /^https?:/i.test(location.protocol)
        ? location.origin
        : "");
    if (!base) return;
    const usePhp =
      global.SRU_AUTH && typeof global.SRU_AUTH.usePhp === "function"
        ? global.SRU_AUTH.usePhp()
        : true;
    const url = base + (usePhp ? "/api/events.php" : "/api/events");
    try {
      const body = JSON.stringify({ event: row.e, props: row.p, t: row.t });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  function recent(n) {
    return load().slice(-(n || 20));
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  global.SRU_ANALYTICS = { track, recent, clear, load };

  document.addEventListener("DOMContentLoaded", () => {
    track("page_view", { title: document.title.slice(0, 80) });
  });
})(window);
