/**
 * Price refresh helpers. Not deployed.
 * Price history is intentionally unimplemented.
 *
 * TODO(ebay-written-permission): Do not archive eBay prices or compute
 * 30/90-day lows unless eBay gives written permission. Copies must be
 * short-lived. Refresh eBay at least every 6 hours.
 * Walmart's operating agreement prohibits price tracking and alerts.
 * Do not call Amazon from this module.
 */

export const EBAY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const PRICE_HISTORY_ENABLED = false;
export const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";

export const REQUIRED_SECRETS = [
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_CAMPAIGN_ID",
  "WALMART_CONSUMER_ID",
  "WALMART_PRIVATE_KEY",
  "WALMART_PUBLISHER_ID",
];

export const OPTIONAL_SECRETS = ["EBAY_DEV_ID", "EBAY_AFFILIATE_REF_ID", "WALMART_KEY_VERSION"];

export function missingSecrets(env) {
  return REQUIRED_SECRETS.filter((key) => !String(env?.[key] || "").trim());
}

export function shouldRun(env) {
  return missingSecrets(env).length === 0;
}

export function assertHistoryOff(row) {
  if (PRICE_HISTORY_ENABLED) {
    throw new Error("Price history is not allowed. See TODO(ebay-written-permission).");
  }
  if (!row || typeof row !== "object") return row;
  const copy = { ...row };
  delete copy.history;
  delete copy.low30;
  delete copy.low90;
  delete copy.priceHistory;
  return copy;
}

function pemToPkcs8(pem) {
  const body = String(pem).replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function walmartSignature(env, timestamp) {
  const version = String(env.WALMART_KEY_VERSION || "1");
  const signed = `${env.WALMART_CONSUMER_ID}\n${timestamp}\n${version}\n`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(env.WALMART_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signed));
  let binary = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return { signature: btoa(binary), keyVersion: version, timestamp: String(timestamp) };
}

export async function fetchEbayOffers(query, env, fetchImpl = fetch) {
  if (!shouldRun(env)) throw new Error("Refresh disabled: secrets missing.");
  const basic = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
  const tokenRes = await fetchImpl("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_SCOPE)}`,
  });
  if (!tokenRes.ok) throw new Error(`eBay token HTTP ${tokenRes.status}`);
  const token = await tokenRes.json();
  const ctx = [`affiliateCampaignId=${env.EBAY_CAMPAIGN_ID}`];
  if (env.EBAY_AFFILIATE_REF_ID) ctx.push(`affiliateReferenceId=${env.EBAY_AFFILIATE_REF_ID}`);
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX": ctx.join(","),
    },
  });
  if (!res.ok) throw new Error(`eBay search HTTP ${res.status}`);
  const data = await res.json();
  const checkedAt = new Date().toISOString();
  return (data.itemSummaries || []).map((item) => {
    const href = item.itemAffiliateWebUrl;
    if (!href) return null;
    const shipping = Number(item.shippingOptions?.[0]?.shippingCost?.value || 0);
    return assertHistoryOff({
      id: `ebay-${item.itemId}`,
      title: item.title,
      itemPrice: Number(item.price?.value || 0),
      shipping: Number.isFinite(shipping) ? shipping : 0,
      currency: item.price?.currency || "USD",
      condition: item.condition || "",
      url: href,
      checkedAt,
      example: false,
    });
  }).filter(Boolean);
}

export async function fetchWalmartOffers(query, env, fetchImpl = fetch) {
  if (!shouldRun(env)) throw new Error("Refresh disabled: secrets missing.");
  const timestamp = Date.now();
  const signed = await walmartSignature(env, timestamp);
  const url = new URL("https://developer.api.walmart.com/api-proxy/service/affil/product/v2/search");
  url.searchParams.set("query", query);
  url.searchParams.set("publisherId", env.WALMART_PUBLISHER_ID);
  // TODO: confirm this host and publisherId parameter against
  // https://walmart.io/apidocs/affiliates/affiliate-marketing-api before enabling.
  const res = await fetchImpl(url, {
    headers: {
      "WM_CONSUMER.ID": env.WALMART_CONSUMER_ID,
      "WM_CONSUMER.INTIMESTAMP": signed.timestamp,
      "WM_SEC.KEY_VERSION": signed.keyVersion,
      "WM_SEC.AUTH_SIGNATURE": signed.signature,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Walmart search HTTP ${res.status}`);
  const data = await res.json();
  const items = data.items || data.products || [];
  const checkedAt = new Date().toISOString();
  return items.map((item) => {
    const href = item.productTrackingUrl;
    if (!href) return null;
    return assertHistoryOff({
      id: `walmart-${item.itemId || item.id}`,
      title: item.name || item.title || "",
      itemPrice: Number(item.salePrice || item.price || 0),
      shipping: Number(item.standardShipRate || 0),
      currency: "USD",
      condition: "New",
      url: href,
      checkedAt,
      example: false,
      priceNote: "Price on Walmart.com at time of purchase governs.",
    });
  }).filter(Boolean);
}

export function currentFeed(partial) {
  return {
    meta: {
      exampleData: false,
      generatedAt: new Date().toISOString(),
      priceHistory: {
        enabled: false,
        todo: "Disabled. eBay needs written permission before any archive or 30/90-day low. Walmart prohibits price tracking.",
      },
      amazon: { enabled: false, note: "No Amazon prices are stored." },
      ebayMaxAgeMs: EBAY_MAX_AGE_MS,
    },
    products: partial,
  };
}
