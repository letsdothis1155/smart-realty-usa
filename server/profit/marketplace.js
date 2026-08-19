"use strict";

const { PROFESSIONAL_CATEGORIES, MARKETPLACE_CATEGORIES, PARTNER_CATEGORIES } = require("./constants");
const { rejectSensitivePayload } = require("./ethics");

/**
 * Marketplace, professionals, partner referrals, and opt-in lead matching.
 * Paid referral arrangements stay disabled until licensing / RESPA review.
 * User financial data is never attached to a lead.
 */

function publicProfessional(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    city: row.city || "",
    serviceArea: row.serviceArea || "",
    website: row.website || "",
    services: row.services || [],
    verified: !!row.verified,
    paidPlacement: !!row.paidPlacement,
    paidPlacementLabel: row.paidPlacement ? "Sponsored" : null,
    comingSoon: row.comingSoon !== false,
  };
}

function listProfessionals(store, { category } = {}) {
  return store
    .read()
    .professionals.filter((p) => p.status !== "hidden")
    .filter((p) => !category || p.category === category)
    .map(publicProfessional);
}

function upsertProfessional(store, input) {
  const category = String(input.category || "");
  if (!PROFESSIONAL_CATEGORIES.includes(category)) {
    const err = new Error("Unknown professional category.");
    err.status = 400;
    err.expose = true;
    throw err;
  }
  const sensitive = rejectSensitivePayload(input);
  if (sensitive) {
    const err = new Error(sensitive);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return store.mutate((db) => {
    const row = {
      id: input.id || store.id("pro"),
      name: String(input.name || "").slice(0, 80),
      category,
      city: String(input.city || "").slice(0, 80),
      serviceArea: String(input.serviceArea || "").slice(0, 120),
      website: String(input.website || "").slice(0, 200),
      services: Array.isArray(input.services) ? input.services.slice(0, 20) : [],
      verified: !!input.verified,
      paidPlacement: !!input.paidPlacement,
      status: input.status || "listed",
      comingSoon: true,
      created_at: input.created_at || store.now(),
    };
    const i = db.professionals.findIndex((p) => p.id === row.id);
    if (i >= 0) db.professionals[i] = { ...db.professionals[i], ...row };
    else db.professionals.push(row);
    return publicProfessional(row);
  });
}

function requestAgentLead(store, { userId, consent, message, city }) {
  if (!consent) {
    const err = new Error("User consent is mandatory. We will not match an agent without an explicit request.");
    err.status = 400;
    err.expose = true;
    err.code = "CONSENT_REQUIRED";
    throw err;
  }
  const sensitive = rejectSensitivePayload({ message, city });
  if (sensitive) {
    const err = new Error(sensitive);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return store.mutate((db) => {
    const row = {
      id: store.id("lead"),
      user_id: userId,
      message: String(message || "I want help buying a home").slice(0, 240),
      city: String(city || "").slice(0, 80),
      consent: true,
      status: "pending_legal_review",
      financialDataAttached: false,
      matchingEnabled: false,
      created_at: store.now(),
      note: "Lead matching is not live. Licensing, RESPA, and advertising review required before paid referral arrangements.",
    };
    db.leadRequests.push(row);
    return {
      id: row.id,
      status: row.status,
      matchingEnabled: false,
      financialDataAttached: false,
      message: row.note,
    };
  });
}

function recordPartnerEvent(store, input) {
  const category = String(input.category || "");
  if (category && !PARTNER_CATEGORIES.includes(category)) {
    const err = new Error("Unknown partner category.");
    err.status = 400;
    err.expose = true;
    throw err;
  }
  if (input.selectedBecauseItPaysMore) {
    const err = new Error("Never choose a service solely because it pays SmartRealty more.");
    err.status = 400;
    err.expose = true;
    err.code = "BANNED_MONETIZATION";
    throw err;
  }
  return store.mutate((db) => {
    const row = {
      id: store.id("pe"),
      partner_id: input.partner_id || input.partnerId || null,
      campaign_id: input.campaign_id || input.campaignId || null,
      referral_id: input.referral_id || input.referralId || null,
      click_id: input.click_id || input.clickId || null,
      conversion_id: input.conversion_id || input.conversionId || null,
      user_id: input.userId || input.user_id || null,
      category: category || null,
      revenue_amount: Math.round(Number(input.revenue_amount || 0)),
      status: input.status || "clicked",
      disclosed: input.disclosed !== false,
      sandbox: true,
      created_at: store.now(),
    };
    db.partnerEvents.push(row);
    return row;
  });
}

function marketplaceStatus() {
  return {
    live: false,
    categories: MARKETPLACE_CATEGORIES,
    professionalCategories: PROFESSIONAL_CATEGORIES,
    partnerCategories: PARTNER_CATEGORIES,
    paidReferralArrangements: "disabled_pending_legal_review",
    disclosureRequired: true,
    financialDataNeverTransmitted: true,
  };
}

module.exports = {
  listProfessionals,
  upsertProfessional,
  requestAgentLead,
  recordPartnerEvent,
  marketplaceStatus,
  publicProfessional,
};
