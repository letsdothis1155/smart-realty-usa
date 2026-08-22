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

export async function reconstructRoom({ photoUrl = "", listingId = "", roomType = "living" } = {}) {
  if (photoUrl && (typeof window === "undefined" || window.SRU_SHOP_API === true)) {
    try {
      const res = await fetch("/api/shop/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "photo", imageUrl: photoUrl, roomType, widthPx: 1600, heightPx: 900 }),
      });
      const data = await res.json();
      if (data.ok && data.room) return { ...DEFAULT_LIVING_ROOM, ...data.room, listingId };
      if (data.room) return { ...DEFAULT_LIVING_ROOM, ...data.room, listingId };
    } catch {
      /* fall through to default shell — prototype must run without the API */
    }
  }
  return { ...DEFAULT_LIVING_ROOM, listingId, photoUrl, roomType };
}
