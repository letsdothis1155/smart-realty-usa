"use strict";

const { RESO_STATUS_MAP, LISTING_STATUS } = require("./constants");
const { normalizeListing, numberOr } = require("./normalize");

/**
 * Maps one RESO Data Dictionary "Property" resource record to SmartRealty's
 * listing shape. Field names (ListPrice, BedroomsTotal, ...) follow the RESO
 * Data Dictionary, which MLS Grid, Bridge Interactive, and Spark API all
 * expose consistently over their RESO Web API (OData) endpoints.
 *
 * IDX display rules require carrying broker/agent attribution and an
 * "as of" timestamp with every listing shown publicly — that's mapped
 * through explicitly rather than dropped.
 */
function mapResoProperty(record = {}, mediaByKey = {}) {
  const address = record.UnparsedAddress
    ? record.UnparsedAddress
    : [record.StreetNumber, record.StreetName, record.City, record.StateOrProvince, record.PostalCode]
        .filter(Boolean)
        .join(" ");

  const media = mediaByKey[record.ListingKey] || [];
  const images = media.map((m) => m.MediaURL).filter(Boolean);

  return normalizeListing({
    id: record.ListingKey,
    mlsNumber: record.ListingId || record.ListingKey,
    providerListingId: record.ListingKey,
    title: address || "Untitled listing",
    address,
    city: record.City || "",
    state: record.StateOrProvince || "",
    postalCode: record.PostalCode || "",
    county: record.CountyOrParish || record.County || "",
    neighborhood: record.SubdivisionName || record.MLSAreaMajor || "",
    location: [record.City, record.StateOrProvince].filter(Boolean).join(", "),
    yearBuilt: record.YearBuilt,
    virtualTour: record.VirtualTourURLUnbranded || record.VirtualTourURLBranded || "",
    listingKind: "active_listing",
    latitude: record.Latitude,
    longitude: record.Longitude,
    image: images[0] || "",
    images,
    beds: numberOr(record.BedroomsTotal, 0),
    baths: numberOr(record.BathroomsTotalInteger ?? record.BathroomsTotalDecimal, 0),
    sqft: numberOr(record.LivingArea, 0),
    lotSize: record.LotSizeSquareFeet,
    listPrice: numberOr(record.ListPrice, 0),
    status: RESO_STATUS_MAP[record.StandardStatus] || LISTING_STATUS.OFF_MARKET,
    propertyType: record.PropertyType || "",
    listingDate: record.ListingContractDate || record.OnMarketDate || record.ModificationTimestamp,
    priceHistory: record.PreviousListPrice
      ? [{ price: numberOr(record.PreviousListPrice), at: record.ModificationTimestamp }]
      : [],
    desc: record.PublicRemarks || "",
    listingOffice: record.ListOfficeName || "",
    listingAgent: record.ListAgentFullName || "",
    mlsSourceName: record.OriginatingSystemName || "",
    asOf: record.ModificationTimestamp || null,
    sourceUrl: record.ListingURL || "",
    lastUpdated: record.ModificationTimestamp || null,
    source: "reso",
  });
}

module.exports = { mapResoProperty };
