/* Admin revenue / economics / profitability / founder dashboards. $0 stays $0. */
(function () {
  const $ = (s) => document.querySelector(s);
  const KEY = "sru_admin_pass";
  const page = document.body.getAttribute("data-admin") || "revenue";

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function money(cents) {
    if (cents == null) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) / 100);
  }
  function kpi(label, value) {
    return `<div class="g-kpi"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
  }
  function pct(n) {
    if (n == null) return "—";
    return `${(Number(n) * 100).toFixed(1)}%`;
  }

  function nav() {
    const links = [
      ["/admin/founder/", "Founder"],
      ["/admin/revenue/", "Revenue"],
      ["/admin/profitability/", "Profitability"],
      ["/admin/economics/", "Economics"],
      ["/admin/growth/", "Growth"],
      ["/admin.html", "Leads"],
    ];
    return links
      .map(([href, label]) => `<a class="btn btn-ghost btn-sm" href="${href}">${label}</a>`)
      .join("");
  }

  function renderFounder(f) {
    $("#dashBody").innerHTML = `
      <p class="auth-lead">${esc(f.notice || "Actual ledger values. Sandbox excluded.")}</p>
      <h1>SMARTREALTY TODAY</h1>
      <div class="g-admin-grid founder-grid">
        ${kpi("Users", f.users ?? 0)}
        ${kpi("Active users", f.activeUsers ?? 0)}
        ${kpi("Paying users", f.payingUsers ?? 0)}
        ${kpi("MRR", money(f.mrrCents))}
        ${kpi("Revenue this month", money(f.revenueThisMonthCents))}
        ${kpi("Costs this month", money(f.costsThisMonthCents))}
        ${kpi("Net operating result", money(f.netOperatingResultCents))}
        ${kpi("New DD setups", f.newDirectDepositSetups ?? 0)}
        ${kpi("Property goals created", f.propertyGoalsCreated ?? 0)}
        ${kpi("Plus conversions", f.plusConversions ?? 0)}
        ${kpi("Business customers", f.businessCustomers ?? 0)}
      </div>
      <p><strong>Are we moving toward profitability?</strong> ${esc({
        yes: "Yes — production operating result is positive.",
        no: "No — production operating result is not yet positive.",
        break_even: "Break-even this month.",
        not_yet_zero_activity: "Not yet. No production revenue or costs are recorded ($0).",
      }[f.areWeMovingTowardProfitability] || f.areWeMovingTowardProfitability || "Not yet. $0 activity.")}</p>
      <p class="g-fine">Live charging: ${f.liveCharging ? "on" : "disabled"} · Live money movement: ${esc(f.liveMoneyMovement || "disabled")} · Invented: ${f.invented ? "yes" : "no"}</p>`;
  }

  function renderRevenue(eco, founder) {
    const u = eco.unit || {};
    const users = eco.users || {};
    $("#dashBody").innerHTML = `
      <p class="auth-lead">Command center. Production only. Null means the formula cannot run yet.</p>
      <div class="g-admin-grid">
        ${kpi("MRR", money(u.MRR))}
        ${kpi("ARR", money(u.ARR))}
        ${kpi("Paying users", users.payingUsers ?? 0)}
        ${kpi("Free users", users.freeUsers ?? 0)}
        ${kpi("Free → paid", pct(u.ConversionRate))}
        ${kpi("ARPU", money(u.ARPU))}
        ${kpi("Churn", pct(u.Churn))}
        ${kpi("LTV", money(u.LTV))}
        ${kpi("CAC", money(u.CAC))}
        ${kpi("Gross revenue", money(eco.revenue?.grossRevenue))}
        ${kpi("Net revenue", money(eco.revenue?.netRevenue))}
        ${kpi("Gross profit", money(eco.results?.grossProfit))}
        ${kpi("Contribution margin", pct(u.ContributionMargin))}
        ${kpi("Operating costs", money(eco.costs?.total))}
        ${kpi("LTV:CAC", u["LTV:CAC"] == null ? "—" : Number(u["LTV:CAC"]).toFixed(2))}
      </div>
      <h2>Alerts</h2>
      <ul>${(eco.alerts || []).map((a) => `<li>${esc(a.message)}</li>`).join("") || "<li>None</li>"}</ul>
      <h2>Revenue over time</h2>
      <table class="admin-table"><thead><tr><th>Date</th><th>Revenue</th><th>Costs</th></tr></thead>
      <tbody>${(eco.series || []).map((r) => `<tr><td>${esc(r.date)}</td><td>${money(r.revenue)}</td><td>${money(r.costs)}</td></tr>`).join("") || `<tr><td colspan="3">No production events</td></tr>`}</tbody></table>
      <p class="g-fine">Toward profitability: ${esc(founder?.areWeMovingTowardProfitability || "not_yet_zero_activity")}</p>`;
  }

  function renderProfit(p) {
    const month = p.revenue?.month || {};
    const res = p.results || {};
    $("#dashBody").innerHTML = `
      <p class="auth-lead">Revenue − cost of revenue = gross profit. Then minus operating expenses.</p>
      <h2>Revenue this month</h2>
      <div class="g-admin-grid">
        ${kpi("Total", money(month.total))}
        ${kpi("Subscriptions", money(month.subscriptions))}
        ${kpi("Marketplace", money(month.marketplace))}
        ${kpi("B2B", money(month.b2b))}
        ${kpi("Partners", money(month.partners))}
        ${kpi("Other", money(month.other))}
      </div>
      <h2>Results (month)</h2>
      <div class="g-admin-grid">
        ${kpi("Revenue", money(res.revenue))}
        ${kpi("Cost of revenue", money(res.costOfRevenue))}
        ${kpi("Gross profit", money(res.grossProfit))}
        ${kpi("Operating expenses", money(res.operatingExpenses))}
        ${kpi("Operating profit / loss", money(res.operatingProfit))}
      </div>
      <h2>Windows</h2>
      <table class="admin-table"><thead><tr><th>Window</th><th>Revenue</th></tr></thead>
      <tbody>${["today","7d","30d","month","quarter","year"].map((w) => `<tr><td>${w}</td><td>${money(p.revenue?.[w]?.total)}</td></tr>`).join("")}</tbody></table>
      <p class="g-fine">${esc(p.breakEvenProgress?.note || "")}</p>`;
  }

  function renderEconomics(eco) {
    const defs = eco.definitions || {};
    $("#dashBody").innerHTML = `
      <p class="auth-lead">Formulas are not adjusted to look better. Null = cannot compute.</p>
      <div class="g-admin-grid">
        ${kpi("ARPU", money(eco.unit?.ARPU))}
        ${kpi("ARPPU", money(eco.unit?.ARPPU))}
        ${kpi("MRR", money(eco.unit?.MRR))}
        ${kpi("ARR", money(eco.unit?.ARR))}
        ${kpi("CAC", money(eco.unit?.CAC))}
        ${kpi("LTV", money(eco.unit?.LTV))}
        ${kpi("Gross margin", pct(eco.unit?.GrossMargin))}
        ${kpi("Contribution margin", pct(eco.unit?.ContributionMargin))}
        ${kpi("Churn", pct(eco.unit?.Churn))}
        ${kpi("Conversion", pct(eco.unit?.ConversionRate))}
        ${kpi("Payback (months)", eco.unit?.PaybackPeriodMonths ?? "—")}
        ${kpi("LTV:CAC", eco.unit?.["LTV:CAC"] ?? "—")}
      </div>
      <h2>Break-even calculator</h2>
      <form class="be-form g-form g-card" id="beForm">
        <label>Monthly fixed costs (USD) <input type="number" id="beFixed" min="0" step="1" value="2000" /></label>
        <label>Average subscription price (USD) <input type="number" id="bePrice" min="0" step="0.01" value="9.99" /></label>
        <label>Gross margin (0–1) <input type="number" id="beMargin" min="0" max="1" step="0.01" value="0.8" /></label>
        <label>Conversion rate (0–1) <input type="number" id="beConv" min="0" max="1" step="0.01" value="0.05" /></label>
        <label>Average acquisition cost (USD) <input type="number" id="beCac" min="0" step="0.01" value="40" /></label>
        <label>Active users <input type="number" id="beUsers" min="0" step="1" value="0" /></label>
        <button class="btn btn-primary" type="submit">Calculate</button>
      </form>
      <pre id="beOut" class="g-fine"></pre>
      <h2>Definitions</h2>
      <dl class="g-trust">${Object.entries(defs).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
    function localBreakEven() {
      const price = Math.round(Number($("#bePrice").value) * 100);
      const margin = Number($("#beMargin").value);
      const contrib = Math.round(price * margin);
      const fixed = Math.round(Number($("#beFixed").value) * 100);
      const n = contrib > 0 ? Math.ceil(fixed / contrib) : null;
      return {
        ok: true,
        formula: "Break-Even Subscribers = Monthly Fixed Costs / Average Contribution Per Subscriber",
        contributionFormula: "Average Contribution Per Subscriber = Average Subscription Price × Gross Margin",
        averageContributionPerSubscriberCents: contrib,
        breakEvenSubscribers: n,
        projection: false,
        guarantee: false,
        notice: "Scenario only. Not a forecast of actual results.",
      };
    }
    $("#beForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pass = sessionStorage.getItem(KEY) || "";
      const body = {
        password: pass,
        monthlyFixedCostsCents: Math.round(Number($("#beFixed").value) * 100),
        averageSubscriptionPriceCents: Math.round(Number($("#bePrice").value) * 100),
        grossMargin: Number($("#beMargin").value),
        conversionRate: Number($("#beConv").value),
        averageAcquisitionCostCents: Math.round(Number($("#beCac").value) * 100),
        activeUsers: Number($("#beUsers").value),
      };
      const fallback = localBreakEven();
      if (!pass) {
        $("#beOut").textContent = JSON.stringify({ ...fallback, offline: true }, null, 2);
        return;
      }
      try {
        const base = window.SRU_AUTH?.apiBase?.() || location.origin;
        const res = await fetch(base + "/api/admin/economics/breakeven", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Admin-Password": pass },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || data.ok === false) {
          $("#beOut").textContent = JSON.stringify({ ...fallback, offline: true, api: data.error || res.status }, null, 2);
          return;
        }
        $("#beOut").textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        $("#beOut").textContent = JSON.stringify({ ...fallback, offline: true }, null, 2);
      }
    });
  }

  async function loadServer(pass) {
    const base = window.SRU_AUTH?.apiBase?.() || location.origin;
    const path = window.SRU_AUTH?.ep?.("profitStats") || "/api/admin/profit";
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Password": pass },
      body: JSON.stringify({ password: pass }),
    });
    if (!res.ok) throw new Error("unavailable");
    return res.json();
  }

  function emptyPayload() {
    return {
      founder: {
        users: 0, activeUsers: 0, payingUsers: 0, mrrCents: 0, revenueThisMonthCents: 0,
        costsThisMonthCents: 0, netOperatingResultCents: 0, newDirectDepositSetups: 0,
        propertyGoalsCreated: 0, plusConversions: 0, businessCustomers: 0,
        areWeMovingTowardProfitability: "not_yet_zero_activity", liveCharging: false,
        liveMoneyMovement: "disabled", invented: false,
        notice: "Local empty snapshot. Connect the API for ledger values. $0 stays $0.",
      },
      economics: {
        unit: { MRR: 0, ARR: 0, ARPU: null, ARPPU: null, CAC: null, LTV: null, GrossMargin: null, ContributionMargin: null, Churn: null, ConversionRate: null, PaybackPeriodMonths: null, "LTV:CAC": null },
        users: { payingUsers: 0, freeUsers: 0 },
        revenue: { grossRevenue: 0, netRevenue: 0, byType: {} },
        costs: { total: 0, costOfRevenue: 0, operatingExpenses: 0, byCategory: {} },
        results: { grossProfit: 0, operatingProfit: 0, contribution: 0 },
        alerts: [{ message: "No production revenue recorded. Live charging is disabled." }],
        series: [],
        definitions: {
          ContributionMargin: "Revenue - Variable Costs",
          MRR: "Monthly recurring revenue from active production subscriptions.",
          CAC: "Marketing cost / new paying customers. 0 new payers → null.",
        },
      },
      profitability: {
        revenue: { today: { total: 0 }, "7d": { total: 0 }, "30d": { total: 0 }, month: { total: 0, subscriptions: 0, marketplace: 0, b2b: 0, partners: 0, other: 0 }, quarter: { total: 0 }, year: { total: 0 } },
        results: { revenue: 0, costOfRevenue: 0, grossProfit: 0, operatingExpenses: 0, operatingProfit: 0 },
        breakEvenProgress: { note: "Enter fixed costs on /admin/economics. No assumed burn." },
      },
    };
  }

  function paint(payload) {
    $("#locked")?.classList.add("hidden");
    $("#dash")?.classList.remove("hidden");
    if (page === "founder") renderFounder(payload.founder || {});
    else if (page === "profitability") renderProfit(payload.profitability || {});
    else if (page === "economics") renderEconomics(payload.economics || {});
    else renderRevenue(payload.economics || {}, payload.founder || {});
  }

  function unlock(pass) {
    const local = emptyPayload();
    paint(local);
    if (!pass) return;
    loadServer(pass)
      .then((s) => {
        sessionStorage.setItem(KEY, pass);
        paint({ ...local, ...s, founder: { ...local.founder, ...(s.founder || {}) } });
      })
      .catch(() => {
        const note = $("#srvNote");
        if (note) note.textContent = "Showing empty actuals. PHP/Node admin stats need a configured API.";
      });
  }

  const top = $("#adminNav");
  if (top) top.innerHTML = nav();
  $("#adminLogin")?.addEventListener("submit", (e) => {
    e.preventDefault();
    unlock($("#adminPass").value);
  });
  $("#useLocal")?.addEventListener("click", () => unlock(""));
  const saved = sessionStorage.getItem(KEY);
  if (saved) unlock(saved);
})();
