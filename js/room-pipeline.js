import { planListing } from "./sr-layout.mjs";

/**
 * Room generation pipeline — modular so a listing photo can later
 * become an editable 3D room without rewriting the shop UI.
 *
 * ROOM PHOTO
 *   → depth estimation          (later)
 *   → wall / floor detection    (later)
 *   → approximate dimensions    (Mode A: photo estimate API)
 *   → 3D geometry               (this client + /api/shop/reconstruct)
 *   → editable room
 *   → furniture placement
 *   → purchasable products
 *
 * Mode A (now): photo-grouped, editable rectangular room shells, labeled as estimates.
 * Mode B (later): RoomPlan / LiDAR via the same reconstruction contracts.
 */

export const PIPELINE_STAGES = [
  "photo",
  "depth",
  "walls",
  "dimensions",
  "geometry",
  "editable",
  "furnish",
  "buy",
];

export const ROOM_PRESETS = {
  living: { roomType: "living", width: 6.4, depth: 5.2, height: 2.72, label: "Living room · estimated shell" },
  bedroom: { roomType: "bedroom", width: 4.6, depth: 4.0, height: 2.55, label: "Bedroom · estimated shell" },
  kitchen: { roomType: "kitchen", width: 4.2, depth: 3.8, height: 2.55 },
  bathroom: { roomType: "bathroom", width: 2.6, depth: 2.4, height: 2.45 },
  other: { roomType: "other", width: 4.0, depth: 3.6, height: 2.55 },
  dining: { roomType: "dining", width: 5.2, depth: 4.4, height: 2.7, label: "Dining · estimated shell" },
};

export const FINISH_PRESETS = {
  oak: { id: "oak", label: "Warm oak", wall: "#f3f0ea", floor: "#b0895a" },
  linen: { id: "linen", label: "Soft linen", wall: "#ece7dc", floor: "#c4b49a" },
  slate: { id: "slate", label: "Cool slate", wall: "#d8dde4", floor: "#6d737c" },
};

export const DEFAULT_LIVING_ROOM = {
  mode: "default",
  estimated: true,
  label: "Sample living room — interactive 3D, not an architectural scan",
  roomType: "living",
  width: 6.4,
  depth: 5.2,
  height: 2.72,
  photoUrl: "",
  finish: "oak",
  floorPolygon: [
    { x: -3.2, z: -2.6 }, { x: 3.2, z: -2.6 },
    { x: 3.2, z: 2.6 }, { x: -3.2, z: 2.6 },
  ],
  walls: [
    { id: "north", role: "wall", windows: 0 },
    { id: "west", role: "wall", windows: 2 },
    { id: "east", role: "wall", windows: 1 },
    { id: "south", role: "wall", door: true },
  ],
  floor: { role: "floor", finish: "oak" },
  ceiling: { role: "ceiling" },
  objects: [],
};

export function normalizeListingPhotoUrl(photoUrl) {
  const raw = String(photoUrl || "").trim();
  if (!raw || typeof window === "undefined") return raw;
  try {
    const siteRoot = `${window.SRU_CONFIG?.siteUrl || window.location.origin}/`;
    return new URL(raw.replace(/^\.\//, ""), siteRoot).toString();
  } catch {
    return raw;
  }
}

export async function reconstructRoom({ photoUrl = "", photoUrls = [], listingId = "", roomType = "living" } = {}) {
  const normalizedPhotos = [...new Set([photoUrl, ...(Array.isArray(photoUrls) ? photoUrls : [])]
    .map(normalizeListingPhotoUrl)
    .filter(Boolean))].slice(0, 4);
  const normalizedPhotoUrl = normalizedPhotos[0] || "";
  const preset = ROOM_PRESETS[roomType] || ROOM_PRESETS.living;
  const base = {
    ...DEFAULT_LIVING_ROOM,
    ...preset,
    listingId,
    photoUrl: normalizedPhotoUrl,
    roomType: preset.roomType,
    estimated: true,
  };
  const config = typeof window === "undefined" ? null : window.SRU_CONFIG?.photoReconstruction;
  const shopApiEnabled = typeof window === "undefined" || (photoUrl && window.SRU_SHOP_API !== false);
  if (normalizedPhotoUrl && config?.enabled !== false && shopApiEnabled) {
    try {
      const res = await fetch(config?.endpoint || "/api/shop/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "photo",
          imageUrl: normalizedPhotoUrl,
          imageUrls: normalizedPhotos,
          listingId,
          roomType: preset.roomType,
          widthPx: 1600,
          heightPx: 900,
        }),
      });
      const data = await res.json();
      if (data.ok && data.room) return { ...base, ...data.room, listingId, estimated: true };
      if (data.room) {
        return {
          ...base,
          ...data.room,
          listingId,
          estimated: true,
          analysis: { ...data.room.analysis, errorCode: data.code || "photo_analysis_failed" },
        };
      }
    } catch {
      /* The builder remains usable when photo analysis is unavailable. */
    }
  }
  if (normalizedPhotoUrl) {
    return {
      ...base,
      mode: "fallback",
      label: "Photo analysis unavailable — showing a sample room.",
      photoUrl: "",
      sourcePhotoUrl: normalizedPhotoUrl,
      analysis: { sceneKind: "unusable", confidence: "low" },
    };
  }
  return base;
}

