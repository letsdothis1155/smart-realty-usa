/**
 * Procedural low-poly furniture. Sized to product inches.
 * Real GLBs plug in later via product.glbUrl when modelSource !== "proxy".
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";

const IN = 0.0254;
const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  sphere: new THREE.SphereGeometry(0.5, 12, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  plane: new THREE.PlaneGeometry(1, 1),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0.04,
    emissive: opts.emissive || "#000000",
    emissiveIntensity: opts.emissiveIntensity || 0,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side || THREE.FrontSide,
  });
}

function add(parent, geometry, material, x, y, z, sx, sy, sz, rotY = 0, rotX = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rotX, rotY, 0);
  m.castShadow = optsCast(sy);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function optsCast(sy) {
  return sy > 0.02;
}

function palette(product) {
  const swatch = product.swatch || "#8a7a68";
  return {
    fabric: swatch,
    wood: product.wood || "#6b4a32",
    dark: "#1c1c1e",
    metal: "#9aa0a8",
    brass: "#c9a56a",
    plant: "#2f6b3a",
    pot: "#8a5a44",
    cream: "#efe7d8",
    marble: "#e8e4dc",
  };
}

function footprint(group, w, d, h) {
  group.userData.footprint = { w, d, h };
  group.userData.proxy = false;
  return group;
}

function sofa(w, h, d, product) {
  const g = new THREE.Group();
  const p = palette(product);
  const fabric = mat(p.fabric, { roughness: 0.9 });
  const wood = mat(p.wood, { roughness: 0.55 });
  const seatH = h * 0.42;
  const armW = Math.min(0.18, w * 0.08);
  const backT = Math.min(0.2, d * 0.22);
  add(g, geo.box, wood, 0, 0.08, 0, w * 0.92, 0.08, d * 0.78);
  add(g, geo.box, fabric, 0, seatH * 0.55, 0.04, w - armW * 2.1, seatH * 0.7, d - backT - 0.08);
  add(g, geo.box, fabric, 0, h * 0.62, -d / 2 + backT / 2, w - armW * 0.4, h * 0.55, backT);
  add(g, geo.box, fabric, -w / 2 + armW / 2, h * 0.42, 0.02, armW, h * 0.55, d * 0.9);
  add(g, geo.box, fabric, w / 2 - armW / 2, h * 0.42, 0.02, armW, h * 0.55, d * 0.9);
  const cushions = 3;
  const cw = (w - armW * 2.2) / cushions - 0.02;
  for (let i = 0; i < cushions; i++) {
    const x = -w / 2 + armW + 0.08 + cw / 2 + i * (cw + 0.03);
    add(g, geo.box, mat(p.fabric, { roughness: 0.86 }), x, seatH + 0.04, 0.06, cw, 0.1, d * 0.55);
  }
  [[-w / 2 + 0.12, d / 2 - 0.12], [w / 2 - 0.12, d / 2 - 0.12], [-w / 2 + 0.12, -d / 2 + 0.12], [w / 2 - 0.12, -d / 2 + 0.12]].forEach(([x, z]) => {
    add(g, geo.cyl8, wood, x, 0.05, z, 0.05, 0.1, 0.05);
  });
  return footprint(g, w, d, h);
}

function sectional(w, h, d, product) {
  const g = new THREE.Group();
  const main = sofa(w * 0.62, h, d * 0.55, product);
  main.position.set(-w * 0.12, 0, d * 0.18);
  g.add(main);
  const chaise = sofa(w * 0.38, h, d, { ...product, swatch: product.swatch });
  chaise.position.set(w * 0.28, 0, -d * 0.02);
  chaise.rotation.y = 0;
  g.add(chaise);
  return footprint(g, w, d, h);
}

function chair(w, h, d, product) {
  const g = new THREE.Group();
  const p = palette(product);
  const fabric = mat(p.fabric, { roughness: 0.88 });
  const wood = mat(p.wood, { roughness: 0.5 });
  add(g, geo.box, fabric, 0, h * 0.38, 0.04, w * 0.78, h * 0.12, d * 0.7);
  add(g, geo.box, fabric, 0, h * 0.68, -d * 0.28, w * 0.78, h * 0.5, 0.1);
  add(g, geo.box, fabric, -w * 0.4, h * 0.48, 0.02, 0.08, h * 0.28, d * 0.62);
  add(g, geo.box, fabric, w * 0.4, h * 0.48, 0.02, 0.08, h * 0.28, d * 0.62);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    add(g, geo.cyl8, wood, sx * w * 0.32, h * 0.16, sz * d * 0.28, 0.045, h * 0.32, 0.045);
  });
  return footprint(g, w, d, h);
}

function lounge(w, h, d, product) {
  const g = chair(w, h, d, product);
  const p = palette(product);
  add(g, geo.box, mat(p.fabric), 0, h * 0.28, d * 0.22, w * 0.7, 0.08, d * 0.28);
  return footprint(g, w, d, h);
}

function coffeeTable(w, h, d, product) {
  const g = new THREE.Group();
  const p = palette(product);
  const top = product.accent === "marble" ? mat(p.marble, { roughness: 0.25, metalness: 0.08 }) : mat(p.wood, { roughness: 0.45 });
  const wood = mat(p.wood, { roughness: 0.5 });
  add(g, geo.box, top, 0, h - 0.02, 0, w, 0.04, d);
  add(g, geo.box, wood, 0, h * 0.45, 0, w * 0.72, 0.03, d * 0.55);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    add(g, geo.box, wood, sx * (w / 2 - 0.06), h * 0.42, sz * (d / 2 - 0.06), 0.05, h * 0.82, 0.05);
  });
  return footprint(g, w, d, h);
}

function sideTable(w, h, d, product) {
  const g = new THREE.Group();
  const p = palette(product);
  const wood = mat(p.wood, { roughness: 0.48 });
  add(g, geo.cyl, wood, 0, h - 0.02, 0, w, 0.04, d);
  add(g, geo.cyl8, wood, 0, h * 0.45, 0, 0.05, h * 0.85, 0.05);
  add(g, geo.cyl, wood, 0, 0.03, 0, w * 0.45, 0.04, d * 0.45);
  return footprint(g, w, d, h);
}

function tv(w, h, d, product) {
  const g = new THREE.Group();
  const bezel = mat("#111113", { roughness: 0.35, metalness: 0.4 });
  const screen = mat("#0a1628", { roughness: 0.2, metalness: 0.1, emissive: "#1a3a68", emissiveIntensity: 0.25 });
  const stand = mat("#2a2a2c", { roughness: 0.4, metalness: 0.5 });
  add(g, geo.box, bezel, 0, h / 2, 0, w, h, Math.max(d, 0.04));
  add(g, geo.box, screen, 0, h / 2, d / 2 + 0.005, w * 0.94, h * 0.9, 0.01);
  add(g, geo.box, stand, 0, 0.02, 0.02, w * 0.28, 0.03, d + 0.08);
  return footprint(g, w, Math.max(d, 0.12), h);
}

function tvStand(w, h, d, product) {
  const g = new THREE.Group();
  const p = palette(product);
  const wood = mat(p.fabric || p.wood, { roughness: 0.5 });
  const dark = mat("#1c1c1e", { roughness: 0.4 });
  add(g, geo.box, wood, 0, h / 2, 0, w, h, d);
  add(g, geo.box, wood, 0, h + 0.01, 0, w + 0.04, 0.03, d + 0.02);
  add(g, geo.box, dark, -w * 0.22, h * 0.48, d / 2 + 0.005, w * 0.38, h * 0.55, 0.02);
  add(g, geo.box, dark, w * 0.22, h * 0.48, d / 2 + 0.005, w * 0.38, h * 0.55, 0.02);
  return footprint(g, w, d, h);
}

function rug(w, h, d, product) {
  const g = new THREE.Group();
  const p = palette(product);
  const tex = rugTexture(p.fabric);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo.box, m);
  mesh.position.set(0, 0.008, 0);
  mesh.scale.set(w, 0.012, d);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  g.add(mesh);
  return footprint(g, w, d, 0.02);
}

function rugTexture(hex) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, 220, 220);
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, 200, 200);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(40 + i * 22, 40, 18, 176);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function floorLamp(w, h, d, product) {
  const g = new THREE.Group();
  const p = palette(product);
  const brass = mat(p.brass, { roughness: 0.3, metalness: 0.75 });
  const shade = mat(p.cream, { roughness: 0.7, emissive: "#fff2d0", emissiveIntensity: 0.18 });
  add(g, geo.cyl, brass, 0, 0.03, 0, w * 0.7, 0.04, d * 0.7);
  add(g, geo.cyl8, brass, 0, h * 0.45, 0, 0.03, h * 0.9, 0.03);
  add(g, geo.cyl, shade, 0, h * 0.88, 0, w * 0.85, h * 0.22, d * 0.85);
  const light = new THREE.PointLight("#fff1d0", 0.55, 4.5, 2);
  light.position.set(0, h * 0.8, 0);
  g.add(light);
  return footprint(g, w, d, h);
}

function tableLamp(w, h, d, product) {
  const g = new THREE.Group();
  const p = palette(product);
  const ceramic = mat(p.cream, { roughness: 0.45 });
  const shade = mat("#f3ecdc", { roughness: 0.8, emissive: "#fff4d8", emissiveIntensity: 0.2 });
  add(g, geo.cyl, ceramic, 0, h * 0.28, 0, w * 0.45, h * 0.5, d * 0.45);
  add(g, geo.cyl, shade, 0, h * 0.78, 0, w, h * 0.35, d);
  const light = new THREE.PointLight("#fff4dc", 0.4, 3.2, 2);
  light.position.set(0, h * 0.7, 0);
  g.add(light);
  return footprint(g, w, d, h);
}

function speaker(w, h, d, product) {
  const g = new THREE.Group();
  const body = mat("#1c1c1e", { roughness: 0.55, metalness: 0.15 });
  const driver = mat("#333", { roughness: 0.4, metalness: 0.3 });
  add(g, geo.box, body, 0, h / 2, 0, w, h, d);
  add(g, geo.cyl, driver, 0, h * 0.68, d / 2 + 0.005, w * 0.55, 0.03, w * 0.55, 0, Math.PI / 2);
  add(g, geo.cyl, driver, 0, h * 0.32, d / 2 + 0.005, w * 0.7, 0.03, w * 0.7, 0, Math.PI / 2);
  return footprint(g, w, d, h);
}

function soundbar(w, h, d, product) {
  const g = new THREE.Group();
  add(g, geo.box, mat("#1a1a1c", { metalness: 0.4, roughness: 0.35 }), 0, h / 2, 0, w, h, d);
  return footprint(g, w, d, h);
}

function plantFig(w, h, d, product) {
  const g = new THREE.Group();
  const pot = mat("#8a5a44", { roughness: 0.7 });
  const dirt = mat("#3a2a20", { roughness: 1 });
  const leaf = mat("#2d6b38", { roughness: 0.7 });
  const trunk = mat("#5a3a28", { roughness: 0.8 });
  add(g, geo.cyl, pot, 0, h * 0.1, 0, w * 0.45, h * 0.2, d * 0.45);
  add(g, geo.cyl, dirt, 0, h * 0.2, 0, w * 0.38, 0.02, d * 0.38);
  add(g, geo.cyl8, trunk, 0, h * 0.4, 0, 0.04, h * 0.45, 0.04);
  const spots = [
    [0.12, 0.72, 0.05],
    [-0.14, 0.78, -0.06],
    [0.02, 0.88, 0.1],
    [-0.08, 0.64, 0.12],
    [0.16, 0.58, -0.08],
    [-0.18, 0.9, 0.02],
    [0.05, 0.95, -0.12],
  ];
  spots.forEach(([x, y, z], i) => {
    add(g, geo.ico, leaf, x * w, y * h, z * d, w * (0.35 + (i % 3) * 0.08), h * 0.18, d * (0.28 + (i % 2) * 0.08));
  });
  return footprint(g, w, d, h);
}

function plantOlive(w, h, d, product) {
  const g = plantFig(w, h, d, product);
  g.traverse((ch) => {
    if (ch.material && ch.material.color && ch.geometry === geo.ico) {
      ch.material = mat("#6b8f3a", { roughness: 0.75 });
    }
  });
  return footprint(g, w, d, h);
}

function plantSnake(w, h, d, product) {
  const g = new THREE.Group();
  const pot = mat("#cfc6b8", { roughness: 0.6 });
  const leaf = mat("#3d7a48", { roughness: 0.65 });
  add(g, geo.cyl, pot, 0, h * 0.12, 0, w * 0.7, h * 0.24, d * 0.7);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(g, geo.box, leaf, Math.cos(a) * w * 0.15, h * 0.55, Math.sin(a) * d * 0.15, 0.03, h * 0.75, 0.08);
  }
  return footprint(g, w, d, h);
}

function art(w, h, d, product) {
  const g = new THREE.Group();
  const frame = mat(product.swatch || "#7a5a44", { roughness: 0.5 });
  const canvas = artTexture(product);
  add(g, geo.box, frame, 0, 0, 0, w, h, Math.max(d, 0.03));
  const pic = new THREE.Mesh(geo.plane, new THREE.MeshStandardMaterial({ map: canvas, roughness: 0.85 }));
  pic.position.set(0, 0, d / 2 + 0.008);
  pic.scale.set(w * 0.88, h * 0.86, 1);
  g.add(pic);
  return footprint(g, w, Math.max(d, 0.04), h);
}

function artSet(w, h, d, product) {
  const g = new THREE.Group();
  const sizes = [
    [-0.28, 0.08, 0.38, 0.7],
    [0.22, 0.12, 0.42, 0.55],
    [0.02, -0.22, 0.3, 0.4],
  ];
  sizes.forEach(([x, y, sw, sh], i) => {
    const piece = art(w * sw, h * sh, d, { ...product, swatch: i ? "#d8cfc0" : product.swatch });
    piece.position.set(x * w, y * h, 0);
    g.add(piece);
  });
  return footprint(g, w, d, h);
}

function artTexture(product) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 192;
  const ctx = c.getContext("2d");
  const hue = product.group === "art" && /land/i.test(product.name || "") ? 200 : 28;
  ctx.fillStyle = `hsl(${hue}, 28%, 38%)`;
  ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = `hsl(${hue + 20}, 35%, 52%)`;
  ctx.beginPath();
  ctx.moveTo(0, 120);
  ctx.bezierCurveTo(80, 60, 160, 150, 256, 80);
  ctx.lineTo(256, 192);
  ctx.lineTo(0, 192);
  ctx.fill();
  ctx.fillStyle = `hsla(${hue + 40}, 50%, 70%, 0.7)`;
  ctx.beginPath();
  ctx.arc(180, 50, 28, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bookshelf(w, h, d, product) {
  const g = new THREE.Group();
  const p = palette(product);
  const wood = mat(p.wood, { roughness: 0.55 });
  add(g, geo.box, wood, 0, h / 2, 0, w, h, d);
  const inner = mat("#3a2a20", { roughness: 0.8 });
  add(g, geo.box, inner, 0, h / 2, d * 0.15, w * 0.88, h * 0.92, d * 0.7);
  for (let i = 1; i < 5; i++) {
    add(g, geo.box, wood, 0, (h * i) / 5, 0, w * 0.9, 0.03, d);
  }
  const colors = ["#8a3a32", "#d8cfc0", "#3d5a78", "#6b8f3a", "#c9a56a"];
  for (let shelf = 0; shelf < 4; shelf++) {
    for (let b = 0; b < 4; b++) {
      const bw = w * 0.12;
      add(g, geo.box, mat(colors[(shelf + b) % colors.length]), -w * 0.32 + b * w * 0.2, (h * (shelf + 0.55)) / 5, 0, bw, h * 0.12, d * 0.55);
    }
  }
  return footprint(g, w, d, h);
}

function floatShelf(w, h, d, product) {
  const g = new THREE.Group();
  const wood = mat(palette(product).wood, { roughness: 0.5 });
  add(g, geo.box, wood, 0, h * 0.15, 0, w, 0.04, d);
  add(g, geo.box, wood, 0, h * 0.55, 0, w, 0.04, d);
  add(g, geo.box, wood, 0, h * 0.95, 0, w, 0.04, d);
  return footprint(g, w, d, h);
}

function mirrorRound(w, h, d, product) {
  const g = new THREE.Group();
  const brass = mat(palette(product).brass, { metalness: 0.7, roughness: 0.3 });
  const glass = mat("#c5d0dc", { metalness: 0.85, roughness: 0.08, emissive: "#a8c0d8", emissiveIntensity: 0.08 });
  add(g, geo.cyl, brass, 0, 0, 0, w, Math.max(d, 0.03), h, 0, Math.PI / 2);
  add(g, geo.cyl, glass, 0, 0, d / 2 + 0.005, w * 0.86, 0.01, h * 0.86, 0, Math.PI / 2);
  return footprint(g, w, Math.max(d, 0.04), h);
}

function mirrorLeaner(w, h, d, product) {
  const g = new THREE.Group();
  const frame = mat("#d8d4cc", { roughness: 0.4 });
  const glass = mat("#c5d0dc", { metalness: 0.8, roughness: 0.1 });
  add(g, geo.box, frame, 0, h / 2, 0, w, h, d);
  add(g, geo.box, glass, 0, h / 2, d / 2 + 0.005, w * 0.82, h * 0.9, 0.01);
  g.rotation.x = -0.08;
  return footprint(g, w, d + 0.08, h);
}

function gamingChair(w, h, d, product) {
  const g = new THREE.Group();
  const body = mat("#1a1a1c", { roughness: 0.6 });
  const accent = mat(product.accent || "#c0392b", { roughness: 0.5 });
  add(g, geo.box, body, 0, h * 0.42, 0.04, w * 0.7, 0.12, d * 0.65);
  add(g, geo.box, body, 0, h * 0.7, -d * 0.22, w * 0.7, h * 0.45, 0.1);
  add(g, geo.box, accent, 0, h * 0.55, -d * 0.16, w * 0.12, h * 0.5, 0.04);
  add(g, geo.cyl8, mat("#333", { metalness: 0.6 }), 0, h * 0.22, 0, 0.08, h * 0.28, 0.08);
  add(g, geo.cyl, mat("#222", { metalness: 0.5 }), 0, 0.04, 0, w * 0.7, 0.05, d * 0.7);
  return footprint(g, w, d, h);
}

function desk(w, h, d, product) {
  const g = new THREE.Group();
  const dark = mat("#1c1c20", { roughness: 0.4, metalness: 0.2 });
  add(g, geo.box, dark, 0, h - 0.02, 0, w, 0.05, d);
  add(g, geo.box, dark, -w / 2 + 0.04, h * 0.45, 0, 0.06, h * 0.9, d * 0.9);
  add(g, geo.box, dark, w / 2 - 0.04, h * 0.45, 0, 0.06, h * 0.9, d * 0.9);
  return footprint(g, w, d, h);
}

function monitor(w, h, d, product) {
  const g = new THREE.Group();
  const bezel = mat("#111", { metalness: 0.4, roughness: 0.3 });
  const screen = mat("#081018", { emissive: "#123050", emissiveIntensity: 0.35 });
  add(g, geo.box, bezel, 0, h * 0.55, 0, w, h * 0.7, 0.04);
  add(g, geo.box, screen, 0, h * 0.55, 0.025, w * 0.92, h * 0.6, 0.01);
  add(g, geo.box, bezel, 0, h * 0.18, 0, 0.08, h * 0.3, 0.08);
  add(g, geo.box, bezel, 0, 0.02, 0.04, w * 0.35, 0.03, d);
  return footprint(g, w, d, h);
}

function boxFallback(w, h, d, product) {
  const g = new THREE.Group();
  add(g, geo.box, mat(product.swatch || "#9a9284"), 0, h / 2, 0, w, h, d);
  return footprint(g, w, d, h);
}

const BUILDERS = {
  sofa,
  sectional,
  chair,
  lounge,
  "coffee-table": coffeeTable,
  "side-table": sideTable,
  tv,
  "tv-stand": tvStand,
  rug,
  "floor-lamp": floorLamp,
  "table-lamp": tableLamp,
  speaker,
  soundbar,
  "plant-fig": plantFig,
  "plant-olive": plantOlive,
  "plant-snake": plantSnake,
  art,
  "art-set": artSet,
  bookshelf,
  "float-shelf": floatShelf,
  "mirror-round": mirrorRound,
  "mirror-leaner": mirrorLeaner,
  "gaming-chair": gamingChair,
  desk,
  monitor,
  box: boxFallback,
};

export function buildFurnitureMesh(product) {
  const w = Math.max(Number(product.widthIn) || 12, 2) * IN;
  const h = Math.max(Number(product.heightIn) || 8, 0.4) * IN;
  const d = Math.max(Number(product.depthIn) || 12, 2) * IN;
  const style = product.meshStyle || "box";
  const builder = BUILDERS[style] || boxFallback;
  const group = builder(w, h, d, product);
  group.userData.productMeta = { w, h, d, style };
  return group;
}

export function makeGhost(mesh) {
  const ghost = mesh.clone(true);
  ghost.traverse((ch) => {
    if (ch.isLight) {
      ch.visible = false;
      return;
    }
    if (!ch.isMesh || !ch.material) return;
    ch.castShadow = false;
    const src = Array.isArray(ch.material) ? ch.material[0] : ch.material;
    const c = src.clone();
    c.transparent = true;
    c.opacity = 0.45;
    c.depthWrite = false;
    ch.material = c;
  });
  return ghost;
}

export function tintPlacement(root, valid) {
  const color = valid ? "#3ecf8e" : "#ff6b7a";
  root.traverse((ch) => {
    if (ch.isMesh && ch.material) {
      const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
      mats.forEach((m) => {
        if (m.emissive) m.emissive.set(color);
        if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.55;
        if (m.opacity !== undefined) m.opacity = 0.5;
        m.transparent = true;
      });
    }
  });
}
