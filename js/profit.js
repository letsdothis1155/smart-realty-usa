/* SmartRealty profit client — centralized entitlements and value-first upgrades.
   Live charging is disabled. Never send bank/payroll/card data through this module. */
(function (global) {
  const NS = "sru_p_";
  const KEYS = {
    plan: NS + "plan",
    prompt: NS + "prompt_log",
    catalog: NS + "catalog",
  };

  const FREE_FEATURES = [
    "account",
    "basic_dashboard",
    "direct_deposit_setup",
    "limited_property_goals",
    "basic_income_organization",
    "basic_property_search",
    "standard_education",
    "limited_smartsplit",
    "basic_notifications",
    "legally_required_financial_info",
  ];

  const PLUS_FEATURES = FREE_FEATURES.concat([
    "unlimited_property_goals",
    "advanced_smartsplit",
    "custom_paycheck_allocations",
    "advanced_budgeting",
    "home_buying_prep",
    "rent_planning",
    "moving_planner",
    "closing_cost_planner",
    "property_expense_tracking",
    "advanced_alerts",
    "personalized_property_insights",
    "enhanced_reports",
    "financial_progress_history",
    "family_shared_goals",
    "ai_property_analysis",
  ]);

  const ALWAYS_FREE = new Set([
    "account",
    "basic_dashboard",
    "direct_deposit_setup",
    "limited_property_goals",
    "basic_income_organization",
    "basic_property_search",
    "standard_education",
    "limited_smartsplit",
    "basic_notifications",
    "legally_required_financial_info",
  ]);

  const DEFAULT_LIMITS = { free: { propertyGoals: 1, smartsplitRules: 2 } };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota */
    }
  }

  function planId() {
    return read(KEYS.plan, { id: "free" }).id || "free";
  }

  function setPlan(id) {
    write(KEYS.plan, { id, updatedAt: new Date().toISOString() });
  }

  function featuresFor(id) {
    const cat = read(KEYS.catalog, null);
    const plan = cat?.plans?.[id];
    if (plan?.features) return plan.features;
    if (id === "plus" || id === "pro" || id === "business" || id === "enterprise") return PLUS_FEATURES;
    return FREE_FEATURES;
  }

  function canUse(user, featureId) {
    if (ALWAYS_FREE.has(featureId)) {
      return { ok: true, feature: featureId, reason: "always_free" };
    }
    const plan = planId();
    if (featuresFor(plan).includes(featureId)) {
      return { ok: true, feature: featureId, plan };
    }
    return { ok: false, feature: featureId, plan, reason: "upgrade_required", suggestedPlan: "plus" };
  }

  function checkLimit(limitKey, usedCount) {
    const plan = planId();
    const cat = read(KEYS.catalog, null);
    const limits = cat?.plans?.[plan]?.limits || DEFAULT_LIMITS[plan] || {};
    const limit = limits[limitKey];
    if (limit == null) return { ok: true, limit: null, used: usedCount, plan };
    if (usedCount < limit) return { ok: true, limit, used: usedCount, remaining: limit - usedCount, plan };
    return { ok: false, limit, used: usedCount, remaining: 0, plan, reason: "limit_reached", suggestedPlan: "plus" };
  }

  function money(cents) {
    if (cents == null) return "Custom";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function savingsCopy(plan) {
    const pct = plan?.annualSavingsPercent;
    if (!pct) return "";
    return `Save ${pct}% with annual billing`;
  }

  function promptLog() {
    return read(KEYS.prompt, []) || [];
  }

  function promptUpgrade(featureId, { afterValue = true, context = "" } = {}) {
    if (!afterValue) return null;
    const log = promptLog();
    log.push({ featureId, context, at: new Date().toISOString() });
    write(KEYS.prompt, log.slice(-50));
    global.SRU_GROWTH?.track("upgrade_prompt_shown", { feature: featureId, context: String(context).slice(0, 40) });
    const copy = copyFor(featureId);
    return copy;
  }

  function copyFor(featureId) {
    if (featureId === "unlimited_property_goals") {
      return {
        title: "Want to manage multiple property goals?",
        body: "You already have a goal in motion. SmartRealty Plus unlocks unlimited goals, advanced SmartSplit, and home-buying prep. Direct deposit stays free.",
        cta: "See SmartRealty Plus",
        href: "/plus/",
      };
    }
    if (featureId === "ai_property_analysis") {
      return {
        title: "Property Intelligence is a Plus feature",
        body: "Estimates only — never a guaranteed return. Included with Plus or Pro when live charging is on.",
        cta: "See the feature",
        href: "/property-intelligence/",
      };
    }
    if (featureId === "advanced_smartsplit") {
      return {
        title: "More SmartSplit rules on Plus",
        body: "Free keeps a couple of rules so the tool is real. Plus is for custom paycheck allocations.",
        cta: "See Plus",
        href: "/plus/",
      };
    }
    return {
      title: "A Plus feature, after you've used the free tools",
      body: "Upgrade only if it solves a problem you already have. Cancellation is one click when billing is live.",
      cta: "Compare plans",
      href: "/pricing/",
    };
  }

  function upgradeCardHtml(copy) {
    if (!copy) return "";
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    return `<aside class="g-suggest g-upgrade" data-upgrade="1">
      <div class="g-suggest-card">
        <div>
          <strong>${esc(copy.title)}</strong>
          <p>${esc(copy.body)}</p>
          <p class="g-fine">Live charging is disabled. This is not a paywall and not a charge.</p>
        </div>
        <a class="btn btn-outline btn-sm" href="${esc(copy.href)}" data-track="upgrade_clicked">${esc(copy.cta)}</a>
      </div>
    </aside>`;
  }

  async function refreshCatalog() {
    const auth = global.SRU_AUTH;
    const base = auth?.apiBase?.() || (typeof location !== "undefined" ? location.origin : "");
    const path = auth?.ep?.("billingCatalog") || "/api/billing/catalog";
    try {
      const live = auth?.hasLiveApi ? await auth.hasLiveApi() : false;
      if (!live && !/:8787\b/.test(base)) return cachedOrDefault();
      const res = await fetch(base + path, { cache: "no-store" });
      if (!res.ok) return cachedOrDefault();
      const data = await res.json();
      if (data?.catalog) write(KEYS.catalog, data.catalog);
      return data.catalog;
    } catch {
      return cachedOrDefault();
    }
  }

  function cachedOrDefault() {
    return (
      read(KEYS.catalog, null) || {
        liveCharging: false,
        plans: {
          free: { id: "free", name: "SmartRealty Free", priceMonthlyCents: 0, live: true, limits: DEFAULT_LIMITS.free, features: FREE_FEATURES },
          plus: { id: "plus", name: "SmartRealty Plus", priceMonthlyCents: 999, priceAnnualCents: 9990, annualSavingsPercent: 16.7, comingSoon: true, features: PLUS_FEATURES },
          pro: { id: "pro", name: "SmartRealty Pro", priceMonthlyCents: 2999, priceAnnualCents: 29990, annualSavingsPercent: 16.7, comingSoon: true },
          business: { id: "business", name: "SmartRealty Business", priceMonthlyCents: 7900, comingSoon: true },
        },
      }
    );
  }

  function liveCharging() {
    return false;
  }

  global.SRU_PROFIT = {
    KEYS,
    FREE_FEATURES,
    PLUS_FEATURES,
    canUse,
    checkLimit,
    planId,
    setPlan,
    promptUpgrade,
    upgradeCardHtml,
    copyFor,
    money,
    savingsCopy,
    refreshCatalog,
    cachedOrDefault,
    liveCharging,
  };
})(window);
