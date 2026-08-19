/* Admin /admin/growth — aggregate metrics, no bank data */
(function () {
  const $ = (s) => document.querySelector(s);
  const KEY = "sru_admin_pass";

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function kpi(label, value) {
    return `<div class="g-kpi"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
  }

  function render(snap, server) {
    const a = snap.acquisition || {};
    const act = snap.activation || {};
    const e = snap.engagement || {};
    const r = snap.referral || {};
    const ret = snap.retention || {};
    const ns = snap.northStar || {};
    $("#nsLine").textContent =
      (ns.metric || "Users actively progressing toward a SmartRealty property goal") +
      ` — this device: ${ns.progressingGoals || 0} progressing / ${ns.totalGoals || 0} goals`;
    $("#acq").innerHTML = [
      kpi("Visitors (local events)", a.visitors ?? 0),
      kpi("Unique (approx)", a.uniqueVisitors ?? 0),
      kpi("Signup rate %", a.signupRate ?? 0),
      kpi("Source", a.trafficSource || "direct"),
      kpi("Campaign", a.campaign || "—"),
      kpi("Landing", a.landingPage || "—"),
    ].join("");
    $("#act").innerHTML = [
      kpi("Accounts / waitlist", act.accountsCreated ?? 0),
      kpi("Onboarding started", act.onboardingStarted ?? 0),
      kpi("Onboarding done", act.onboardingCompleted ?? 0),
      kpi("DD started", act.directDepositSetupStarted ?? 0),
      kpi("Payer selected", act.payerConnected ?? 0),
      kpi("Submitted", act.setupSubmitted ?? 0),
      kpi("Activated", act.setupActivated ?? 0),
      kpi("First deposit", act.firstDepositDetected ?? 0),
    ].join("");
    $("#eng").innerHTML = [
      kpi("Active (this device)", e.activeUsers ?? 0),
      kpi("Goals created", e.goalsCreated ?? 0),
      kpi("SmartSplit views", e.smartsplitUsage ?? 0),
      kpi("Repeat days", e.repeatVisits ?? 0),
    ].join("");
    $("#ref").innerHTML = [
      kpi("Referral links", r.links ?? 0),
      kpi("Clicks", r.clicks ?? 0),
      kpi("Signups", r.signups ?? 0),
      kpi("Qualified", r.qualified ?? 0),
    ].join("");
    $("#ret").innerHTML = [
      kpi("Day 1", ret.day1 ?? 0),
      kpi("Day 7", ret.day7 ?? 0),
      kpi("Day 30", ret.day30 ?? 0),
      kpi("Day 90", ret.day90 ?? 0),
    ].join("");
    const fun = snap.funnel?.stages || {};
    $("#funnel").innerHTML = (window.SRU_GROWTH?.FUNNEL_STAGES || [])
      .map((s) => {
        const row = fun[s.id];
        return `<tr><td>${esc(s.label)}</td><td>${row ? row.count : 0}</td><td>${esc(row?.lastAt || "—")}</td></tr>`;
      })
      .join("");
    const exp = snap.experiments || {};
    $("#exps").textContent = JSON.stringify(exp, null, 2);
    $("#phase").textContent = `Launch phase: ${snap.launchPhase || "private_alpha"} · Paid ads: ${snap.paidAds || "disabled"} · Claims reviewed: ${snap.claimsReviewed ? "yes" : "no"}`;
    if (server && server.waitlist) {
      $("#srvNote").textContent = `Server waitlist rows: ${server.waitlist.signups || 0}. IPs and bank fields are not shown.`;
    }
  }

  async function loadServer(pass) {
    const base = window.SRU_AUTH?.apiBase?.() || location.origin;
    const path = window.SRU_AUTH?.ep?.("growthStats") || "/api/growth-stats.php";
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Password": pass },
      body: JSON.stringify({ password: pass }),
    });
    if (!res.ok) throw new Error("Server stats unavailable");
    return res.json();
  }

  function unlock(pass) {
    const local = window.SRU_GROWTH?.growthSnapshot() || {};
    render(local, null);
    $("#locked").classList.add("hidden");
    $("#dash").classList.remove("hidden");
    if (pass) {
      loadServer(pass)
        .then((s) => {
          sessionStorage.setItem(KEY, pass);
          render({ ...local, server: s }, s);
        })
        .catch(() => {
          $("#srvNote").textContent = "Showing this-browser snapshot. PHP admin stats need a configured API.";
        });
    }
  }

  $("#adminLogin")?.addEventListener("submit", (e) => {
    e.preventDefault();
    unlock($("#adminPass").value);
  });
  $("#useLocal")?.addEventListener("click", () => unlock(""));
  const saved = sessionStorage.getItem(KEY);
  if (saved) unlock(saved);
})();
