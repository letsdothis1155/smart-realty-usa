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
  phoneDisplay: "1-800-SMART-USA",
  phoneTel: "+18007627879",

  /**
   * Company identity (fill after formation + D‑U‑N‑S)
   * D‑U‑N‑S is a free 9-digit ID from Dun & Bradstreet — not a RE license.
   * Guide: DUNS-AND-COMPANY-SETUP.md
   */
  legalName: "SMART REALTY.US LLC",
  tradeName: "Smart Realty USA",
  organizerName: "Andrew Iredale Jr",
  registeredAgent: "Andrew Iredale",
  formationState: "Kentucky",
  entityType: "Kentucky limited liability company",
  management: "member-managed",
  sosNumber: "1614978.06",
  formedOn: "2026-08-03",
  dunsNumber: "", // add when Dun & Bradstreet issues it
  ein: "", // never publish
  businessAddress: "2611 Harmony Rd, Louisville, KY 40299",

  /** Private demo flag — shows DEMO badges */
  isPrivateDemo: true,

  /**
   * When true, shows the "Domain Deploy" presenter panel in the footer.
   * Set to false after clients are using the live link unsupervised.
   */
  presenterMode: true,

  /** Never put the real password in this file for public deploys */
  demoPasswordHint: false,

  /**
   * Account auth (sign in / create account)
   * - mode "accounts": require sign-in page (auth.html)
   * - mode "demo": shared password gate only (legacy)
   * - mode "open": no gate
   *
   * apiUrl: Auth API base (no trailing slash). Local: http://127.0.0.1:8787
   * When empty, create-account and demo access require a configured API.
   * See AUTH-AND-HOSTING.md — you do NOT need classic web hosting for this.
   */
  auth: {
    mode: "accounts", // "accounts" | "demo" | "open"
    apiUrl: "http://127.0.0.1:8787",
    /** Keep secrets on the API; browser/app bundles are public to their users. */
    demoPassword: "",
    allowDemoAccess: true,
    allowOfflineDemo: false,
  },

  social: {
    // Optional future: x, linkedin, instagram
  },
};
