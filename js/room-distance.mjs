// Horizontal edge-to-edge distance between rotated rectangular planning footprints.
export function footprintCorners({ x, z, width, depth, rotation = 0 }) {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const u = a * width / 2, v = b * depth / 2;
    return { x: x + u * c + v * s, z: z - u * s + v * c };
  });
}

export function footprintDistance(a, b) {
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
  if (!separated) return 0;
  let closest = Infinity;
  for (const [points, edges] of [[p, q], [q, p]]) {
    for (const point of points) for (let i = 0; i < 4; i++) {
      const u = edges[i], v = edges[(i + 1) % 4];
      const dx = v.x - u.x, dz = v.z - u.z;
      const t = Math.max(0, Math.min(1, ((point.x - u.x) * dx + (point.z - u.z) * dz) / (dx * dx + dz * dz)));
      closest = Math.min(closest, Math.hypot(point.x - u.x - t * dx, point.z - u.z - t * dz));
    }
  }
  return closest;
}

export function feetAndInches(meters) {
  const inches = Math.round(meters / 0.0254);
  return `${Math.floor(inches / 12)} ft ${inches % 12} in`;
}
