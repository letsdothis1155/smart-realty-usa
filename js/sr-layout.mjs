/**
 * Shared floor-plan calculations for the editor and model builder.
 *
 * Listed width and length stay as given. Estimated rooms share the listed
 * square footage. Door (80 in) and counter (36 in) heights are references
 * only. They are not a measurement taken from a photo.
 */

export const DOOR_WIDTH_M = 32 * 0.0254;
export const DOOR_HEIGHT_M = 80 * 0.0254;
export const COUNTER_HEIGHT_M = 36 * 0.0254;
export const DEFAULT_HEIGHT_M = 8 * 0.3048;
export const HALL_WIDTH_M = 4 * 0.3048;
export const FT_TO_M = 0.3048;
export const FT2_TO_M2 = 0.09290304;
export const EYE_HEIGHT_M = 1.55;

const ROW_DEPTH_M = 12 * FT_TO_M;
const MIN_ROOM_SQFT = 40;

const LABELS = {
  living: "Living room",
  kitchen: "Kitchen",
  dining: "Dining area",
  utility: "Utility room",
  "primary-bedroom": "Primary bedroom",
  "primary-bathroom": "Primary bathroom",
  "hall-bathroom": "Hall bathroom",
};

function labelFor(id) {
  if (LABELS[id]) return LABELS[id];
  const bed = id.match(/^bedroom-(\d+)$/);
  if (bed) return `Bedroom ${bed[1]}`;
  const bath = id.match(/^bathroom-(\d+)$/);
  if (bath) return `Bathroom ${bath[1]}`;
  return id;
}

function typeFor(id) {
  if (id === "living" || id === "kitchen" || id === "dining" || id === "utility") return id;
  if (/bath/.test(id)) return "bathroom";
  if (/bed/.test(id)) return "bedroom";
  return "other";
}

function rowFor(id) {
  return /bed|bath/.test(id) ? "north" : "south";
}

function weightFor(id) {
  return id === "primary-bedroom" ? 1.45 : 1;
}

function idFromSizeLabel(text) {
  const s = String(text || "").toLowerCase();
  if (/bath/.test(s) && /primary|master/.test(s)) return "primary-bathroom";
  if (/bath/.test(s) && /hall|full|half/.test(s)) return "hall-bathroom";
  if (/bed/.test(s) && /primary|master/.test(s)) return "primary-bedroom";
  const bed = s.match(/bed(?:room)?\s*(\d+)/);
  if (bed) return `bedroom-${Number(bed[1])}`;
  const bath = s.match(/bath(?:room)?\s*(\d+)/);
  if (bath) return `bathroom-${Number(bath[1])}`;
  if (/living/.test(s)) return "living";
  if (/kitchen/.test(s)) return "kitchen";
  if (/dining|eating/.test(s)) return "dining";
  if (/utility|laundry/.test(s)) return "utility";
  return "";
}

function parsePair(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const widthFt = Number(match[1]);
  const lengthFt = Number(match[2]);
  if (!(widthFt > 0) || !(lengthFt > 0)) return null;
  return { widthFt, lengthFt };
}

function listedIndex(roomSizes) {
  const found = new Map();
  const items = Array.isArray(roomSizes) ? roomSizes : [];
  for (const item of items) {
    if (item && typeof item === "object" && item.id && item.widthFt && item.lengthFt) {
      found.set(String(item.id), {
        widthFt: Number(item.widthFt),
        lengthFt: Number(item.lengthFt),
      });
      continue;
    }
    const text = typeof item === "string" ? item : `${item?.label || item?.name || ""} ${item?.size || ""}`;
    const id = item?.id || idFromSizeLabel(text);
    const pair = parsePair(text) || (item?.widthFt && item?.lengthFt
      ? { widthFt: Number(item.widthFt), lengthFt: Number(item.lengthFt) }
      : null);
    if (id && pair) found.set(id, pair);
  }
  return found;
}

function ceilingM(listing) {
  const ft = Number(listing?.ceilingFt ?? listing?.ceilingHeightFt);
  if (Number.isFinite(ft) && ft >= 7 && ft <= 20) return ft * FT_TO_M;
  return DEFAULT_HEIGHT_M;
}

