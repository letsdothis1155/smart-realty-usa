/**
 * Room generation pipeline — modular so a listing photo can later
 * become an editable 3D room without rewriting the shop UI.
 *
 * ROOM PHOTO
 *   → room / scene classification (OpenAI vision)
 *   → wall / floor estimation     (OpenAI vision)
 *   → approximate dimensions      (single-photo estimate)
 *   → 3D geometry               (this client + /api/shop/reconstruct)
 *   → editable room
 *   → furniture placement
 *   → purchasable products
 *
 * Mode A (now): vision-estimated rectangular shell from a real listing photo.
 * Mode B (later): RoomPlan / LiDAR / multi-photo via the same contract.
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

export const DEFAULT_LIVING_ROOM = {
  mode: "default",
  estimated: true,
  label: "Sample living room — interactive 3D, not an architectural scan",
  roomType: "living",
  width: 6.4,
  depth: 5.2,
  height: 2.72,
  photoUrl: "",
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
  const config = typeof window === "undefined" ? null : window.SRU_CONFIG?.photoReconstruction;
  const enabled = typeof window === "undefined" || config?.enabled !== false;
  if (normalizedPhotoUrl && enabled) {
    try {
      const res = await fetch(config?.endpoint || "/api/shop/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: normalizedPhotoUrl, listingId, roomType }),
      });
      const data = await res.json();
      if (data?.room) return { ...DEFAULT_LIVING_ROOM, ...data.room, listingId };
    } catch {
      /* The builder remains usable when photo analysis is unavailable. */
    }
  }
  if (normalizedPhotoUrl) {
    return {
      ...DEFAULT_LIVING_ROOM,
      mode: "fallback",
      label: "Photo analysis unavailable — showing a sample room.",
      listingId,
      roomType,
      photoUrl: "",
      sourcePhotoUrl: normalizedPhotoUrl,
      analysis: { sceneKind: "unusable", confidence: "low" },
    };
  }
  return { ...DEFAULT_LIVING_ROOM, listingId, roomType };
}