const M_PER_FT = 0.3048;
const SQM_PER_SQFT = 0.092903;

const ROOM_LOOK = {
  living: { finish: "oak", aspect: 1.28, share: 0.22, min: 160, max: 520, height: 2.72 },
  kitchen: { finish: "oak", aspect: 1.15, share: 0.12, min: 90, max: 280, height: 2.55 },
  dining: { finish: "oak", aspect: 1.2, share: 0.1, min: 100, max: 260, height: 2.7 },
  bedroom: { finish: "linen", aspect: 1.22, share: 0, min: 90, max: 360, height: 2.55 },
  bathroom: { finish: "slate", aspect: 1.2, share: 0, min: 35, max: 90, height: 2.45 },
  other: { finish: "linen", aspect: 1.15, share: 0.06, min: 50, max: 160, height: 2.55 },
};

function clampSpan(meters) {
  return Math.min(14.5, Math.max(2.05, meters));
}

function spanFromArea(areaSqft, aspect) {
  const areaM = Math.max(areaSqft, 40) * SQM_PER_SQFT;
  return {
    width: Number(clampSpan(Math.sqrt(areaM * aspect)).toFixed(2)),
    depth: Number(clampSpan(Math.sqrt(areaM / aspect)).toFixed(2)),
  };
}

/** Estimate one room from the home's listed square footage. Not a measurement. */
export function listingRoomSize(listing, roomType, index = 0, total = 1) {
  const look = ROOM_LOOK[roomType] || ROOM_LOOK.other;
  const preset = ROOM_PRESETS[roomType] || ROOM_PRESETS.other;
  const base = {
    width: preset.width,
    depth: preset.depth,
    height: preset.height || 2.55,
    finish: look.finish,
    sizeSource: "preset",
  };
  const sqft = Number(listing?.sqft);
  if (!Number.isFinite(sqft) || sqft < 200) return base;
  const usable = sqft * 0.7;
  const count = Math.max(1, total);
  let area;
  if (roomType === "bedroom") {
    const bathCount = Math.min(30, Math.max(1, Math.ceil(Number(listing.baths) || 1)));
    const reserved = (ROOM_LOOK.living.share + ROOM_LOOK.kitchen.share) * usable + bathCount * 55;
    const pool = Math.max(usable * 0.34, usable - reserved);
    const weight = index === 0 ? 1.45 : 1;
    const weightSum = 1.45 + Math.max(0, count - 1);
    area = (pool * weight) / weightSum;
  } else if (roomType === "bathroom") {
    area = 48 * (index === 0 ? 1.35 : 1) * (sqft > 4000 ? 1.25 : 1);
  } else {
    area = look.share * usable;
  }
  area = Math.min(look.max, Math.max(look.min, area));
  return {
    ...spanFromArea(area, look.aspect),
    height: look.height,
    finish: look.finish,
    sizeSource: "listed-sqft",
    listedSqft: Math.round(sqft),
  };
}

