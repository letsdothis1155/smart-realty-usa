/* Shows a dismissible banner when API reports insecure default secrets */
(function () {
  const DISMISS_KEY = "sru_sec_banner_dismissed";

  function cfg() {
    return window.SRU_CONFIG || {};
  }

  function clientDefaultIssues() {
    const issues = [];
    const auth = cfg().auth || {};
    if (!auth.demoPassword || auth.demoPassword === "SmartRealty2026") {
      issues.push("Demo password still default (domain-config.js)");
    }
    return issues;
  }

  function apiBase() {
    if (window.SRU_AUTH && typeof window.SRU_AUTH.apiBase === "function") {
      return window.SRU_AUTH.apiBase();
    }
    if (typeof location !== "undefined" && /^https?:/i.test(location.protocol)) {
      return location.origin;
    }
    return "";
  }

  function usePhp() {
    if (window.SRU_AUTH && typeof window.SRU_AUTH.usePhp === "function") {
      return window.SRU_AUTH.usePhp();
    }
    return true;
  }

  async function fetchServerStatus() {
    const base = apiBase();
    if (!base) return null;
    const path = usePhp() ? "/api/security-status.php" : "/api/security-status";
    try {
      const res = await fetch(base + path, { method: "GET", cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function render(messages) {
    if (!messages.length) return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const bar = document.createElement("div");
    bar.id = "sruSecurityBanner";
    bar.className = "sru-sec-banner";
    bar.setAttribute("role", "alert");
    bar.innerHTML = `
      <div class="sru-sec-inner">
        <div class="sru-sec-text">
          <strong>Security checklist</strong>
          <span>${messages.map(escapeHtml).join(" · ")}</span>
          <a href="SECRETS.md" class="sru-sec-link">How to fix</a>
        </div>
        <button type="button" class="sru-sec-dismiss" aria-label="Dismiss">✕</button>
      </div>`;
    document.body.appendChild(bar);
    document.body.classList.add("has-sec-banner");
    bar.querySelector(".sru-sec-dismiss").addEventListener("click", () => {
      sessionStorage.setItem(DISMISS_KEY, "1");
      bar.remove();
      document.body.classList.remove("has-sec-banner");
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const messages = clientDefaultIssues();
    const server = await fetchServerStatus();
    if (server && server.insecure && Array.isArray(server.messages)) {
      server.messages.forEach((m) => {
        if (m && !messages.includes(m)) messages.push(m);
      });
    } else if (!server) {
      // Static preview: still warn about client demo password
    }
    render(messages);
  });
})();
