"use strict";

const { RESO_STATUS_MAP, LISTING_STATUS } = require("./constants");

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

  return {
    id: record.ListingKey,
    mlsNumber: record.ListingId || record.ListingKey,
    title: address || "Untitled listing",
    location: [record.City, record.StateOrProvince].filter(Boolean).join(", "),
    image: images[0] || "",
    images,
    beds: numberOr(record.BedroomsTotal, 0),
    baths: numberOr(record.BathroomsTotalInteger, 0),
    sqft: numberOr(record.LivingArea, 0),
    listPrice: numberOr(record.ListPrice, 0),
    status: RESO_STATUS_MAP[record.StandardStatus] || LISTING_STATUS.OFF_MARKET,
    propertyType: record.PropertyType || "",
    desc: record.PublicRemarks || "",
    // IDX-required attribution — never strip these when displaying live data.
    listingOffice: record.ListOfficeName || "",
    listingAgent: record.ListAgentFullName || "",
    mlsSourceName: record.OriginatingSystemName || "",
    asOf: record.ModificationTimestamp || null,
    source: "reso",
  };
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = { mapResoProperty };
