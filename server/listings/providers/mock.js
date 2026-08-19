"use strict";

const { LISTING_STATUS } = require("../constants");

/**
 * Fictional sample listings, shaped exactly like a mapped RESO record so the
 * API contract doesn't change when LISTINGS_MODE flips from mock to provider.
 */
const SAMPLE_LISTINGS = [
  {
    id: "mock-001",
    mlsNumber: "MOCK-0001",
    title: "412 Palm Crest Drive",
    location: "Summerlin, Las Vegas, NV",
    image: "images/mansion-1.jpg",
    images: ["images/mansion-1.jpg", "images/gallery/g-01.jpg"],
    beds: 6,
    baths: 7,
    sqft: 9800,
    listPrice: 8900000,
    status: LISTING_STATUS.ACTIVE,
    propertyType: "Residential",
    desc: "Sample listing for local development. Not a real property.",
    listingOffice: "Smart Realty Sample Office",
    listingAgent: "Sample Agent",
    mlsSourceName: "SAMPLE-MLS",
    asOf: new Date().toISOString(),
    source: "mock",
  },
  {
    id: "mock-002",
    mlsNumber: "MOCK-0002",
    title: "88 Horizon Ridge Way",
    location: "Henderson Hills, NV",
    image: "images/mansion-2.jpg",
    images: ["images/mansion-2.jpg", "images/gallery/g-02.jpg"],
    beds: 8,
    baths: 10,
    sqft: 14200,
    listPrice: 14500000,
    status: LISTING_STATUS.PENDING,
    propertyType: "Residential",
    desc: "Sample listing for local development. Not a real property.",
    listingOffice: "Smart Realty Sample Office",
    listingAgent: "Sample Agent",
    mlsSourceName: "SAMPLE-MLS",
    asOf: new Date().toISOString(),
    source: "mock",
  },
  {
    id: "mock-003",
    mlsNumber: "MOCK-0003",
    title: "1900 Mediterranean Hillside Ct",
    location: "Beverly Hills Adjacent, CA",
    image: "images/mansion-3.jpg",
    images: ["images/mansion-3.jpg", "images/gallery/g-03.jpg"],
    beds: 7,
    baths: 8,
    sqft: 11200,
    listPrice: 16800000,
    status: LISTING_STATUS.SOLD,
    propertyType: "Residential",
    desc: "Sample listing for local development. Not a real property.",
    listingOffice: "Smart Realty Sample Office",
    listingAgent: "Sample Agent",
    mlsSourceName: "SAMPLE-MLS",
    asOf: new Date().toISOString(),
    source: "mock",
  },
];

function createMockListingsProvider() {
  return {
    name: "mock",
    sandbox: true,
    configured: true,
    async fetchListings() {
      return { listings: SAMPLE_LISTINGS, syncedAt: new Date().toISOString() };
    },
  };
}

module.exports = { createMockListingsProvider, SAMPLE_LISTINGS };
