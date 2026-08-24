/* Smart Realty listing search: NL parse, government-entity filter, ranking, pagination. */
(function (root) {
  var PAGE_SIZE = 12;
  var GOV_RE =
    /\b(courthouse|county courthouse|clerk of court|county clerk(?:'s)? office|recorder(?:'s)? office|assessor(?:'s)? office|tax (?:office|collector)|sheriff(?:'s)? (?:office|department|dept)|county administration|city hall|municipal (?:building|office)|records department|hall of justice|judicial center|master commissioner(?:'s)? office)\b/i;
  var CITIES = {
    louisville: { state: "KY", lat: 38.2527, lng: -85.7585, aliases: ["lville", "louiville", "louisvil"] },
    jeffersonville: { state: "IN", lat: 38.2776, lng: -85.7372, aliases: ["jeffersonville in", "jeffersonville indiana"] },
    "new albany": { state: "IN", lat: 38.2856, lng: -85.8241, aliases: ["new albany in", "new albany indiana"] },
    utica: { state: "IN", lat: 38.3356, lng: -85.6547, aliases: ["utica in", "utica indiana"] },
    clarksville: { state: "IN", lat: 38.2967, lng: -85.7599, aliases: ["clarksville in"] },
    lexington: { state: "KY", lat: 38.0406, lng: -84.5037, aliases: ["lex"] },
    greensboro: { state: "NC", lat: 36.0726, lng: -79.792, aliases: ["greensbor", "gso"] },
    charlotte: { state: "NC", lat: 35.2271, lng: -80.8431, aliases: [] },
    nashville: { state: "TN", lat: 36.1627, lng: -86.7816, aliases: [] },
    "las vegas": { state: "NV", lat: 36.1699, lng: -115.1398, aliases: ["vegas"] },
    austin: { state: "TX", lat: 30.2672, lng: -97.7431, aliases: [] },
    miami: { state: "FL", lat: 25.7617, lng: -80.1918, aliases: [] },
    chicago: { state: "IL", lat: 41.8781, lng: -87.6298, aliases: [] },
    denver: { state: "CO", lat: 39.7392, lng: -104.9903, aliases: [] },
  };

  function lev(a, b) {
    a = String(a || "");
    b = String(b || "");
    if (a === b) return 0;
    var m = a.length;
    var n = b.length;
    if (!m) return n;
    if (!n) return m;
    var prev = [];
    var cur = [];
    var i;
    var j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[n];
  }

  function moneyToken(raw, unit) {
    var n = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(n)) return 0;
    var u = String(unit || "").toLowerCase();
    if (u === "k") n *= 1000;
    if (u === "m") n *= 1000000;
    return Math.round(n);
  }

  function isGovernmentEntity(p) {
    var text = [p && p.title, p && p.address, p && p.location, p && p.propertyType].join(" ");
    return GOV_RE.test(text);
  }

  function hasHouseNumber(addr) {
    return /^\d+/.test(String(addr || "").trim());
  }

  function hasUsableRoomPhoto(p) {
    if (!p || isGovernmentEntity(p) || p.source === "court") return false;
    var imgs = Array.isArray(p.images) ? p.images.slice() : [];
    if (p.image) imgs.unshift(p.image);
    return imgs.some(function (img) {
      if (!img || String(img).indexOf("data:image/svg") === 0) return false;
      if (/NoImage|placeholder|courthouse|circuit.?court|photo-unavailable/i.test(img)) return false;
      if (/maps\.googleapis\.com\/maps\/api\/streetview/i.test(img)) return false;
      if (p.imageSource === "street_view") return false;
      if (p.primaryImageSource === "street_view" && !p.hasListingPhotos) return false;
      return true;
    });
  }

  function isListableHome(p) {
    if (!p) return false;
    if (isGovernmentEntity(p)) return false;
    var blob = [p.title, p.address, p.location].join(" ");
    if (/2611\s+harmony/i.test(blob)) return false;
    var addr = p.title || p.address || "";
    var src = String(p.source || "");
    if (src === "court" || src === "hud") return hasHouseNumber(addr);
    if (!hasHouseNumber(addr) && /\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|parkway|pkwy|blvd)\b/i.test(addr) && addr.split(/\s+/).length <= 6) {
      return false;
    }
    return !!(p.title || p.address);
  }

  function parseQuery(raw) {
    var q = String(raw || "").trim();
    var out = {
      raw: q,
      text: q,
      priceMin: 0,
      priceMax: 0,
      beds: 0,
      baths: 0,
      zip: "",
      city: "",
      state: "",
      nearMe: false,
      propertyType: "",
      rentable: false,
    };
    if (!q) return out;
    var s = q.toLowerCase();
    if (/\b(near me|nearby|around me|close to me)\b/.test(s)) out.nearMe = true;
    if (/\b(rent|rental|for rent|apartment)\b/.test(s)) out.rentable = true;
    var bed = s.match(/(\d+)\s*(?:bed|beds|bedroom|bedrooms|br)\b/);
    if (bed) out.beds = Number(bed[1]);
    var bath = s.match(/(\d+(?:\.\d+)?)\s*(?:bath|baths|bathroom|bathrooms|ba)\b/);
    if (bath) out.baths = Number(bath[1]);
    var under = s.match(/\b(?:under|below|less than|<)\s*\$?\s*([\d.,]+)\s*(k|m)?\b/);
    if (under) out.priceMax = moneyToken(under[1], under[2]);
    var over = s.match(/\b(?:over|above|at least|>)\s*\$?\s*([\d.,]+)\s*(k|m)?\b/);
    if (over) out.priceMin = moneyToken(over[1], over[2]);
    var zip = s.match(/\b(\d{5})\b/);
    if (zip) out.zip = zip[1];
    var st = s.match(/\b(in|near|around)\s+([a-z .'-]+?)(?:,\s*([a-z]{2})\b|$)/);
    if (st) {
      out.city = st[2].replace(/\b(homes?|houses?|property|properties)\b/g, "").trim();
      if (st[3]) out.state = st[3].toUpperCase();
    }
    var stateOnly = s.match(/\b(ky|nc|tn|in|oh|nv|tx|fl|il|co)\b/);
    if (!out.state && stateOnly) out.state = stateOnly[1].toUpperCase();
    if (/\b(condo|townhome|townhouse|single family|house|home)\b/.test(s)) {
      if (/\bcondo/.test(s)) out.propertyType = "condo";
      else if (/\btown/.test(s)) out.propertyType = "town";
      else out.propertyType = "house";
    }
    var names = Object.keys(CITIES);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var aliases = [name].concat(CITIES[name].aliases || []);
      for (var a = 0; a < aliases.length; a++) {
        if (s.indexOf(aliases[a]) !== -1 || lev(s, aliases[a]) <= 1) {
          out.city = out.city || name;
          if (!out.state) out.state = CITIES[name].state || "";
        }
      }
    }
    out.text = s
      .replace(/\b(homes?|houses?|properties|property|for sale|near me|nearby)\b/g, " ")
      .replace(/\b(\d+)\s*(?:bed|beds|bedroom|bedrooms|br)\b/g, " ")
      .replace(/\b(?:under|below|less than|over|above)\s*\$?[\d.,]+\s*(k|m)?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (out.city) {
      var cityRe = new RegExp("\\b" + out.city.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\b", "ig");
      out.text = out.text.replace(cityRe, " ").replace(/\b(in|near|around|at)\b/g, " ").replace(/\s+/g, " ").trim();
    }
    if (out.state) {
      out.text = out.text.replace(new RegExp("\\b" + out.state + "\\b", "ig"), " ").replace(/\s+/g, " ").trim();
    }
    return out;
  }

  function haversine(aLat, aLng, bLat, bLng) {
    if (![aLat, aLng, bLat, bLng].every(function (n) { return Number.isFinite(n) && n !== 0; })) return Infinity;
    var R = 3958.8;
    var dLat = ((bLat - aLat) * Math.PI) / 180;
    var dLng = ((bLng - aLng) * Math.PI) / 180;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function listingHay(p) {
    return [p.title, p.location, p.desc, (p.tags || []).join(" "), p.propertyType, p.status, p.caseNumber]
      .join(" ")
      .toLowerCase();
  }

  function fuzzyHay(hay, token) {
    if (!token || token.length < 3) return hay.indexOf(token) !== -1;
    if (hay.indexOf(token) !== -1) return true;
    var parts = hay.split(/[^a-z0-9]+/);
    for (var i = 0; i < parts.length; i++) {
      if (Math.abs(parts[i].length - token.length) <= 2 && lev(parts[i], token) <= 1) return true;
    }
    return false;
  }

  function completeness(p) {
    var n = 0;
    if (p.listPrice || p.offer) n += 2;
    if (p.beds) n += 1;
    if (p.baths) n += 1;
    if (p.sqft) n += 1;
    if (p.lat && p.lng) n += 1;
    if (hasUsableRoomPhoto(p)) n += 2;
    if (p.desc && p.desc.length > 40) n += 1;
    if (p.propertyType) n += 1;
    return n;
  }

  function cityCoords(name) {
    var key = String(name || "").toLowerCase();
    return CITIES[key] || null;
  }

  function rankListings(list, parsed, origin) {
    var orig = origin || {};
    return list
      .map(function (p) {
        var hay = listingHay(p);
        var score = 0;
        var active = p.source === "hud" || (!p.source && (p.listPrice || 0) > 0);
        if (isGovernmentEntity(p)) score -= 1000;
        else if (active) score += 80;
        else if (p.source === "court") score += 20;
        else score += 40;
        if (parsed.zip && hay.indexOf(parsed.zip) !== -1) score += 40;
        if (parsed.city && fuzzyHay(hay, parsed.city)) score += 35;
        if (parsed.state && hay.indexOf(parsed.state.toLowerCase()) !== -1) score += 20;
        if (parsed.text) {
          parsed.text.split(" ").forEach(function (tok) {
            if (tok.length > 2 && fuzzyHay(hay, tok)) score += 8;
          });
        }
        var dist = haversine(orig.lat, orig.lng, Number(p.lat), Number(p.lng));
        if (Number.isFinite(dist) && dist < 250) score += Math.max(0, 30 - dist / 8);
        var listed = Date.parse(p.listingDate || p.listDate || "") || 0;
        if (listed) score += Math.max(0, 15 - (Date.now() - listed) / 86400000);
        score += completeness(p);
        if (hasUsableRoomPhoto(p)) score += 8;
        return { p: p, score: score, dist: dist };
      })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (row) {
        row.p._searchDist = row.dist;
        row.p._searchScore = row.score;
        return row.p;
      });
  }

  function filterListings(list, parsed, extra) {
    extra = extra || {};
    return (list || []).filter(function (p) {
      if (!isListableHome(p)) return false;
      if (extra.tag && extra.tag !== "all" && extra.tag !== "rentable" && !(p.tags || []).includes(extra.tag)) return false;
      if ((extra.rentable || parsed.rentable) && !p.rentable) return false;
      var price = Number(p.offer || p.listPrice || 0);
      var pmin = extra.priceMin || parsed.priceMin;
      var pmax = extra.priceMax || parsed.priceMax;
      if (pmin && price && price < pmin) return false;
      if (pmax && price && price > pmax) return false;
      if ((extra.beds || parsed.beds) && (p.beds || 0) < (extra.beds || parsed.beds)) return false;
      if ((extra.baths || parsed.baths) && (p.baths || 0) < (extra.baths || parsed.baths)) return false;
      if (parsed.propertyType === "condo" && !/condo/i.test(p.propertyType || "")) return false;
      if (parsed.zip && listingHay(p).indexOf(parsed.zip) === -1 && extra.requireZip) return false;
      if (parsed.city && !fuzzyHay(listingHay(p), parsed.city.toLowerCase())) return false;
      if (parsed.state && !new RegExp("\\b" + parsed.state + "\\b", "i").test(listingHay(p))) return false;
      if (parsed.text) {
        var tokens = parsed.text.split(" ").filter(function (t) { return t.length > 2; });
        for (var i = 0; i < tokens.length; i++) {
          if (!fuzzyHay(listingHay(p), tokens[i]) && !/^\d+$/.test(tokens[i])) {
            return false;
          }
        }
      }
      return true;
    });
  }

  function paginate(list, page, size) {
    var s = size || PAGE_SIZE;
    var p = Math.max(1, page || 1);
    var start = (p - 1) * s;
    return { items: list.slice(start, start + s), page: p, pageSize: s, total: list.length, hasMore: start + s < list.length };
  }

  var api = {
    PAGE_SIZE: PAGE_SIZE,
    parseQuery: parseQuery,
    isGovernmentEntity: isGovernmentEntity,
    isListableHome: isListableHome,
    hasUsableRoomPhoto: hasUsableRoomPhoto,
    hasHouseNumber: hasHouseNumber,
    rankListings: rankListings,
    filterListings: filterListings,
    paginate: paginate,
    cityCoords: cityCoords,
    haversine: haversine,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SRUSearch = api;
})(typeof window !== "undefined" ? window : globalThis);
