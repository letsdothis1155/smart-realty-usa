/* SmartRealty revenue helpers — leads, listing SKUs, sandbox checkout.
   Live charging is off. Never send card, bank, or payroll data here. */
(function (global) {
  const KEY_LEADS = "sru_rev_leads";
  const KEY_ORDERS = "sru_rev_orders";
  const KEY_EXP = "sru_rev_experiments";

  const INTENTS = [
    { id: "buy", label: "Buy a home" },
    { id: "sell", label: "Sell a home" },
    { id: "rent", label: "Rent" },
    { id: "agent", label: "Find an agent" },
    { id: "finance", label: "Financing information" },
    { id: "value", label: "Property valuation" },
    { id: "showing", label: "Request a showing" },
    { id: "invest", label: "Investment property" },
    { id: "services", label: "Digital real-estate services" },
    { id: "list_upgrade", label: "Listing upgrade" },
  ];

  const STATUSES = ["new", "contacted", "qualified", "follow_up", "won", "lost", "spam"];

  function listingTiers() {
    const cfg = (global.SRU_CONFIG && global.SRU_CONFIG.listingTiers) || {};
    return {
      free: {
        id: "free",
        name: "Free listing",
        monthlyCents: 0,
        blurb: "Basic listing, limited photos, standard placement.",
        ...cfg.free,
      },
      featured: {
        id: "featured",
        name: "Featured",
        monthlyCents: 4900,
        blurb: "Highlighted placement, more photos, listing analytics. Not live billed.",
        ...cfg.featured,
      },
      premium: {
        id: "premium",
        name: "Premium",
        monthlyCents: 14900,
        blurb: "Homepage consideration, badge, lead notices, virtual-tour slot. Not live billed.",
        ...cfg.premium,
      },
    };
  }

  function serviceSkus() {
    const cfg = (global.SRU_CONFIG && global.SRU_CONFIG.serviceSkus) || {};
    return {
      listing_copy: {
        id: "listing_copy",
        name: "Listing copy",
        cents: 14900,
        blurb: "Headlines and a property description you can edit. Informational writing, not an appraisal.",
        ...cfg.listing_copy,
      },
      property_site: {
        id: "property_site",
        name: "Property page",
        cents: 49900,
        blurb: "A dedicated property landing page on SmartRealty. Quote before work starts.",
        ...cfg.property_site,
      },
      seo_starter: {
        id: "seo_starter",
        name: "SEO starter",
        cents: 29900,
        blurb: "Title, description, and internal links for one property or city page. No ranking promise.",
        ...cfg.seo_starter,
      },
    };
  }

  function money(cents) {
    if (!cents) return "Free";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function read(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota */
    }
  }

  function attribution() {
    const a = (global.SRU_GROWTH && SRU_GROWTH.getAttribution && SRU_GROWTH.getAttribution()) || {};
    return {
      utm_source: a.utm_source || "",
      utm_medium: a.utm_medium || "",
      utm_campaign: a.utm_campaign || "",
      referralCode: a.referralCode || "",
      partner: a.partner || "",
    };
  }

  function track(event, props) {
    if (global.SRU_GROWTH && typeof SRU_GROWTH.track === "function") SRU_GROWTH.track(event, props);
    else if (global.SRU_ANALYTICS && typeof SRU_ANALYTICS.track === "function") SRU_ANALYTICS.track(event, props);
  }

  async function submitLead(raw) {
    if (!raw || !raw.consent) throw new Error("Consent is required to store this request.");
    const email = String(raw.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email.");
    const attr = attribution();
    const payload = {
      email,
      name: String(raw.name || "").slice(0, 80),
      phone: String(raw.phone || "").replace(/[^\d+().\-\s]/g, "").slice(0, 32),
      city: String(raw.city || "").slice(0, 80),
      state: String(raw.state || "").slice(0, 40),
      intent: String(raw.intent || "general").slice(0, 40),
      interest: String(raw.intent || raw.interest || "general").slice(0, 120),
      budget: String(raw.budget || "").slice(0, 40),
      property: String(raw.property || "").slice(0, 160),
      message: String(raw.message || "").slice(0, 500),
      consent: true,
      consentAt: new Date().toISOString(),
      source: String(raw.source || "website").slice(0, 80),
      status: "new",
      ...attr,
    };
    const local = read(KEY_LEADS, { items: [] });
    const items = Array.isArray(local.items) ? local.items : [];
    items.push({ id: "local_" + Date.now().toString(36), ...payload, createdAt: payload.consentAt });
    write(KEY_LEADS, { items: items.slice(-200) });
    let server = null;
    try {
      if (global.SRU_AUTH?.hasLiveApi && (await SRU_AUTH.hasLiveApi()) && SRU_AUTH.submitLead) {
        server = await SRU_AUTH.submitLead(payload);
      }
    } catch (err) {
      if (err && err.code !== "NO_API" && err.status !== 405 && err.status !== 503) throw err;
    }
    track("lead_submitted", { intent: payload.intent, source: payload.source });
    track("lead_conversion", { intent: payload.intent });
    return { ok: true, local: true, server };
  }

  function sandboxOrder(sku, kind) {
    const order = {
      id: "ord_" + Date.now().toString(36),
      sku: sku.id,
      kind,
      amountCents: sku.monthlyCents || sku.cents || 0,
      status: "sandbox_pending",
      liveCharging: false,
      createdAt: new Date().toISOString(),
    };
    const data = read(KEY_ORDERS, { items: [] });
    const items = Array.isArray(data.items) ? data.items : [];
    items.push(order);
    write(KEY_ORDERS, { items });
    track("checkout_started", { sku: sku.id, kind });
    track("purchase_sandbox", { sku: sku.id });
    return order;
  }

  function logExperiment(row) {
    const data = read(KEY_EXP, { items: [] });
    const items = Array.isArray(data.items) ? data.items : [];
    items.push({ ...row, at: new Date().toISOString() });
    write(KEY_EXP, { items: items.slice(-80) });
  }

  global.SRU_REVENUE = {
    INTENTS,
    STATUSES,
    listingTiers,
    serviceSkus,
    money,
    submitLead,
    sandboxOrder,
    logExperiment,
    localLeads: () => read(KEY_LEADS, { items: [] }).items || [],
    localOrders: () => read(KEY_ORDERS, { items: [] }).items || [],
  };
})(window);