function buildSpecs(listing) {
  const beds = Math.min(30, Math.max(0, Math.ceil(Number(listing.beds) || 0)));
  const baths = Math.min(30, Math.max(0, Math.ceil(Number(listing.baths) || 0)));
  const listed = listedIndex(listing.roomSizes);
  const ids = ["living", "kitchen", "dining", "utility"];
  if (beds >= 1) ids.push("primary-bedroom");
  for (let i = 1; i < beds; i += 1) ids.push(`bedroom-${i}`);
  if (baths >= 1) ids.push("primary-bathroom");
  if (baths >= 2) ids.push("hall-bathroom");
  for (let i = 3; i <= baths; i += 1) ids.push(`bathroom-${i}`);

  const specs = ids.map((id) => {
    const size = listed.get(id);
    const type = typeFor(id);
    return {
      id,
      label: labelFor(id),
      type,
      row: rowFor(id),
      weight: weightFor(id),
      listed: Boolean(size),
      widthFt: size?.widthFt || 0,
      lengthFt: size?.lengthFt || 0,
      widthM: size ? size.widthFt * FT_TO_M : 0,
      depthM: size ? size.lengthFt * FT_TO_M : 0,
      share: 0,
    };
  });

  const openBeds = specs.filter((spec) => spec.type === "bedroom" && !spec.listed);
  const openBaths = specs.filter((spec) => spec.type === "bathroom" && !spec.listed);
  const bedWeight = openBeds.reduce((sum, spec) => sum + spec.weight, 0) || 1;
  const bathCount = openBaths.length || 1;
  for (const spec of specs) {
    if (spec.listed) continue;
    if (spec.type === "bedroom") spec.share = 0.34 * (spec.weight / bedWeight);
    else if (spec.type === "bathroom") spec.share = 0.12 / bathCount;
    else if (spec.type === "living") spec.share = 0.18;
    else if (spec.type === "kitchen") spec.share = 0.12;
    else if (spec.type === "dining") spec.share = 0.08;
    else if (spec.type === "utility") spec.share = 0.06;
    else spec.share = 0.04;
  }
  return specs;
}

function sizeOf(spec, scale, targetM2) {
  if (spec.listed) {
    return {
      widthM: spec.widthM,
      depthM: spec.depthM,
      estimated: false,
      sizeSource: "listed",
    };
  }
  const minArea = MIN_ROOM_SQFT * FT2_TO_M2;
  const area = Math.max(minArea, spec.share * targetM2 * scale);
  const minWidth = DOOR_WIDTH_M + 0.4;
  let depthM = ROW_DEPTH_M;
  let widthM = area / depthM;
  if (widthM < minWidth) {
    widthM = minWidth;
    depthM = area / widthM;
  }
  return {
    widthM,
    depthM,
    estimated: true,
    sizeSource: "estimated",
  };
}

function place(sized, heightM) {
  const south = sized.filter((room) => room.row === "south");
  const north = sized.filter((room) => room.row === "north");
  let southW = 0;
  for (const room of south) {
    room.x = southW;
    room.z = -room.depthM;
    southW += room.widthM;
  }
  let northW = 0;
  for (const room of north) {
    room.x = northW;
    room.z = HALL_WIDTH_M;
    northW += room.widthM;
  }
  const hallW = Math.max(southW, northW, DOOR_WIDTH_M + 0.4);
  const hall = {
    id: "hall",
    label: "Hall",
    estimated: true,
    sizeSource: "estimated",
    x: 0,
    z: 0,
    w: hallW,
    d: HALL_WIDTH_M,
    widthM: hallW,
    depthM: HALL_WIDTH_M,
    heightM,
  };
  const rooms = [];
  for (const room of [...south, ...north]) {
    let doorW = DOOR_WIDTH_M;
    if (room.widthM < doorW + 0.4) doorW = Math.max(0.55, room.widthM - 0.4);
    rooms.push({
      id: room.id,
      label: room.label,
      type: room.type,
      row: room.row,
      estimated: room.estimated,
      sizeSource: room.sizeSource,
      x: room.x,
      z: room.z,
      w: room.widthM,
      d: room.depthM,
      widthM: room.widthM,
      depthM: room.depthM,
      heightM,
      widthFt: room.sizeSource === "listed" ? room.widthFt : room.widthM / FT_TO_M,
      depthFt: room.sizeSource === "listed" ? room.lengthFt : room.depthM / FT_TO_M,
      doorX: room.x + room.widthM / 2,
      doorZ: room.row === "south" ? 0 : HALL_WIDTH_M,
      doorW,
      doorH: Math.min(DOOR_HEIGHT_M, Math.max(1.6, heightM - 0.3)),
      photoWall: room.row === "south" ? "minZ" : "maxZ",
    });
  }
  const walls = [];
  for (const room of rooms) {
    const x0 = room.x;
    const x1 = room.x + room.w;
    const z0 = room.z;
    const z1 = room.z + room.d;
    if (room.row === "south") {
      walls.push({ axis: "z", z: z0, x0, x1, roomId: room.id, role: "photo" });
      walls.push({ axis: "z", z: z1, x0, x1, doorX: room.doorX, doorW: room.doorW, roomId: room.id, role: "door" });
    } else {
      walls.push({ axis: "z", z: z1, x0, x1, roomId: room.id, role: "photo" });
      walls.push({ axis: "z", z: z0, x0, x1, doorX: room.doorX, doorW: room.doorW, roomId: room.id, role: "door" });
    }
    walls.push({ axis: "x", x: x0, z0, z1, roomId: room.id, role: "side" });
    walls.push({ axis: "x", x: x1, z0, z1, roomId: room.id, role: "side" });
  }
  walls.push({ axis: "x", x: 0, z0: 0, z1: HALL_WIDTH_M, roomId: "hall", role: "end" });
  walls.push({ axis: "x", x: hallW, z0: 0, z1: HALL_WIDTH_M, roomId: "hall", role: "end" });
  if (southW < hallW - 1e-6) {
    walls.push({ axis: "z", z: 0, x0: southW, x1: hallW, roomId: "hall", role: "solid" });
  }
  if (northW < hallW - 1e-6) {
    walls.push({ axis: "z", z: HALL_WIDTH_M, x0: northW, x1: hallW, roomId: "hall", role: "solid" });
  }
  const rects = [
    ...rooms.map((room) => ({ id: room.id, x: room.x, z: room.z, w: room.w, d: room.d })),
    { id: "hall", x: 0, z: 0, w: hallW, d: HALL_WIDTH_M },
  ];
  const roomM2 = rooms.reduce((sum, room) => sum + room.w * room.d, 0);
  const totalM2 = roomM2 + hallW * HALL_WIDTH_M;
  return { rooms, hall, walls, rects, totalM2, totalSqft: totalM2 / FT2_TO_M2 };
}

