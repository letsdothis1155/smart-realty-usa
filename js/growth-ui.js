/* Shared chrome + page bootstraps for SmartRealty growth surfaces */
(function () {
  const G = () => window.SRU_GROWTH;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function headerHtml(active) {
    const link = (href, label, key) =>
      `<a href="${href}" class="g-nav-link${active === key ? " is-active" : ""}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;
    return `
    <div class="ambient ambient-1" aria-hidden="true"></div>
    <div class="ambient ambient-2" aria-hidden="true"></div>
    <header class="g-header">
      <div class="container g-header-inner">
        <a href="/" class="logo">
          <span class="logo-mark">SR</span>
          <span class="logo-text"><strong>Smart Realty</strong><small>USA</small></span>
        </a>
        <nav class="g-nav" id="gNav">
          ${link("/start/", "Start", "start")}
          ${link("/direct-deposit/", "Direct deposit", "dd")}
          ${link("/goals/", "Goals", "goals")}
          ${link("/services/", "Services", "services")}
          ${link("/learn/", "Learn", "learn")}
        </nav>
        <div class="g-header-actions">
          <a class="btn btn-ghost btn-sm" href="/account.html">Account</a>
          <a class="btn btn-primary btn-sm" href="/direct-deposit/setup/">Set up</a>
          <button class="menu-toggle g-menu" id="gMenu" type="button" aria-label="Open menu"><span></span><span></span><span></span></button>
        </div>
      </div>
    </header>`;
  }

  function footerHtml() {
    return `
    <footer class="g-footer">
      <div class="container g-footer-grid">
        <div>
          <a href="/" class="logo">
            <span class="logo-mark">SR</span>
            <span class="logo-text"><strong>Smart Realty</strong><small>USA</small></span>
          </a>
          <p class="g-footer-tag">Get paid → organize → build a goal → prepare for property.</p>
          <p class="g-fine">SmartRealty is not a bank or licensed brokerage. No guaranteed savings, ownership, or returns.</p>
        </div>
        <div>
          <h5>Product</h5>
          <a href="/start/">Start</a>
          <a href="/buy/">Buy</a>
          <a href="/sell/">Sell</a>
          <a href="/rent/">Rent</a>
          <a href="/showing/">Showing</a>
          <a href="/list/">List a property</a>
          <a href="/services/">Services</a>
          <a href="/copy/">Listing copy</a>
          <a href="/invest/">Investor calculator</a>
        </div>
        <div>
          <h5>Learn</h5>
          <a href="/learn/">Guides</a>
          <a href="/goals/">Property goals</a>
          <a href="/locations/">Locations</a>
          <a href="/pricing/">Plans</a>
          <a href="/plus/">Plus</a>
          <a href="/security/">Trust center</a>
        </div>
        <div>
          <h5>Company</h5>
          <a href="/#business">LLC facts</a>
          <a href="/advertise/">Advertise</a>
          <a href="/invoice/">Invoice</a>
          <a href="/account.html">Request an account</a>
          <a href="/early-access/">Early access</a>
          <a href="/privacy.html">Privacy</a>
          <a href="mailto:ai@smartrealty.us">ai@smartrealty.us</a>
        </div>
      </div>
      <div class="container g-footer-bottom">
        <p>© 2026 SMART REALTY.US LLC · Louisville, KY · Public demo ahead of full brokerage licensing</p>
      </div>
    </footer>`;
  }

  function suggestionsHtml() {
    const g = G();
    if (!g) return "";
    const goals = g.listGoals();
    const funnel = g.funnelSnapshot();
    const items = [];
    if (!goals.length) {
      items.push({
        t: "Create your first Home Goal",
        d: "Give payday a destination — rent, a down payment, or a maintenance reserve.",
        href: "/goals/",
        cta: "Create a goal",
      });
    } else if (!funnel.stages.connect && !funnel.stages.allocation) {
      items.push({
        t: "Want to automatically fund this from your paycheck?",
        d: "Direct deposit setup is a preview. Live payroll switching is not on yet.",
        href: "/direct-deposit/setup/",
        cta: "See setup",
      });
    }
    if (funnel.stages.allocation && !funnel.stages.smartsplit) {
      items.push({
        t: "Try SmartSplit",
        d: "A coming-soon way to picture one paycheck across several housing goals.",
        href: "/direct-deposit/#smartsplit",
        cta: "Preview",
      });
    }
    if (goals.some((x) => g.goalProgress(x) >= 10)) {
      items.push({
        t: "You're making progress 🎉",
        d: "Share the milestone without amounts unless you choose to.",
        href: "/share/",
        cta: "Optional share",
      });
    }
    if (!items.length) return "";
    return `<aside class="g-suggest" aria-label="Next step">
      ${items
        .slice(0, 1)
        .map(
          (s) => `<div class="g-suggest-card">
        <div><strong>${esc(s.t)}</strong><p>${esc(s.d)}</p></div>
        <a class="btn btn-outline btn-sm" href="${esc(s.href)}">${esc(s.cta)}</a>
      </div>`
        )
        .join("")}
    </aside>`;
  }

  function injectChrome(active) {
    const mount = $("#gChrome");
    if (mount && !mount.dataset.ready) {
      mount.innerHTML = headerHtml(active);
      mount.dataset.ready = "1";
    }
    const foot = $("#gFoot");
    if (foot && !foot.dataset.ready) {
      foot.innerHTML = footerHtml();
      foot.dataset.ready = "1";
    }
    const sug = $("#gSuggest");
    if (sug) sug.innerHTML = suggestionsHtml();
    $("#gMenu")?.addEventListener("click", () => {
      $("#gNav")?.classList.toggle("open");
    });
  }

  function applyExperiments() {
    const g = G();
    if (!g) return null;
    const copy = g.experimentCopy();
    $$("[data-exp-headline]").forEach((el) => {
      el.textContent = copy.headline;
    });
    $$("[data-exp-cta]").forEach((el) => {
      el.textContent = copy.cta;
    });
    $$("[data-exp-explain]").forEach((el) => {
      el.textContent = copy.explanation;
    });
    return copy;
  }

  function bindCtas() {
    const g = G();
    $$("[data-track]").forEach((el) => {
      el.addEventListener("click", () => {
        const ev = el.getAttribute("data-track");
        const src = el.getAttribute("data-source") || "page";
        g?.track(ev, { source: src, href: (el.getAttribute("href") || "").slice(0, 80) });
        if (ev === "cta_clicked") g?.markConvert("dd_cta", "click");
      });
    });
  }

  function renderSmartSplit() {
    const root = $("#smartsplitViz");
    if (!root) return;
    const g = G();
    g?.track("smartsplit_viewed", { source: "landing" });
    const rows = [
      { id: "avail", label: "Available", color: "var(--primary)" },
      { id: "home", label: "Home Fund", color: "var(--gold)" },
      { id: "rent", label: "Rent Fund", color: "var(--accent)" },
      { id: "reserve", label: "Property Reserve", color: "var(--success)" },
    ];
    const state = { avail: 40, home: 30, rent: 20, reserve: 10 };
    function paint() {
      const total = rows.reduce((s, r) => s + state[r.id], 0) || 1;
      root.innerHTML = `
        <div class="ss-flow">
          <div class="ss-paycheck">YOUR PAYCHECK</div>
          <div class="ss-arrow" aria-hidden="true">↓</div>
          <div class="ss-split-label">SmartSplit <span class="g-soon">Coming soon</span></div>
          <div class="ss-arrow" aria-hidden="true">↓</div>
          <div class="ss-stack">
            ${rows
              .map((r) => {
                const pct = Math.round((state[r.id] / total) * 100);
                return `<div class="ss-row">
                  <div class="ss-row-head"><span>${esc(r.label)}</span><strong>${pct}%</strong></div>
                  <input type="range" min="0" max="100" value="${state[r.id]}" data-ss="${r.id}" aria-label="${esc(r.label)} share" />
                  <div class="ss-bar"><span style="width:${pct}%;background:${r.color}"></span></div>
                </div>`;
              })
              .join("")}
          </div>
          <p class="g-fine">Illustrative only. SmartSplit is not live and does not move money.</p>
        </div>`;
      $$("input[data-ss]", root).forEach((inp) => {
        inp.addEventListener("input", () => {
          state[inp.getAttribute("data-ss")] = Number(inp.value) || 0;
          paint();
        });
      });
    }
    paint();
  }

  function bootLanding() {
    const g = G();
    g?.bootPage("direct_deposit");
    injectChrome("dd");
    applyExperiments();
    bindCtas();
    renderSmartSplit();
    const how = $("#seeHow");
    how?.addEventListener("click", (e) => {
      e.preventDefault();
      g?.track("cta_clicked", { source: "see_how" });
      $("#how")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function bootSetup() {
    const g = G();
    g?.bootPage("direct_deposit");
    g?.track("onboarding_started", { source: "setup" });
    g?.recordFunnel("education");
    g?.evaluateLifecycle("direct_deposit_started");
    injectChrome("dd");
    bindCtas();
    const steps = $$(".setup-step");
    let i = 0;
    function show(n) {
      i = Math.max(0, Math.min(steps.length - 1, n));
      steps.forEach((el, idx) => el.classList.toggle("hidden", idx !== i));
      if (i === 1) {
        g?.recordFunnel("connect");
        g?.track("payer_search", { source: "setup" });
      }
      if (i === 2) g?.recordFunnel("allocation");
    }
    show(0);
    $$("[data-next]").forEach((b) => b.addEventListener("click", () => show(i + 1)));
    $$("[data-prev]").forEach((b) => b.addEventListener("click", () => show(i - 1)));
    $("#payerSearch")?.addEventListener("input", (e) => {
      const q = e.target.value.trim();
      if (q.length >= 2) g?.track("payer_search", { q_len: q.length });
    });
    $$("[data-payer]").forEach((b) => {
      b.addEventListener("click", () => {
        g?.track("payer_selected", { demo: true });
        show(i + 1);
      });
    });
    $("#submitSetup")?.addEventListener("click", () => {
      g?.track("direct_deposit_started", { source: "setup" });
      g?.track("direct_deposit_submitted", { source: "setup", mode: "preview" });
      g?.recordFunnel("allocation");
      g?.evaluateLifecycle("direct_deposit_started");
      show(steps.length - 1);
    });
  }

  function renderGoals() {
    const g = G();
    const list = $("#goalList");
    if (!list || !g) return;
    const items = g.listGoals();
    if (!items.length) {
      list.innerHTML = `<p class="g-empty">No goals yet. Pick a template or name your own. Progress is what you record — not a promised outcome.</p>`;
      return;
    }
    list.innerHTML = items
      .map((item) => {
        const pct = g.goalProgress(item);
        return `<article class="goal-card glass" data-id="${esc(item.id)}">
          <header><span>${esc(item.icon)}</span><h3>${esc(item.name)}</h3></header>
          <p class="goal-amt">${esc(g.formatMoney(item.currentCents))} / ${esc(g.formatMoney(item.targetCents))}</p>
          <div class="goal-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
          <p class="goal-pct">${pct}%</p>
          <div class="goal-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-add="2500">+$25</button>
            <button type="button" class="btn btn-ghost btn-sm" data-add="10000">+$100</button>
            <button type="button" class="btn btn-outline btn-sm" data-del>Remove</button>
          </div>
        </article>`;
      })
      .join("");
    list.querySelectorAll(".goal-card").forEach((card) => {
      const id = card.getAttribute("data-id");
      card.querySelectorAll("[data-add]").forEach((b) => {
        b.addEventListener("click", () => {
          g.addProgress(id, Number(b.getAttribute("data-add")));
          renderGoals();
          const sug = $("#gSuggest");
          if (sug) sug.innerHTML = suggestionsHtml();
        });
      });
      card.querySelector("[data-del]")?.addEventListener("click", () => {
        g.removeGoal(id);
        renderGoals();
      });
    });
  }

  function bootGoals() {
    const g = G();
    g?.bootPage("goals");
    injectChrome("goals");
    bindCtas();
    const sel = $("#goalTemplate");
    if (sel && g) {
      sel.innerHTML = g.GOAL_TEMPLATES.map((t) => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join("");
    }
    $("#goalForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const templateId = $("#goalTemplate")?.value;
      const custom = $("#goalName")?.value.trim();
      const target = Math.round((Number($("#goalTarget")?.value) || 0) * 100);
      const name = custom || g.GOAL_TEMPLATES.find((t) => t.id === templateId)?.name;
      const created = g.createGoal({ name, templateId, targetCents: target });
      const upgradeMount = $("#gUpgrade");
      if (created && created.error === "limit") {
        const copy = window.SRU_PROFIT?.promptUpgrade("unlimited_property_goals", {
          afterValue: true,
          context: "second_goal",
        });
        if (upgradeMount) upgradeMount.innerHTML = window.SRU_PROFIT?.upgradeCardHtml(copy) || "";
        return;
      }
      $("#goalName").value = "";
      renderGoals();
      const sug = $("#gSuggest");
      if (sug) sug.innerHTML = suggestionsHtml();
      if (created && created.first && created.ok) {
        const copy = window.SRU_PROFIT?.promptUpgrade("unlimited_property_goals", {
          afterValue: true,
          context: "first_goal_complete",
        });
        if (upgradeMount) upgradeMount.innerHTML = window.SRU_PROFIT?.upgradeCardHtml(copy) || "";
      }
    });
    $("#agentConsentForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const on = $("#agentConsent")?.checked;
      const msg = $("#agentMsg");
      if (!on) {
        msg.textContent = "Help is optional. Check the box only if you want to request a future introduction.";
        return;
      }
      g?.track("cta_clicked", { source: "agent_connect_consent" });
      msg.textContent =
        "Request noted on this device. SmartRealty will not send financial details to a third party from this form.";
    });
    renderGoals();
  }

  function bootEarlyAccess() {
    const g = G();
    g?.bootPage("early_access");
    injectChrome("ea");
    bindCtas();
    const form = $("#eaForm");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("#eaMsg");
      const btn = $("#eaBtn");
      btn.disabled = true;
      try {
        const res = await g.submitWaitlist({
          email: $("#eaEmail").value,
          firstName: $("#eaName").value,
          interest: $("#eaInterest").value,
          source: "early_access",
        });
        g.markConvert("dd_headline", "signup");
        const url = g.referralUrl(res.referral.code);
        msg.innerHTML = `You're on the list. Optional invite link (no cash rewards): <code>${esc(url)}</code>`;
        msg.classList.remove("hidden", "err");
        msg.classList.add("ok");
        form.reset();
      } catch (err) {
        msg.textContent = err.message || "Could not join.";
        msg.classList.remove("hidden", "ok");
        msg.classList.add("err");
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bootInvite() {
    const g = G();
    const params = new URLSearchParams(location.search);
    let code = params.get("r") || params.get("code") || "";
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "invite" && parts[1]) code = parts[1];
    if (code) {
      const q = new URLSearchParams(location.search);
      if (!q.get("r")) {
        q.set("r", code);
        history.replaceState({}, "", "/invite/?" + q.toString());
      }
    }
    g?.bootPage("invite");
    injectChrome("ea");
    const el = $("#inviteCode");
    if (el) el.textContent = (code || "—").toUpperCase();
  }

  function bootPartner() {
    const g = G();
    const params = new URLSearchParams(location.search);
    let slug = params.get("p") || params.get("partner") || "";
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "p" && parts[1]) slug = parts[1];
    if (slug) {
      history.replaceState({}, "", "/p/?p=" + encodeURIComponent(slug));
    }
    g?.bootPage("partner", { partner: String(slug || "").slice(0, 40) });
    injectChrome("");
    const el = $("#partnerName");
    if (el) el.textContent = slug || "partner";
  }

  function bootShare() {
    const g = G();
    g?.bootPage("share");
    injectChrome("goals");
    const goals = g?.listGoals() || [];
    const sel = $("#shareGoal");
    if (sel) {
      sel.innerHTML = goals.length
        ? goals.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")
        : `<option value="">Create a goal first</option>`;
    }
    function paint() {
      const id = $("#shareGoal")?.value;
      const goal = goals.find((x) => x.id === id);
      const include = $("#shareAmt")?.checked;
      const card = g.shareCard({ goal, includeAmount: include });
      $("#shareText").textContent = card.text;
      $("#sharePreview").textContent = card.text;
    }
    $("#shareAmt")?.addEventListener("change", paint);
    $("#shareGoal")?.addEventListener("change", paint);
    $("#shareBtn")?.addEventListener("click", async () => {
      const id = $("#shareGoal")?.value;
      const goal = goals.find((x) => x.id === id);
      const card = g.shareCard({ goal, includeAmount: $("#shareAmt")?.checked });
      g.track("share_created", { includes_amount: !!card.includesAmount });
      g.track("referral_shared", {});
      const payload = card.text + " " + g.referralUrl();
      try {
        if (navigator.share) await navigator.share({ text: payload, url: card.url });
        else {
          await navigator.clipboard.writeText(payload);
          $("#shareMsg").textContent = "Copied. Nothing was posted automatically.";
        }
      } catch {
        $("#shareMsg").textContent = "Share canceled.";
      }
    });
    paint();
  }

  function bootSecurity() {
    G()?.bootPage("security");
    injectChrome("sec");
    bindCtas();
  }

  function bootLearn() {
    G()?.bootPage("learn", { slug: document.body.getAttribute("data-slug") || "" });
    injectChrome("learn");
    bindCtas();
  }

  function bootLocation() {
    G()?.bootPage("location", { city: document.body.getAttribute("data-city") || "" });
    injectChrome("learn");
    bindCtas();
  }

  function bootProductPage(pageKey, nav) {
    const g = G();
    g?.bootPage(pageKey);
    injectChrome(nav || "");
    bindCtas();
    window.SRU_PROFIT?.refreshCatalog?.();
  }

  function bootPricing() {
    bootProductPage("pricing", "pricing");
    G()?.track("billing_catalog_view", {});
    const mount = $("#planGrid");
    const P = window.SRU_PROFIT;
    if (!mount || !P) return;
    const cat = P.cachedOrDefault();
    const order = ["free", "plus", "pro", "business"];
    mount.innerHTML = order
      .map((id) => {
        const p = cat.plans[id];
        if (!p) return "";
        const price = P.money(p.priceMonthlyCents);
        const save = P.savingsCopy(p);
        const soon = p.comingSoon ? ' <span class="g-soon">Coming soon</span>' : "";
        return `<article class="g-card plan-card">
          <h2>${esc(p.name)}${soon}</h2>
          <p class="plan-price">${esc(price)}<small>/mo</small></p>
          ${save ? `<p class="g-fine">${esc(save)}</p>` : ""}
          <p>${esc(p.tagline || "")}</p>
          <a class="btn ${id === "plus" ? "btn-primary" : "btn-outline"}" href="/${id === "free" ? "goals" : id}/">${id === "free" ? "Use Free" : "Learn more"}</a>
        </article>`;
      })
      .join("");
  }

  function bootNotifications() {
    const g = G();
    g?.bootPage("notifications");
    injectChrome("");
    const prefs = g.notifPrefs();
    const map = {
      emailTransactional: "#nTx",
      emailMarketing: "#nMkt",
      pushSetup: "#nPushSetup",
      pushProgress: "#nPushProg",
      pushConnection: "#nPushConn",
      inApp: "#nInApp",
    };
    Object.entries(map).forEach(([k, sel]) => {
      const el = $(sel);
      if (el) el.checked = !!prefs[k];
      el?.addEventListener("change", () => g.setNotifPrefs({ [k]: el.checked }));
    });
    const opt = $("#nOptOut");
    if (opt) opt.checked = g.marketingOptOut();
    opt?.addEventListener("change", () => g.setMarketingOptOut(opt.checked));
  }

  const page = document.body.getAttribute("data-growth");
  const boots = {
    landing: bootLanding,
    setup: bootSetup,
    goals: bootGoals,
    early: bootEarlyAccess,
    invite: bootInvite,
    partner: bootPartner,
    share: bootShare,
    security: bootSecurity,
    learn: bootLearn,
    location: bootLocation,
    notifications: bootNotifications,
    pricing: bootPricing,
    plus: () => {
      G()?.track("plus_view", {});
      bootProductPage("plus", "pricing");
    },
    pro: () => {
      G()?.track("pro_view", {});
      bootProductPage("pro", "pricing");
    },
    professionals: () => {
      G()?.track("professionals_view", {});
      bootProductPage("professionals", "pros");
    },
    agents: () => bootProductPage("agents", "pricing"),
    business: () => bootProductPage("business", "pricing"),
    workplace: () => bootProductPage("workplace", "pricing"),
    marketplace: () => {
      G()?.track("marketplace_view", {});
      bootProductPage("marketplace", "pros");
    },
    intel: () => bootProductPage("intel", "pricing"),
    owner: () => bootProductPage("owner", "pricing"),
  };
  if (page && boots[page]) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boots[page]);
    else boots[page]();
  }

  window.SRU_GROWTH_UI = {
    injectChrome,
    applyExperiments,
    suggestionsHtml,
    renderGoals,
    esc,
  };
})();
