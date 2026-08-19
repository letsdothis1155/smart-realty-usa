(function () {
  const $ = (s) => document.querySelector(s);
  const KEY = "sru_admin_pass";

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function render() {
    const items = window.SRU_GROWTH.listCampaigns();
    const body = $("#campBody");
    if (!items.length) {
      body.innerHTML = `<tr><td colspan="8" class="admin-empty">No campaigns. Defaults seed on first unlock.</td></tr>`;
      return;
    }
    body.innerHTML = items
      .map((c) => {
        const url = window.SRU_GROWTH.campaignUrl(c);
        return `<tr>
          <td>${esc(c.campaign_name)}</td>
          <td>${esc(c.source)} / ${esc(c.medium)}</td>
          <td>${esc(c.status)}</td>
          <td>${esc(c.landing_page)}</td>
          <td>${esc(c.spend)}</td>
          <td>${esc(c.signups)}</td>
          <td>${esc(c.activated_users)}</td>
          <td><a href="${esc(url)}">UTM link</a></td>
        </tr>`;
      })
      .join("");
  }

  async function saveServer(row, pass) {
    if (!pass || !window.SRU_AUTH?.hasLiveApi) return;
    try {
      if (!(await SRU_AUTH.hasLiveApi())) return;
      const base = SRU_AUTH.apiBase();
      await fetch(base + SRU_AUTH.ep("campaigns"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Password": pass },
        body: JSON.stringify({ password: pass, ...row }),
      });
    } catch {
      /* local still saved */
    }
  }

  function unlock() {
    window.SRU_GROWTH.seedDefaultCampaigns();
    $("#locked").classList.add("hidden");
    $("#dash").classList.remove("hidden");
    render();
  }

  $("#adminLogin")?.addEventListener("submit", (e) => {
    e.preventDefault();
    sessionStorage.setItem(KEY, $("#adminPass").value);
    unlock();
  });
  $("#useLocal")?.addEventListener("click", unlock);
  $("#campForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const row = window.SRU_GROWTH.upsertCampaign({
      campaign_name: $("#cName").value,
      source: $("#cSource").value,
      medium: $("#cMedium").value,
      landing_page: $("#cLand").value || "/direct-deposit/",
      status: $("#cStatus").value,
      spend: $("#cSpend").value,
    });
    saveServer(row, sessionStorage.getItem(KEY) || "");
    e.target.reset();
    render();
  });
  if (sessionStorage.getItem(KEY)) unlock();
})();
