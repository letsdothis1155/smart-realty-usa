/* SmartRealty growth kernel — analytics, attribution, experiments, goals,
   referrals, lifecycle, automation. Never send bank/payroll/SSN data. */
(function (global) {
  const NS = "sru_g_";
  const KEYS = {
    attr: NS + "attr",
    exp: NS + "exp",
    funnel: NS + "funnel",
    goals: NS + "goals",
    referral: NS + "referral",
    referredBy: NS + "referred_by",
    partner: NS + "partner",
    waitlist: NS + "waitlist",
    lifecycle: NS + "lifecycle",
    inbox: NS + "inbox",
    notif: NS + "notif",
    campaigns: NS + "campaigns",
    visitors: NS + "visitors",
    firstSeen: NS + "first_seen",
    lastSeen: NS + "last_seen",
    days: NS + "active_days",
    optOut: NS + "mkt_optout",
    launchAck: NS + "launch_ack",
  };

  const SENSITIVE_RE =
    /account[_\s-]?number|routing|ssn|social.?security|password|payroll.?pass|credential|pin|cvv|card.?number|iban|swift|dob|date.?of.?birth|token|secret|bank.?account|full.?ssn/i;

  const BLOCKED_KEYS = [
    "account",
    "accountNumber",
    "routing",
    "routingNumber",
    "ssn",
    "password",
    "payrollPassword",
    "credentials",
    "pin",
    "cvv",
    "token",
    "secret",
    "bankAccount",
    "iban",
  ];

  const EVENT_CATALOG = [
    "landing_page_view",
    "cta_clicked",
    "signup_started",
    "signup_completed",
    "direct_deposit_viewed",
    "payer_search",
    "payer_selected",
    "direct_deposit_started",
    "direct_deposit_submitted",
    "direct_deposit_activated",
    "first_deposit_detected",
    "goal_created",
    "goal_updated",
    "goal_progress",
    "smartsplit_viewed",
    "referral_created",
    "referral_clicked",
    "referral_signup",
    "referral_verified",
    "referral_qualified",
    "referral_shared",
    "reward_pending",
    "reward_issued",
    "waitlist_join",
    "waitlist_error",
    "early_access_view",
    "security_view",
    "learn_view",
    "location_view",
    "partner_click",
    "share_created",
    "experiment_exposure",
    "experiment_convert",
    "onboarding_started",
    "onboarding_abandoned",
    "onboarding_completed",
    "page_view",
    "account_created",
    "upgrade_prompt_shown",
    "upgrade_clicked",
    "billing_catalog_view",
    "plus_view",
    "pro_view",
    "professionals_view",
    "marketplace_view",
  ];

  const FUNNEL_STAGES = [
    { id: "awareness", label: "Awareness" },
    { id: "landing", label: "Landing page" },
    { id: "account", label: "Create account" },
    { id: "education", label: "Direct deposit education" },
    { id: "connect", label: "Connect employer / payroll" },
    { id: "allocation", label: "Set deposit allocation" },
    { id: "first_deposit", label: "First deposit" },
    { id: "smartsplit", label: "SmartSplit setup" },
    { id: "property_goal", label: "Property goal" },
    { id: "retention", label: "Retention" },
    { id: "referral", label: "Referral" },
  ];

  const GOAL_TEMPLATES = [
    { id: "first_home", name: "First Home", icon: "🏠" },
    { id: "down_payment", name: "Down Payment", icon: "🔑" },
    { id: "closing_costs", name: "Closing Costs", icon: "📄" },
    { id: "rent", name: "Rent", icon: "🚪" },
    { id: "security_deposit", name: "Security Deposit", icon: "🔐" },
    { id: "emergency_housing", name: "Emergency Housing Fund", icon: "🛟" },
    { id: "maintenance", name: "Property Maintenance", icon: "🔧" },
    { id: "moving", name: "Moving Fund", icon: "📦" },
    { id: "furniture", name: "Furniture", icon: "🛋️" },
    { id: "renovation", name: "Renovation", icon: "🛠️" },
    { id: "future_property", name: "Future Property", icon: "🗺️" },
    { id: "custom", name: "Custom goal", icon: "✨" },
  ];

  const POSITIONING = {
    primary: "Turn every paycheck into progress toward where you live.",
    alternatives: [
      "Your paycheck. Your property goals.",
      "Get paid. Build toward home.",
      "Put your income to work for your future.",
      "Direct deposit built around real estate.",
      "From payday to property.",
      "A smarter home for your money.",
    ],
    heroA: "Make payday work toward your property goals.",
    heroB: "Turn every paycheck into progress toward home.",
    support:
      "Connect your paycheck to SmartRealty and organize your income around the things that matter — your home, rent, savings, and future property goals.",
    story: ["GET PAID", "ORGANIZE", "BUILD A GOAL", "PREPARE FOR PROPERTY", "SMARTREALTY"],
    notABank: "SmartRealty is not a bank. Account, routing, ACH, payroll login, KYC, and funds custody go through regulated partners when those features are live.",
    noGuarantees:
      "SmartRealty does not guarantee savings, home ownership, investment returns, approval, or any financial outcome.",
    northStar: "Users actively progressing toward a SmartRealty property goal",
    launchPhase: "private_alpha",
    paidAds: "disabled",
    claimsReviewed: false,
  };

  const EXPERIMENTS = {
    dd_headline: {
      name: "Direct deposit headline",
      A: "Make payday work toward your property goals.",
      B: "Turn every paycheck into progress toward home.",
    },
    dd_cta: {
      name: "Primary CTA",
      A: "Set Up Direct Deposit",
      B: "Start Building My Home Fund",
    },
    dd_explanation: {
      name: "Product explanation",
      A: "financial",
      B: "realestate",
    },
  };

  const EXPLANATION = {
    financial:
      "A financial-first path: connect eligible payroll, choose an allocation, then organize incoming pay around housing goals. SmartRealty is not a bank.",
    realestate:
      "A real-estate-first path: name the home or rent goal you care about, then use paycheck tools to organize income toward that goal. Progress is organizational — not a promised outcome.",
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function uid(prefix) {
    const bytes = new Uint8Array(6);
    if (global.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
    return (
      (prefix || "id") +
      "_" +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function siteUrl() {
    const c = global.SRU_CONFIG || {};
    return String(c.siteUrl || (typeof location !== "undefined" ? location.origin : "https://smartrealty.us")).replace(
      /\/$/,
      ""
    );
  }

  function visitorId() {
    let id = null;
    try {
      id = localStorage.getItem(NS + "vid");
    } catch {
      id = null;
    }
    if (!id) {
      id = uid("v");
      try {
        localStorage.setItem(NS + "vid", id);
      } catch {
        /* ignore */
      }
    }
    return id;
  }

  function sanitizeProps(props) {
    const out = {};
    if (!props || typeof props !== "object") return out;
    Object.keys(props).forEach((k) => {
      if (BLOCKED_KEYS.includes(k) || SENSITIVE_RE.test(k)) return;
      let v = props[k];
      if (v && typeof v === "object") return;
      if (typeof v === "string") {
        if (SENSITIVE_RE.test(v)) return;
        if (/^\d{8,17}$/.test(v.replace(/\s+/g, ""))) return;
        v = v.slice(0, 200);
      }
      if (typeof k === "string" && k.length <= 40) out[k] = v;
    });
    return out;
  }

  function track(event, props) {
    const name = String(event || "").slice(0, 64);
    if (!name) return;
    const clean = sanitizeProps(props);
    const attr = getAttribution();
    if (attr.utm_source && clean.source == null) clean.source = String(attr.utm_source).slice(0, 40);
    if (attr.utm_campaign && clean.campaign == null) clean.campaign = String(attr.utm_campaign).slice(0, 40);
    if (attr.landing && clean.landing == null) clean.landing = String(attr.landing).slice(0, 80);
    if (global.SRU_ANALYTICS && typeof SRU_ANALYTICS.track === "function") {
      SRU_ANALYTICS.track(name, clean);
    }
    return { event: name, props: clean, t: nowIso() };
  }

  function captureAttribution() {
    if (typeof location === "undefined") return getAttribution();
    const params = new URLSearchParams(location.search);
    const existing = read(KEYS.attr, null) || {};
    const next = { ...existing };
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((k) => {
      const v = params.get(k);
      if (v && !next[k]) next[k] = String(v).slice(0, 80);
    });
    const refCode = params.get("r") || params.get("ref") || params.get("code");
    if (refCode && !next.referralCode) {
      next.referralCode = String(refCode).slice(0, 32).toUpperCase();
      write(KEYS.referredBy, { code: next.referralCode, at: nowIso() });
    }
    const partner = params.get("p") || params.get("partner");
    if (partner && !next.partner) {
      next.partner = String(partner).slice(0, 64).toLowerCase();
      write(KEYS.partner, { slug: next.partner, at: nowIso() });
    }
    if (!next.firstTouchAt) next.firstTouchAt = nowIso();
    if (!next.landing) next.landing = (location.pathname || "/").slice(0, 120);
    if (!next.referrer && typeof document !== "undefined" && document.referrer) {
      try {
        next.referrer = new URL(document.referrer).host.slice(0, 80);
      } catch {
        /* ignore */
      }
    }
    next.lastTouchAt = nowIso();
    write(KEYS.attr, next);
    return next;
  }

  function getAttribution() {
    return read(KEYS.attr, {}) || {};
  }

  function hashPick(key) {
    const seed = visitorId() + ":" + key;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return h % 2 === 0 ? "A" : "B";
  }

  function assignExperiment(key) {
    const map = read(KEYS.exp, {}) || {};
    if (!EXPERIMENTS[key]) return null;
    if (!map[key]) {
      map[key] = { variant: hashPick(key), at: nowIso() };
      write(KEYS.exp, map);
      track("experiment_exposure", { experiment: key, variant: map[key].variant });
    }
    return map[key].variant;
  }

  function getExperiments() {
    const map = read(KEYS.exp, {}) || {};
    const out = {};
    Object.keys(EXPERIMENTS).forEach((k) => {
      out[k] = map[k]?.variant || assignExperiment(k);
    });
    return out;
  }

  function experimentCopy() {
    const exp = getExperiments();
    return {
      headline: EXPERIMENTS.dd_headline[exp.dd_headline] || EXPERIMENTS.dd_headline.A,
      cta: EXPERIMENTS.dd_cta[exp.dd_cta] || EXPERIMENTS.dd_cta.A,
      explanationKey: exp.dd_explanation || "A",
      explanation:
        EXPLANATION[EXPERIMENTS.dd_explanation[exp.dd_explanation] || "financial"] || EXPLANATION.financial,
      variants: exp,
    };
  }

  function markConvert(experiment, metric) {
    track("experiment_convert", { experiment, metric: String(metric || "signup").slice(0, 40) });
  }

  function recordFunnel(stage, extra) {
    const allowed = FUNNEL_STAGES.some((s) => s.id === stage);
    if (!allowed) return;
    const snap = read(KEYS.funnel, { stages: {}, order: [] }) || { stages: {}, order: [] };
    if (!snap.stages[stage]) {
      snap.stages[stage] = { firstAt: nowIso(), count: 0 };
      snap.order.push(stage);
    }
    snap.stages[stage].count += 1;
    snap.stages[stage].lastAt = nowIso();
    write(KEYS.funnel, snap);
    track("funnel_" + stage, extra);
    return snap;
  }

  function funnelSnapshot() {
    return read(KEYS.funnel, { stages: {}, order: [] });
  }

  function touchSession() {
    const first = read(KEYS.firstSeen, null) || nowIso();
    write(KEYS.firstSeen, first);
    write(KEYS.lastSeen, nowIso());
    const day = nowIso().slice(0, 10);
    const days = read(KEYS.days, []) || [];
    if (!days.includes(day)) {
      days.push(day);
      write(KEYS.days, days.slice(-400));
    }
    captureAttribution();
  }

  /* ---------- Goals ---------- */
  function listGoals() {
    const data = read(KEYS.goals, { items: [] });
    return Array.isArray(data.items) ? data.items : [];
  }

  function saveGoals(items) {
    write(KEYS.goals, { items, updatedAt: nowIso() });
  }

  function createGoal({ name, templateId, targetCents, notes }) {
    const items = listGoals();
    const profit = global.SRU_PROFIT;
    if (profit) {
      const gate = profit.checkLimit("propertyGoals", items.length);
      if (!gate.ok) {
        return { ok: false, error: "limit", gate };
      }
    }
    const tpl = GOAL_TEMPLATES.find((t) => t.id === templateId) || GOAL_TEMPLATES[GOAL_TEMPLATES.length - 1];
    const item = {
      id: uid("goal"),
      name: String(name || tpl.name).slice(0, 80),
      templateId: tpl.id,
      icon: tpl.icon,
      targetCents: Math.max(0, Math.round(Number(targetCents) || 0)),
      currentCents: 0,
      notes: String(notes || "").slice(0, 240),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    items.push(item);
    saveGoals(items);
    recordFunnel("property_goal");
    track("goal_created", { template: tpl.id });
    evaluateLifecycle("property_goal_created");
    return { ok: true, goal: item, first: items.length === 1 };
  }

  function updateGoal(id, patch) {
    const items = listGoals();
    const i = items.findIndex((g) => g.id === id);
    if (i < 0) return null;
    const g = { ...items[i] };
    if (patch.name != null) g.name = String(patch.name).slice(0, 80);
    if (patch.targetCents != null) g.targetCents = Math.max(0, Math.round(Number(patch.targetCents) || 0));
    if (patch.currentCents != null) g.currentCents = Math.max(0, Math.round(Number(patch.currentCents) || 0));
    if (patch.notes != null) g.notes = String(patch.notes).slice(0, 240);
    g.updatedAt = nowIso();
    items[i] = g;
    saveGoals(items);
    track("goal_updated", { template: g.templateId });
    return g;
  }

  function addProgress(id, deltaCents) {
    const g = listGoals().find((x) => x.id === id);
    if (!g) return null;
    const next = updateGoal(id, { currentCents: g.currentCents + Math.round(Number(deltaCents) || 0) });
    track("goal_progress", { template: g.templateId });
    evaluateLifecycle("goal_progress");
    return next;
  }

  function removeGoal(id) {
    saveGoals(listGoals().filter((g) => g.id !== id));
  }

  function goalProgress(g) {
    if (!g || !g.targetCents) return 0;
    return Math.min(100, Math.round((g.currentCents / g.targetCents) * 100));
  }

  function northStar() {
    const goals = listGoals();
    const progressing = goals.filter((g) => g.currentCents > 0 && g.targetCents > 0);
    return {
      metric: POSITIONING.northStar,
      progressingGoals: progressing.length,
      totalGoals: goals.length,
      active: progressing.length > 0,
    };
  }

  /* ---------- Referrals (track only — no cash) ---------- */
  function referralAlphabet() {
    return "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  }

  function makeReferralCode() {
    const alpha = referralAlphabet();
    let code = "";
    const bytes = new Uint8Array(6);
    if (global.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < 6; i++) bytes[i] = (Math.random() * 256) | 0;
    for (let i = 0; i < 6; i++) code += alpha[bytes[i] % alpha.length];
    return code;
  }

  function ensureReferral() {
    let rec = read(KEYS.referral, null);
    if (!rec || !rec.code) {
      rec = {
        code: makeReferralCode(),
        createdAt: nowIso(),
        clicks: 0,
        signups: 0,
        verified: 0,
        qualified: 0,
        rewardsIssued: 0,
      };
      write(KEYS.referral, rec);
      track("referral_created", { code_len: rec.code.length });
    }
    return rec;
  }

  function referralUrl(code) {
    const c = code || ensureReferral().code;
    return siteUrl() + "/invite/" + encodeURIComponent(c);
  }

  function recordReferralEvent(kind) {
    const rec = ensureReferral();
    if (kind === "click") rec.clicks += 1;
    if (kind === "signup") rec.signups += 1;
    if (kind === "verified") rec.verified += 1;
    if (kind === "qualified") rec.qualified += 1;
    rec.updatedAt = nowIso();
    write(KEYS.referral, rec);
    const map = {
      click: "referral_clicked",
      signup: "referral_signup",
      verified: "referral_verified",
      qualified: "referral_qualified",
    };
    if (map[kind]) track(map[kind], {});
    return rec;
  }

  function referredBy() {
    return read(KEYS.referredBy, null);
  }

  /* ---------- Waitlist ---------- */
  async function submitWaitlist({ email, firstName, interest, source }) {
    const e = String(email || "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      throw new Error("Please enter a valid email.");
    }
    const attr = getAttribution();
    const payload = {
      email: e,
      name: String(firstName || "").slice(0, 80),
      firstName: String(firstName || "").slice(0, 80),
      source: String(source || "early_access").slice(0, 80),
      interest: String(interest || "updates").slice(0, 120),
      referralCode: attr.referralCode || referredBy()?.code || "",
      partner: attr.partner || "",
      utm_source: attr.utm_source || "",
      utm_medium: attr.utm_medium || "",
      utm_campaign: attr.utm_campaign || "",
    };
    const local = read(KEYS.waitlist, { items: [] });
    const items = Array.isArray(local.items) ? local.items : [];
    if (!items.some((x) => x.email === e)) {
      items.push({
        email: e,
        firstName: payload.firstName,
        interest: payload.interest,
        source: payload.source,
        createdAt: nowIso(),
        attribution: {
          utm_source: payload.utm_source,
          utm_campaign: payload.utm_campaign,
          referralCode: payload.referralCode,
          partner: payload.partner,
        },
      });
      write(KEYS.waitlist, { items, updatedAt: nowIso() });
    }
    let server = null;
    try {
      if (global.SRU_AUTH?.hasLiveApi && (await SRU_AUTH.hasLiveApi()) && SRU_AUTH.submitLead) {
        server = await SRU_AUTH.submitLead(payload);
      }
    } catch (err) {
      if (err && err.code !== "NO_API" && err.status !== 405 && err.status !== 503) {
        track("waitlist_error", { reason: "server" });
        throw err;
      }
    }
    if (payload.referralCode) recordReferralEvent("signup");
    recordFunnel("account");
    track("waitlist_join", { interest: payload.interest, email_domain: (e.split("@")[1] || "").slice(0, 40) });
    evaluateLifecycle("account_created");
    return { ok: true, local: true, server, referral: ensureReferral() };
  }

  /* ---------- Notifications / lifecycle ---------- */
  function defaultNotifPrefs() {
    return {
      emailTransactional: true,
      emailMarketing: false,
      pushSetup: true,
      pushProgress: false,
      pushConnection: true,
      inApp: true,
    };
  }

  function notifPrefs() {
    return { ...defaultNotifPrefs(), ...(read(KEYS.notif, {}) || {}) };
  }

  function setNotifPrefs(patch) {
    const next = { ...notifPrefs(), ...patch };
    write(KEYS.notif, next);
    return next;
  }

  function marketingOptOut() {
    return !!read(KEYS.optOut, false);
  }

  function setMarketingOptOut(on) {
    write(KEYS.optOut, !!on);
    if (on) setNotifPrefs({ emailMarketing: false, pushProgress: false });
  }

  function inbox() {
    const data = read(KEYS.inbox, { items: [] });
    return Array.isArray(data.items) ? data.items : [];
  }

  function pushInbox(msg) {
    const items = inbox();
    items.unshift({
      id: uid("msg"),
      at: nowIso(),
      read: false,
      channel: msg.channel || "in-app",
      event: msg.event,
      title: msg.title,
      body: msg.body,
      cta: msg.cta || null,
      href: msg.href || null,
    });
    write(KEYS.inbox, { items: items.slice(0, 40) });
  }

  function markInboxRead(id) {
    const items = inbox().map((m) => (m.id === id ? { ...m, read: true } : m));
    write(KEYS.inbox, { items });
  }

  const LIFECYCLE_TEMPLATES = {
    welcome: {
      title: "Welcome to SmartRealty",
      body: "Organize incoming pay around a housing or property goal. Create a goal to see progress in one place.",
      cta: "Create Your First Property Goal",
      href: "/goals/",
    },
    direct_deposit_reminder: {
      title: "Finish setting up your direct deposit",
      body: "You started setup. You can continue when you are ready. We will not email account or routing numbers.",
      cta: "Continue setup",
      href: "/direct-deposit/setup/",
    },
    direct_deposit_active: {
      title: "Direct deposit is marked active",
      body: "Next, create a home or rent goal so progress has a place to land. This is not a promise of savings or ownership.",
      cta: "Create a Home Goal",
      href: "/goals/",
    },
    first_deposit: {
      title: "An eligible deposit was recorded",
      body: "Your first eligible deposit was noted in this demo. Bank details are never included in messages.",
      cta: "Open goals",
      href: "/goals/",
    },
    goal_progress: {
      title: "You made progress toward a property goal",
      body: "Progress is what you recorded. It is not a guaranteed outcome.",
      cta: "See goals",
      href: "/goals/",
    },
  };

  function hoursSince(iso) {
    if (!iso) return 0;
    return (Date.now() - new Date(iso).getTime()) / 36e5;
  }

  function evaluateLifecycle(trigger) {
    const state = read(KEYS.lifecycle, { last: {}, flags: {} }) || { last: {}, flags: {} };
    const flags = state.flags || {};
    const last = state.last || {};
    const prefs = notifPrefs();
    const capOk = (key, hours) => hoursSince(last[key]) >= hours;

    function fire(key, eventName) {
      if (!prefs.inApp) return;
      if (!capOk(key, 24)) return;
      const tpl = LIFECYCLE_TEMPLATES[key];
      if (!tpl) return;
      pushInbox({ ...tpl, event: eventName, channel: "in-app" });
      last[key] = nowIso();
      write(KEYS.lifecycle, { last, flags });
    }

    if (trigger === "account_created") fire("welcome", "account_created");
    if (trigger === "direct_deposit_started") flags.directDepositStarted = true;
    if (trigger === "direct_deposit_submitted" || trigger === "direct_deposit_activated") {
      flags.directDepositCompleted = true;
      fire("direct_deposit_active", trigger);
    }
    if (trigger === "first_deposit_detected") fire("first_deposit", trigger);
    if (trigger === "goal_progress") fire("goal_progress", trigger);
    if (trigger === "property_goal_created") flags.goalCreated = true;

    if (flags.directDepositStarted && !flags.directDepositCompleted && hoursSince(last.direct_deposit_reminder) >= 24) {
      fire("direct_deposit_reminder", "direct_deposit_reminder");
    }

    write(KEYS.lifecycle, { last, flags });
    return { last, flags, inbox: inbox() };
  }

  function runAutomation() {
    return evaluateLifecycle("tick");
  }

  /* ---------- Share cards (privacy default) ---------- */
  function shareCard({ goal, includeAmount }) {
    const g = goal || listGoals()[0];
    const name = g ? g.name : "Home Fund";
    const text = includeAmount && g
      ? `I'm building my ${name} with SmartRealty — ${formatMoney(g.currentCents)} of ${formatMoney(g.targetCents)} recorded.`
      : `I'm building my ${name} with SmartRealty 🏠`;
    return {
      text,
      url: siteUrl() + "/direct-deposit/",
      includesAmount: !!includeAmount,
    };
  }

  function formatMoney(cents) {
    const n = (Number(cents) || 0) / 100;
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  /* ---------- Admin local rollup (no bank data) ---------- */
  function localEvents() {
    if (global.SRU_ANALYTICS && typeof SRU_ANALYTICS.load === "function") {
      return SRU_ANALYTICS.load() || [];
    }
    return [];
  }

  function countEvent(list, name) {
    return list.filter((e) => e.e === name || e.event === name).length;
  }

  function uniqueVisitors(list) {
    const set = new Set();
    list.forEach((e) => {
      const p = e.p || e.props || {};
      set.add(p.vid || e.path || e.t);
    });
    return set.size;
  }

  function retentionFromDays() {
    const days = (read(KEYS.days, []) || []).slice().sort();
    if (!days.length) return { d1: 0, d7: 0, d30: 0, d90: 0 };
    const first = new Date(days[0] + "T00:00:00Z").getTime();
    const has = (offset) => days.includes(new Date(first + offset * 864e5).toISOString().slice(0, 10));
    return {
      d1: has(1) ? 1 : 0,
      d7: has(7) ? 1 : 0,
      d30: has(30) ? 1 : 0,
      d90: has(90) ? 1 : 0,
    };
  }

  function growthSnapshot() {
    const ev = localEvents();
    const goals = listGoals();
    const ref = read(KEYS.referral, { clicks: 0, signups: 0, qualified: 0, code: "" });
    const wait = read(KEYS.waitlist, { items: [] });
    const attr = getAttribution();
    const ret = retentionFromDays();
    const signup = countEvent(ev, "signup_completed") + countEvent(ev, "waitlist_join");
    const visitors = Math.max(uniqueVisitors(ev), ev.length ? 1 : 0);
    return {
      generatedAt: nowIso(),
      northStar: northStar(),
      launchPhase: POSITIONING.launchPhase,
      paidAds: POSITIONING.paidAds,
      claimsReviewed: POSITIONING.claimsReviewed,
      acquisition: {
        visitors,
        uniqueVisitors: visitors,
        signupRate: visitors ? Math.round((signup / visitors) * 1000) / 10 : 0,
        trafficSource: attr.utm_source || attr.referrer || "direct",
        campaign: attr.utm_campaign || "—",
        landingPage: attr.landing || "—",
      },
      activation: {
        accountsCreated: signup,
        onboardingStarted: countEvent(ev, "onboarding_started") + countEvent(ev, "direct_deposit_started"),
        onboardingCompleted: countEvent(ev, "onboarding_completed"),
        directDepositSetupStarted: countEvent(ev, "direct_deposit_started"),
        payerConnected: countEvent(ev, "payer_selected"),
        setupSubmitted: countEvent(ev, "direct_deposit_submitted"),
        setupActivated: countEvent(ev, "direct_deposit_activated"),
        firstDepositDetected: countEvent(ev, "first_deposit_detected"),
      },
      engagement: {
        activeUsers: (read(KEYS.days, []) || []).length ? 1 : 0,
        goalsCreated: goals.length,
        smartsplitUsage: countEvent(ev, "smartsplit_viewed"),
        repeatVisits: Math.max(0, (read(KEYS.days, []) || []).length - 1),
      },
      referral: {
        code: ref.code || "",
        links: ref.code ? 1 : 0,
        clicks: ref.clicks || 0,
        signups: ref.signups || 0,
        qualified: ref.qualified || 0,
      },
      retention: {
        day1: ret.d1,
        day7: ret.d7,
        day30: ret.d30,
        day90: ret.d90,
      },
      waitlist: {
        signups: (wait.items || []).length,
        items: wait.items || [],
      },
      funnel: funnelSnapshot(),
      experiments: getExperiments(),
    };
  }

  function listCampaigns() {
    const data = read(KEYS.campaigns, { items: [] });
    return Array.isArray(data.items) ? data.items : [];
  }

  function upsertCampaign(row) {
    const items = listCampaigns();
    const id = row.id || uid("cmp");
    const next = {
      id,
      campaign_name: String(row.campaign_name || "").slice(0, 80),
      source: String(row.source || "").slice(0, 40),
      medium: String(row.medium || "").slice(0, 40),
      landing_page: String(row.landing_page || "/direct-deposit/").slice(0, 120),
      start_date: row.start_date || "",
      end_date: row.end_date || "",
      status: row.status || "planned",
      spend: Number(row.spend) || 0,
      visitors: Number(row.visitors) || 0,
      signups: Number(row.signups) || 0,
      activated_users: Number(row.activated_users) || 0,
    };
    const i = items.findIndex((c) => c.id === id);
    if (i >= 0) items[i] = next;
    else items.push(next);
    write(KEYS.campaigns, { items });
    return next;
  }

  function campaignUrl(c) {
    const u = new URL(siteUrl() + (c.landing_page || "/direct-deposit/"));
    if (c.source) u.searchParams.set("utm_source", c.source);
    if (c.medium) u.searchParams.set("utm_medium", c.medium);
    if (c.campaign_name) u.searchParams.set("utm_campaign", slugify(c.campaign_name));
    return u.toString();
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
  }

  function seedDefaultCampaigns() {
    if (listCampaigns().length) return listCampaigns();
    [
      { campaign_name: "Payday to Property", source: "organic", medium: "site", status: "planned", landing_page: "/direct-deposit/" },
      { campaign_name: "First Home Fund", source: "organic", medium: "site", status: "planned", landing_page: "/goals/" },
      { campaign_name: "SmartSplit", source: "organic", medium: "site", status: "planned", landing_page: "/direct-deposit/#smartsplit" },
      { campaign_name: "Direct Deposit", source: "organic", medium: "site", status: "planned", landing_page: "/direct-deposit/" },
      { campaign_name: "Rent Ready", source: "organic", medium: "site", status: "planned", landing_page: "/learn/first-apartment-savings-checklist/" },
      { campaign_name: "Move Ready", source: "organic", medium: "site", status: "planned", landing_page: "/learn/moving-budget/" },
    ].forEach(upsertCampaign);
    return listCampaigns();
  }

  function bootPage(page, extra) {
    touchSession();
    const attr = captureAttribution();
    if (page === "direct_deposit") {
      track("landing_page_view", { page: "direct-deposit" });
      track("direct_deposit_viewed", { page: "direct-deposit" });
      recordFunnel("landing");
      recordFunnel("awareness");
    } else if (page === "early_access") {
      track("early_access_view", {});
    } else if (page === "security") {
      track("security_view", {});
    } else if (page === "learn") {
      track("learn_view", extra || {});
    } else if (page === "location") {
      track("location_view", extra || {});
    } else if (page === "invite") {
      recordReferralEvent("click");
      track("referral_clicked", {});
    } else if (page === "partner") {
      track("partner_click", extra || {});
    }
    runAutomation();
    return { attr, experiments: experimentCopy(), snapshot: growthSnapshot() };
  }

  global.SRU_GROWTH = {
    POSITIONING,
    EVENT_CATALOG,
    FUNNEL_STAGES,
    GOAL_TEMPLATES,
    EXPERIMENTS,
    EXPLANATION,
    LIFECYCLE_TEMPLATES,
    KEYS,
    track,
    sanitizeProps,
    captureAttribution,
    getAttribution,
    assignExperiment,
    getExperiments,
    experimentCopy,
    markConvert,
    recordFunnel,
    funnelSnapshot,
    touchSession,
    visitorId,
    listGoals,
    createGoal,
    updateGoal,
    addProgress,
    removeGoal,
    goalProgress,
    northStar,
    formatMoney,
    ensureReferral,
    referralUrl,
    recordReferralEvent,
    referredBy,
    submitWaitlist,
    notifPrefs,
    setNotifPrefs,
    marketingOptOut,
    setMarketingOptOut,
    inbox,
    markInboxRead,
    evaluateLifecycle,
    runAutomation,
    shareCard,
    growthSnapshot,
    listCampaigns,
    upsertCampaign,
    campaignUrl,
    seedDefaultCampaigns,
    bootPage,
    siteUrl,
  };
})(window);