function measure(specs, scale, targetM2, heightM) {
  const sized = specs.map((spec) => ({ ...spec, ...sizeOf(spec, scale, targetM2) }));
  return place(sized, heightM);
}

export function planListing(listing) {
  const sqft = Number(listing?.sqft);
  if (!Number.isFinite(sqft) || sqft <= 0) {
    throw new Error("A listing square footage is required.");
  }
  const targetM2 = sqft * FT2_TO_M2;
  const heightM = ceilingM(listing);
  const ceilingEstimated = !(Number(listing?.ceilingFt ?? listing?.ceilingHeightFt) > 0);
  const specs = buildSpecs(listing);
  const listedM2 = specs
    .filter((spec) => spec.listed)
    .reduce((sum, spec) => sum + spec.widthM * spec.depthM, 0);

  let scale = 1;
  let fitsListing = listedM2 < targetM2;
  if (!fitsListing) {
    scale = 0;
  } else {
    let lo = 0;
    let hi = 4;
    for (let i = 0; i < 48; i += 1) {
      const mid = (lo + hi) / 2;
      const total = measure(specs, mid, targetM2, heightM).totalM2;
      if (total > targetM2) hi = mid;
      else lo = mid;
    }
    scale = (lo + hi) / 2;
  }

  const built = measure(specs, scale, targetM2, heightM);
  const error = Math.abs(built.totalM2 - targetM2) / targetM2;
  fitsListing = fitsListing && error <= 0.03;
  const living = built.rooms.find((room) => room.id === "living") || built.rooms[0];
  return {
    listingId: String(listing.id || ""),
    sqft,
    heightM,
    ceilingEstimated,
    estimated: built.rooms.some((room) => room.estimated) || built.hall.estimated,
    fitsListing,
    scale,
    totalSqft: built.totalSqft,
    totalM2: built.totalM2,
    rooms: built.rooms,
    hall: built.hall,
    walls: built.walls,
    rects: built.rects,
    start: living
      ? {
          id: living.id,
          x: living.x + living.w / 2,
          y: EYE_HEIGHT_M,
          z: living.z + living.d / 2,
          yaw: 0,
        }
      : { id: "hall", x: built.hall.w / 2, y: EYE_HEIGHT_M, z: built.hall.d / 2, yaw: 0 },
    references: {
      doorWidthM: DOOR_WIDTH_M,
      doorHeightM: DOOR_HEIGHT_M,
      counterHeightM: COUNTER_HEIGHT_M,
      note: "An 80 in door and a 36 in counter are scale references only. This plan did not measure them in a photo.",
    },
  };
}

function segmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = 0;
  if (len2 > 0) t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + abx * t;
  const qz = az + abz * t;
  return Math.hypot(px - qx, pz - qz);
}

function segmentsFor(wall) {
  if (wall.axis === "z") {
    const z = wall.z;
    if (wall.doorW > 0 && Number.isFinite(wall.doorX)) {
      const gap0 = wall.doorX - wall.doorW / 2;
      const gap1 = wall.doorX + wall.doorW / 2;
      const segs = [];
      if (gap0 > wall.x0) segs.push([wall.x0, z, gap0, z]);
      if (gap1 < wall.x1) segs.push([gap1, z, wall.x1, z]);
      return segs;
    }
    return [[wall.x0, z, wall.x1, z]];
  }
  return [[wall.x, wall.z0, wall.x, wall.z1]];
}

export function pointHitsWall(x, z, walls, radius) {
  for (const wall of walls) {
    for (const [ax, az, bx, bz] of segmentsFor(wall)) {
      if (segmentDistance(x, z, ax, az, bx, bz) < radius) return true;
    }
  }
  return false;
}

export function moveBlocked(x0, z0, x1, z1, walls, radius) {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.02, radius * 0.25)));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (pointHitsWall(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, walls, radius)) return true;
  }
  return false;
}

export function insidePlan(x, z, rects) {
  return rects.some((rect) => x >= rect.x - 1e-6
    && x <= rect.x + rect.w + 1e-6
    && z >= rect.z - 1e-6
    && z <= rect.z + rect.d + 1e-6);
}
