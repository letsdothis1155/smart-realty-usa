// Horizontal edge-to-edge distance between rotated rectangular planning footprints.
export function footprintCorners({ x, z, width, depth, rotation = 0 }) {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const u = a * width / 2, v = b * depth / 2;
    return { x: x + u * c + v * s, z: z - u * s + v * c };
  });
}

export function footprintDistance(a, b) {
  return footprintMeasurement(a, b).distance;
}

export function footprintMeasurement(a, b) {
  const p = footprintCorners(a), q = footprintCorners(b);
  let separated = false;
  for (const polygon of [p, q]) {
    for (let i = 0; i < 4; i++) {
      const u = polygon[i], v = polygon[(i + 1) % 4];
      const axis = { x: -(v.z - u.z), z: v.x - u.x };
      const project = points => points.map(t => t.x * axis.x + t.z * axis.z);
      const ap = project(p), bp = project(q);
      if (Math.max(...ap) < Math.min(...bp) || Math.max(...bp) < Math.min(...ap)) separated = true;
    }
  }
  if (!separated) return { distance: 0, start: null, end: null };
  let closest = Infinity;
  let start = null, end = null;
  for (const [points, edges] of [[p, q], [q, p]]) {
    for (const point of points) for (let i = 0; i < 4; i++) {
      const u = edges[i], v = edges[(i + 1) % 4];
      const dx = v.x - u.x, dz = v.z - u.z;
      const t = Math.max(0, Math.min(1, ((point.x - u.x) * dx + (point.z - u.z) * dz) / (dx * dx + dz * dz)));
      const projected = { x: u.x + t * dx, z: u.z + t * dz };
      const distance = Math.hypot(point.x - projected.x, point.z - projected.z);
      if (distance < closest) {
        closest = distance;
        start = points === p ? point : projected;
        end = points === p ? projected : point;
      }
    }
  }
  return { distance: closest, start, end };
}

export function feetAndInches(meters) {
  const inches = Math.round(meters / 0.0254);
  return `${Math.floor(inches / 12)} ft ${inches % 12} in`;
}
