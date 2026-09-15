import { normalizeFloorPolygon, rectanglePolygon } from "./room-geometry.mjs";

const MAX_SCAN_BYTES = 2_000_000;

function dimensions(surface) {
  const raw = surface?.dimensions;
  if (Array.isArray(raw)) return { width: Number(raw[0]), height: Number(raw[1]) };
  return { width: Number(raw?.x ?? raw?.width), height: Number(raw?.y ?? raw?.height) };
}

function matrixValues(transform) {
  const raw = transform?.matrix ?? transform;
  if (Array.isArray(raw) && raw.length === 16) return raw.map(Number);
  if (Array.isArray(raw) && raw.length === 4 && raw.every(Array.isArray)) return raw.flat().map(Number);
  return null;
}

function wallSegment(surface) {
  const matrix = matrixValues(surface?.transform);
  const size = dimensions(surface);
  if (!matrix || !Number.isFinite(size.width) || size.width < 0.35 || size.width > 30) return null;
  const center = { x: matrix[12], z: matrix[14] };
  let direction = { x: matrix[0], z: matrix[2] };
  const length = Math.hypot(direction.x, direction.z);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.z) || length < 0.1) return null;
  direction = { x: direction.x / length, z: direction.z / length };
  return {
    start: { x: center.x - direction.x * size.width / 2, z: center.z - direction.z * size.width / 2 },
    end: { x: center.x + direction.x * size.width / 2, z: center.z + direction.z * size.width / 2 },
    height: size.height,
  };
}

function convexHull(points) {
  const unique = [...new Map(points.map((point) => [`${point.x.toFixed(3)}:${point.z.toFixed(3)}`, point])).values()]
    .sort((a, b) => a.x - b.x || a.z - b.z);
  if (unique.length < 3) return [];
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const half = (rows) => {
    const hull = [];
    for (const point of rows) {
      while (hull.length >= 2 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull;
  };
  return [...half(unique).slice(0, -1), ...half([...unique].reverse()).slice(0, -1)];
}

export function parseRoomPlan(value, name = "LiDAR room") {
  const root = value?.capturedRoom ?? value?.room ?? value;
  if (!root || typeof root !== "object") throw new Error("This is not a supported RoomPlan JSON file.");
  const explicit = root.floorPolygon ?? root.floor?.polygon;
  const walls = Array.isArray(root.walls) ? root.walls : [];
  const segments = walls.map(wallSegment).filter(Boolean);
  let polygon = Array.isArray(explicit) ? explicit.map((point) => ({ x: Number(point.x ?? point[0]), z: Number(point.z ?? point[1]) })) : [];
  if (polygon.length < 4) polygon = convexHull(segments.flatMap((wall) => [wall.start, wall.end]));
  if (polygon.length < 4) throw new Error("The scan does not contain enough measured walls to build a room.");
  const minX = Math.min(...polygon.map((point) => point.x));
  const maxX = Math.max(...polygon.map((point) => point.x));
  const minZ = Math.min(...polygon.map((point) => point.z));
  const maxZ = Math.max(...polygon.map((point) => point.z));
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  polygon = polygon.map((point) => ({ x: point.x - center.x, z: point.z - center.z }));
  const heightSamples = segments.map((wall) => wall.height).filter((height) => Number.isFinite(height) && height >= 2 && height <= 6);
  const height = heightSamples.length ? heightSamples.reduce((sum, item) => sum + item, 0) / heightSamples.length : 2.72;
  if (width < 2.4 || width > 15 || depth < 2.4 || depth > 15 || height < 2.1 || height > 6) {
    throw new Error("The scan dimensions are outside the supported room limits.");
  }
  const normalized = normalizeFloorPolygon(polygon, width, depth);
  if (normalized.length === 4 && polygon.length > 4 && JSON.stringify(normalized) === JSON.stringify(rectanglePolygon(width, depth))) {
    throw new Error("The measured floor boundary is invalid or self-intersecting.");
  }
  return {
    id: `lidar-${Date.now()}`,
    mode: "lidar",
    estimated: false,
    label: String(root.name || name || "LiDAR room").slice(0, 80),
    roomType: "other",
    width,
    depth,
    height,
    floorPolygon: normalized,
    walls: ["north", "west", "east", "south"].map((id) => ({ id, role: "wall", windows: 0, door: false })),
    floor: { role: "floor", finish: "other" },
    ceiling: { role: "ceiling" },
    objects: [],
    analysis: { sceneKind: "interior", confidence: "high", notes: "Imported locally from measured RoomPlan/LiDAR geometry." },
  };
}

export async function readRoomPlanFile(file) {
  if (!file || file.size > MAX_SCAN_BYTES) throw new Error("Choose a RoomPlan JSON file smaller than 2 MB.");
  let value;
  try { value = JSON.parse(await file.text()); } catch { throw new Error("The selected file is not valid JSON."); }
  return parseRoomPlan(value, file.name.replace(/\.json$/i, ""));
}
