/* ============================================
   Smart Realty USA — Domain / brand config
   Edit this file when you go live on a custom domain.
   Re-upload after changes.
   ============================================ */

window.SRU_CONFIG = {
  siteName: "Smart Realty USA",
  tagline: "Exclusive homes. Transparent prices. Bitcoin ready.",

  /**
   * Final public HTTPS URL — no trailing slash.
   * Examples:
   *   "https://smartrealty.us"
   *   "https://www.smartrealty.us"
   *   "https://demo.smartrealty.us"
   *   "https://smartrealty.us/demo"
   */
  siteUrl: "https://smartrealty.us",

  /** Host only (for display) */
  canonicalHost: "smartrealty.us",

  contactEmail: "ai@smartrealty.us",
  phoneDisplay: "1-800-762-7879",
  phoneTel: "+18007627879",

  /**
   * Company identity
   * D‑U‑N‑S is a free 9-digit ID from Dun & Bradstreet — not a RE license.
   */
  legalName: "SMART REALTY.US LLC",
  organizerName: "Andrew Iredale Jr",
  formationState: "Kentucky",
  sosNumber: "1614978.06",
  formedOn: "2026-08-03",
  dunsNumber: "", // add when Dun & Bradstreet issues it
  ein: "", // add after free IRS EIN
  businessAddress: "2611 Harmony Rd, Louisville, KY 40299",

  /** Private-demo chrome (badges, presenter panel). Public site stays an honest demo. */
  isPrivateDemo: false,

  /**
   * Public SEO flip
   * index: true  → robots allow indexing, public meta, JSON-LD
   * index: false → noindex (private demo crawl block)
   */
  seo: {
    index: true,
    ogImage: "https://smartrealty.us/images/hero-bg.jpg",
    twitterHandle: "@JrIredale43143",
  },

  /**
   * When true, shows the "Domain Deploy" presenter panel in the footer.
   * Set to false after clients are using the live link unsupervised.
   */
  presenterMode: false,

  /** Never put a real password in this browser-delivered file. */
  demoPasswordHint: false,

  /**
   * Account auth (sign in / create account) — website only
   * - mode "accounts": auth.html gate
   * - mode "demo": shared password only
   * - mode "open": no gate
   *
   * GoDaddy production:
   *   apiUrl: ""          → same origin (https://smartrealty.us)
   *   usePhp: true        → /api/auth/*.php on cPanel (default when not Node)
   *
   * Local Node (optional):
   *   apiUrl: "http://127.0.0.1:8787"
   *   usePhp: false
   *
   * Guide: GODADDY-ORGANIZER.md
   */
  auth: {
    /**
     * Public go-live (GitHub Pages / Cloudflare static):
     *   mode: "open"  — browse free, no password wall
     * Private invite demo:
     *   mode: "demo" or "accounts" + server secrets in api/config.local.php
     */
    mode: "open", // "accounts" | "demo" | "open"
    apiUrl: "", // "" = same website origin (GoDaddy). Local Node: "http://127.0.0.1:8787"
    usePhp: true, // true for GoDaddy PHP api/; false for Node server/
    /**
     * Create-account on GitHub Pages emails this address via the signup Worker.
     * Do not collect or send passwords here.
     */
    signupUrl: "https://smartrealty.us/api/signup",
    signupEmail: "andrewiredale@smartrealty.us",
    demoPassword: "", // server-only: set SRU_DEMO_PASSWORD in api/config.local.php
    allowDemoAccess: true,
    allowOfflineDemo: false,
    softGate: {
      enabled: true,
      actions: ["btc", "rent"],
      allowGuest: true,
      saveHint: true,
    },
  },

  /**
   * Product analytics (localStorage + optional POST /api/events.php)
   * Set enabled: false to disable.
   */
  analytics: {
    enabled: true,
  },

  social: {
    // Optional future: x, linkedin, instagram
  },

  /**
   * Referral / affiliate partners — the actual revenue lever for a site
   * that is explicitly NOT a licensed brokerage (see IMPROVEMENTS.md).
   * Smart Realty USA doesn't transact real estate itself; it refers
   * visitors to licensed third parties (mortgage brokers, movers,
   * insurers) and may earn a referral/affiliate fee for the introduction.
   *
   * Each card only renders when `enabled: true` AND `url` is a real,
   * signed-up affiliate/referral link — leave both as-is (false/"") until
   * you've actually joined a partner program. Never fabricate a link.
   *
   * `disclosure` must stay truthful and visible next to the CTA — this is
   * an FTC requirement for compensated referrals, not optional styling.
   */
  referralPartners: {
    mortgage: {
      enabled: false,
      name: "",
      blurb: "Get pre-approved and compare real mortgage rates before you close.",
      url: "",
      disclosure: "Smart Realty USA may be compensated if you use this partner.",
    },
    moving: {
      enabled: false,
      name: "",
      blurb: "Get moving quotes from vetted movers in your new city.",
      url: "",
      disclosure: "Smart Realty USA may be compensated if you use this partner.",
    },
    insurance: {
      enabled: false,
      name: "",
      blurb: "Compare homeowners insurance quotes before you close.",
      url: "",
      disclosure: "Smart Realty USA may be compensated if you use this partner.",
    },
  },
};
