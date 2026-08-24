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
 * Mode A (now): rectangular living-room shell, labeled as an estimate.
 * Mode B (later): RoomPlan / LiDAR / multi-photo via the same reconstructRoom() contract.
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

export async function reconstructRoom({ photoUrl = "", listingId = "", roomType = "living" } = {}) {
  const normalizedPhotoUrl = normalizeListingPhotoUrl(photoUrl);
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
          listingId,
          roomType: preset.roomType,
          widthPx: 1600,
          heightPx: 900,
        }),
      });
      const data = await res.json();
      if (data.ok && data.room) return { ...base, ...data.room, listingId, estimated: true };
      if (data.room) return { ...base, ...data.room, listingId, estimated: true };
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
