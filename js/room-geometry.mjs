const MIN_EDGE = 0.35;

export function rectanglePolygon(width, depth) {
  const hw = width / 2;
  const hd = depth / 2;
  return [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }];
}

export function normalizeFloorPolygon(points, width, depth) {
  if (!Array.isArray(points) || points.length < 4 || points.length > 8) return rectanglePolygon(width, depth);
  const clean = points.map((point) => ({ x: Number(point?.x), z: Number(point?.z) }));
  if (clean.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))) return rectanglePolygon(width, depth);
  const bounded = clean.every((point) => Math.abs(point.x) <= width / 2 + 0.1 && Math.abs(point.z) <= depth / 2 + 0.1);
  if (!bounded) return rectanglePolygon(width, depth);
  const edgesValid = clean.every((point, index) => {
    const next = clean[(index + 1) % clean.length];
    return Math.hypot(next.x - point.x, next.z - point.z) >= MIN_EDGE;
  });
  if (!edgesValid || polygonSelfIntersects(clean) || Math.abs(polygonArea(clean)) < 2 || !pointInPolygon({ x: 0, z: 0 }, clean)) return rectanglePolygon(width, depth);
  return clean;
}

function polygonSelfIntersects(points) {
  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const intersects = (a, b, c, d) => {
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    return abC * abD < 0 && cdA * cdB < 0;
  };
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j += 1) {
      if (j === i || j === (i + 1) % points.length || (j + 1) % points.length === i) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) return true;
    }
  }
  return false;
}

export function polygonArea(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function boxInsidePolygon(box, polygon) {
  return [
    { x: box.min.x, z: box.min.z }, { x: box.max.x, z: box.min.z },
    { x: box.max.x, z: box.max.z }, { x: box.min.x, z: box.max.z },
  ].every((point) => pointInPolygon(point, polygon));
}