export function planningRoom(id, roomType, label, size = null) {
  return {
    ...DEFAULT_LIVING_ROOM,
    ...(ROOM_PRESETS[roomType] || ROOM_PRESETS.other),
    ...(size || {}),
    id,
    label,
    mode: "planning",
    floorPolygon: undefined,
    walls: [],
    photoIndices: [],
  };
}

/** Short picker name. Size and source notes stay after the first " · ". */
export function roomChoiceLabel(label) {
  const name = String(label || "Room").split(" · ")[0].trim();
  return name || "Room";
}

/**
 * Distance from a wall that fills a perspective camera on the tighter axis.
 * fovDeg is the vertical field of view. The other axis is cropped.
 */
export function photoWallDistance(wallWidth, wallHeight, fovDeg = 50, aspect = 1) {
  const tanV = Math.tan((Number(fovDeg) * Math.PI) / 360);
  const tanH = tanV * Math.max(0.2, Number(aspect) || 1);
  const width = Math.max(0.2, Number(wallWidth) || 0.2);
  const height = Math.max(0.2, Number(wallHeight) || 0.2);
  return Math.min(height / 2 / tanV, width / 2 / tanH);
}

export function applyListedSize(room, listing, index = 0, total = 1, plan = null) {
  const id = room?.id?.replace(/^reference-/, "");
  const planned = plan?.rooms.find(entry => entry.id === id);
  if (planned && room.mode !== "vision" && room.mode !== "lidar") {
    return {
      ...room, width: planned.w, depth: planned.d, height: plan.heightM,
      floorPolygon: undefined, sizeSource: planned.estimated ? "listed-sqft" : "listed-room",
      listedSqft: plan.sqft,
    };
  }
  if (!room || room.mode === "vision" || room.mode === "lidar" || room.sizeSource === "listed-sqft") return room;
  const sized = listingRoomSize(listing, room.roomType || "other", index, total);
  if (sized.sizeSource !== "listed-sqft") return room;
  const feet = `${Math.round(sized.width / M_PER_FT)}×${Math.round(sized.depth / M_PER_FT)} ft`;
  return {
    ...room,
    ...sized,
    label: `${room.label || "Room"} · about ${feet} from the listed ${sized.listedSqft.toLocaleString("en-US")} sqft`,
  };
}

export function propertyRoomModel(listing, photoUrls) {
  if (!listing) return { rooms: [], plan: null };
  let plan = null;
  try { plan = planListing(listing); } catch { /* Partial listing data can still provide photos. */ }
  const rooms = listPropertyRooms(listing, photoUrls);
  const byType = new Map();
  for (const room of rooms) {
    const type = room.roomType;
    const total = rooms.filter(entry => entry.roomType === type).length;
    const index = byType.get(type) || 0;
    byType.set(type, index + 1);
    Object.assign(room, applyListedSize(room, listing, index, total, plan));
  }
  return { rooms, plan };
}

