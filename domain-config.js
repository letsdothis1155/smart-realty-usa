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
  legalName: "Smart Realty USA LLC", // confirm after KY SOS filing
  organizerName: "Andrew Iredale",
  formationState: "Kentucky",
  dunsNumber: "", // add when Dun & Bradstreet issues it
  ein: "", // add after free IRS EIN
  businessAddress: "", // KY street address from Articles

  /** Private demo flag — shows DEMO badges */
  isPrivateDemo: true,

  /**
   * When true, shows the "Domain Deploy" presenter panel in the footer.
   * Set to false after clients are using the live link unsupervised.
   */
  presenterMode: true,

  /** Never put the real password in this file for public deploys */
  demoPasswordHint: false,

  social: {
    // Optional future: x, linkedin, instagram
  },
};