function photoStem(photoUrl) {
  let name = "";
  try {
    name = decodeURIComponent(new URL(photoUrl, "https://smartrealty.us/").pathname.split("/").at(-1) || "");
  } catch {
    return "";
  }
  let stem = name.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  stem = stem.replace(/_+\d{5,}.*$/, "");
  stem = stem.replace(/[()]/g, "");
  stem = stem.replace(/[\s-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  for (let pass = 0; pass < 3; pass += 1) {
    stem = stem.replace(/_(?:other|copy|medium|edit|edited|g|use)(?:_\d+)?$/, "");
  }
  return stem.replace(/_+$/g, "");
}

/** Map a listing photo filename to one room. Exterior and unnamed shots are not rooms. */
export function classifyRoomPhoto(photoUrl) {
  const stem = photoStem(photoUrl);
  if (!stem || /^(?:img|dsc|image|photo|pic|i\d+|\d+)/.test(stem)) return null;
  const exterior = /^(?:front|ftont|back|rear|side|yard|aerial|street|outbuildings?|exterior|patio|deck|porch|driveway)(?:_|$)/;
  if ((exterior.test(stem) && !/(?:bed|bath|kit|living|dining)/.test(stem)) || /front_and_side|back_patio|outbuilding/.test(stem)) {
    return null;
  }
  const numbered = stem.match(/^(?:bdr|br|bed|bedroom)_(\d{1,2})$/);
  if (numbered) return { id: `bedroom-${Number(numbered[1])}`, label: `Bedroom ${Number(numbered[1])}`, roomType: "bedroom" };
  const numberedBath = stem.match(/^(?:ba|bath|bathroom)_(\d{1,2})$/);
  if (numberedBath) return { id: `bathroom-${Number(numberedBath[1])}`, label: `Bathroom ${Number(numberedBath[1])}`, roomType: "bathroom" };
  const named = [
    [/^(?:master|primary|mbr)_(?:bath|bathroom)$/, "primary-bathroom", "Primary bathroom", "bathroom"],
    [/^(?:master|primary|mbr)(?:_bed(?:room)?)?(?:_\d+)?$/, "primary-bedroom", "Primary bedroom", "bedroom"],
    [/^(?:hall|full|half)_(?:bath|bathroom)$/, "hall-bathroom", "Hall bathroom", "bathroom"],
    [/^(?:bath|bathroom)$/, "bathroom-1", "Bathroom", "bathroom"],
    [/^(?:living_room|living|lr)(?:_\d+)?$/, "living", "Living room", "living"],
    [/^(?:kitchen|kit)(?:_\d+)?$/, "kitchen", "Kitchen", "kitchen"],
    [/^(?:eating_space|dining(?:_room|_area)?)(?:_\d+)?$/, "dining", "Dining area", "dining"],
    [/^(?:utility|laundry)(?:_room)?(?:_\d+)?$/, "utility", "Utility room", "other"],
    [/^(?:hall|hallway)(?:_\d+)?$/, "hall", "Hallway", "other"],
    [/^(basement|office|den|shop|garage|bonus)(?:_room)?(?:_\d+)?$/, null, null, "other"],
  ].find(([pattern]) => pattern.test(stem));
  if (!named) return null;
  if (named[1]) return { id: named[1], label: named[2], roomType: named[3] };
  const word = stem.match(/^(basement|office|den|shop|garage|bonus)/)[1];
  const label = word.charAt(0).toUpperCase() + word.slice(1);
  return { id: word, label, roomType: "other" };
}

function namedRoomPhoto(sourcePhotoUrl) {
  const found = classifyRoomPhoto(sourcePhotoUrl);
  return found ? [found.id, found.label, found.roomType] : null;
}

function propertyRoomOrder(room) {
  const typeRank = { living: 0, kitchen: 1, dining: 2, bedroom: 3, bathroom: 4, other: 5 };
  const id = String(room?.id || "");
  const number = Number((id.match(/(\d+)$/) || [])[1] || 50);
  const rank = /primary/.test(id) ? 0 : number;
  return (typeRank[room?.roomType] ?? 9) * 100 + rank;
}

/**
 * Every room that belongs on a property: named listing photos, plus living,
 * kitchen, bedrooms, and bathrooms taken from the listing when a photo did not
 * name them. One button per room. Loose photos are not rooms.
 */
export function listPropertyRooms(listing, photoUrls = []) {
  const photos = [...new Set((Array.isArray(photoUrls) ? photoUrls : []).filter(Boolean))];
  const groups = new Map();
  photos.forEach((url, index) => {
    const found = classifyRoomPhoto(url);
    if (!found) return;
    const id = `reference-${found.id}`;
    if (!groups.has(id)) groups.set(id, { ...found, urls: [], indices: [] });
    const group = groups.get(id);
    group.urls.push(url);
    group.indices.push(index);
  });
  const named = [...groups.values()].map((group) => ({
    ...planningRoom(`reference-${group.id}`, group.roomType, `${group.label} · photo reference`),
    mode: "fallback",
    sourcePhotoUrl: group.urls[0],
    sourcePhotoUrls: group.urls,
    photoIndices: group.indices,
  }));
  return [...named, ...missingPlanningRooms(listing, named)]
    .sort((a, b) => propertyRoomOrder(a) - propertyRoomOrder(b) || String(a.label).localeCompare(String(b.label)));
}

function groupReferenceRooms(rooms) {
  const grouped = new Map();
  for (const room of rooms) {
    const named = room.mode === "fallback" && namedRoomPhoto(room.sourcePhotoUrl);
    if (!named) {
      grouped.set(room.id, room);
      continue;
    }
    const [name, label, roomType] = named;
    const id = `reference-${name}`;
    if (!grouped.has(id)) grouped.set(id, {
      ...planningRoom(id, roomType, `${label} · photo reference`),
      mode: "fallback", sourcePhotoUrls: [], photoIndices: [], analysis: room.analysis,
    });
    const group = grouped.get(id);
    group.sourcePhotoUrls.push(room.sourcePhotoUrl);
    group.photoIndices.push(...room.photoIndices);
  }
  return [...grouped.values()];
}

export function missingPlanningRooms(listing, rooms) {
  if (!listing) return [];
  const result = [];
  const count = (value) => Math.min(30, Math.max(0, Math.ceil(Number(value) || 0)));
  for (const [type, label, total] of [
    ["living", "Living room", 1],
    ["kitchen", "Kitchen", 1],
    ["bedroom", "Bedroom", count(listing.beds)],
    ["bathroom", "Bathroom", count(listing.baths)],
  ]) {
    const analyzed = rooms.filter((room) => (room.mode === "vision" || room.id.startsWith("reference-")) &&
      (room.roomType === type || room.label?.toLowerCase().includes(type))).length;
    for (let i = analyzed; i < total; i += 1) {
      const name = `${label}${total > 1 ? ` ${i + 1}` : ""}`;
      const sized = listingRoomSize(listing, type, i, total);
      const feet = `${Math.round(sized.width / M_PER_FT)}×${Math.round(sized.depth / M_PER_FT)} ft`;
      const source = sized.sizeSource === "listed-sqft"
        ? `about ${feet} from the listed ${Number(listing.sqft).toLocaleString("en-US")} sqft`
        : "estimated shell";
      result.push(planningRoom(`plan-${type}-${i + 1}`, type, `${name} · ${source}`, sized));
    }
  }
  return result;
}

export async function reconstructHouse({ photoUrls = [], listingId = "" } = {}) {
  const photos = [...new Set((Array.isArray(photoUrls) ? photoUrls : [])
    .map(normalizeListingPhotoUrl).filter(Boolean))];
  if (!photos.length) {
    return { mode: "default", estimated: true, rooms: [] };
  }

  const config = typeof window === "undefined" ? null : window.SRU_CONFIG?.photoReconstruction;
  let canAnalyze = config?.enabled !== false && (typeof window === "undefined" || window.SRU_SHOP_API !== false);
  const rooms = [];
  for (let offset = 0; offset < photos.length; offset += 8) {
    const batch = photos.slice(offset, offset + 8);
    let errorCode = "";
    if (canAnalyze) {
      try {
        const response = await fetch(config?.endpoint || "/api/shop/reconstruct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "house", imageUrls: batch, listingId }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (data.ok && data.house?.mode === "vision" && data.house.rooms?.length) {
          rooms.push(...data.house.rooms.map((room, index) => ({
            ...room,
            id: offset ? `gallery-${offset}-${room.id || index + 1}` : room.id || `room-${index + 1}`,
            photoIndices: (room.photoIndices || []).map((i) => i + offset),
          })));
          continue;
        }
        errorCode = data.code || "";
        if (response.status === 429 || response.status >= 500 || errorCode === "openai_credits_exhausted") {
          canAnalyze = false;
        }
      } catch {
        canAnalyze = false;
      }
    }
    rooms.push(...batch.map((sourcePhotoUrl, index) => ({
      ...planningRoom(`photo-${offset + index + 1}`, "living", `Photo ${offset + index + 1} · reference only`),
      mode: "fallback",
      sourcePhotoUrl,
      sourcePhotoUrls: [sourcePhotoUrl],
      photoIndices: [offset + index],
      analysis: { sceneKind: "unusable", confidence: "low", errorCode },
    })));
  }
  return { mode: rooms.some((room) => room.mode === "vision") ? "vision" : "fallback", estimated: true, listingId, rooms: groupReferenceRooms(rooms) };
}
