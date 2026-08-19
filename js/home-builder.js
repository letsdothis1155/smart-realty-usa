/* 3D Home Builder — procedural exterior customizer (no external 3D assets).
   Lead-gen tool: illustrative pricing only, never a real quote. */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm";

const BASE_PRICE = 385000;

const OPTIONS = {
  siding: [
    { id: "hardie-white", brand: "James Hardie", name: "Arctic White", color: "#f2f0e9", delta: 0 },
    { id: "hardie-gray", brand: "James Hardie", name: "Iron Gray", color: "#565b63", delta: 1800 },
    { id: "hardie-blue", brand: "James Hardie", name: "Boothbay Blue", color: "#3f5c6c", delta: 2200 },
    { id: "hardie-red", brand: "James Hardie", name: "Countrylane Red", color: "#7d3232", delta: 2200 },
  ],
  roofing: [
    { id: "gaf-charcoal", brand: "GAF Timberline HDZ", name: "Charcoal", color: "#33363a", delta: 0 },
    { id: "gaf-wood", brand: "GAF Timberline HDZ", name: "Weathered Wood", color: "#6b5a45", delta: 900 },
    { id: "gaf-bark", brand: "GAF Timberline HDZ", name: "Barkwood", color: "#52443a", delta: 900 },
    { id: "gaf-slate", brand: "GAF Timberline HDZ", name: "Slate", color: "#3c4650", delta: 1400 },
  ],
  windows: [
    { id: "andersen-white", brand: "Andersen 400 Series", name: "White frame", color: "#efefe9", delta: 0 },
    { id: "andersen-black", brand: "Andersen 400 Series", name: "Black frame", color: "#1c1c1c", delta: 1600 },
    { id: "andersen-sand", brand: "Andersen 400 Series", name: "Sandtone frame", color: "#cbb896", delta: 1200 },
  ],
  doors: [
    { id: "tt-black", brand: "Therma-Tru Smooth-Star", name: "Black", color: "#17171a", delta: 0 },
    { id: "tt-mahogany", brand: "Therma-Tru Classic-Craft", name: "Mahogany", color: "#5b2e1f", delta: 1100 },
    { id: "tt-red", brand: "Therma-Tru Fiber-Classic", name: "Red", color: "#7a1f1f", delta: 700 },
  ],
  landscaping: [
    { id: "trugreen-manicured", brand: "TruGreen", name: "Manicured lawn", ground: "#4a8f3c", trees: 2, delta: 0 },
    { id: "trugreen-meadow", brand: "TruGreen", name: "Natural meadow", ground: "#6f8a4a", trees: 4, delta: 600 },
    { id: "belgard-pavers", brand: "Belgard", name: "Paver courtyard", ground: "#4a8f3c", trees: 2, delta: 2400, driveway: "#9a9184" },
  ],
};

const LABELS = { siding: "Siding", roofing: "Roofing", windows: "Windows", doors: "Front door", landscaping: "Landscaping" };

function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function buildHouse() {
  const group = new THREE.Group();

  const wallGeo = new THREE.BoxGeometry(8, 3.2, 6);
  const wallMat = new THREE.MeshStandardMaterial({ color: OPTIONS.siding[0].color, roughness: 0.8 });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 1.6;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // Walls are 8 (X, ridge direction) x 6 (Z, front-back). ExtrudeGeometry
  // builds the triangle in local XY then extrudes along local Z; rotateY(90)
  // then swaps them (local Z -> final X, local X -> final Z) — so the
  // triangle half-width below must track wall depth/2, and the extrude
  // length must track wall width, or the roof misaligns with the walls.
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-3.3, 0);
  roofShape.lineTo(0, 2.4);
  roofShape.lineTo(3.3, 0);
  roofShape.lineTo(-3.3, 0);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 8.6, bevelEnabled: false });
  roofGeo.translate(0, 0, -4.3);
  roofGeo.rotateY(Math.PI / 2);
  const roofMat = new THREE.MeshStandardMaterial({ color: OPTIONS.roofing[0].color, roughness: 0.7 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 3.2;
  roof.castShadow = true;
  group.add(roof);

  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.4, 0.5),
    new THREE.MeshStandardMaterial({ color: "#7a746c", roughness: 0.9 })
  );
  chimney.position.set(2.4, 4.9, -0.8);
  chimney.castShadow = true;
  group.add(chimney);

  const doorMat = new THREE.MeshStandardMaterial({ color: OPTIONS.doors[0].color, roughness: 0.5 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.12), doorMat);
  door.position.set(0, 1.05, 3.06);
  group.add(door);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: "#bfe3f0",
    transparent: true,
    opacity: 0.55,
    roughness: 0.1,
    metalness: 0,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: OPTIONS.windows[0].color, roughness: 0.6 });
  const windowMeshes = [];
  const windowSpots = [
    [-2.6, 1.8, 3.06],
    [2.6, 1.8, 3.06],
    [-4.06, 1.8, 1.4],
    [4.06, 1.8, 1.4],
  ];
  windowSpots.forEach(([x, y, z]) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 0.1), frameMat);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.08), glassMat);
    frame.position.set(x, y, z);
    glass.position.set(x, y, z + (z < 0 || z > 3 ? 0 : 0.02));
    if (Math.abs(x) > 3.9) {
      frame.rotation.y = Math.PI / 2;
      glass.rotation.y = Math.PI / 2;
    }
    group.add(frame, glass);
    windowMeshes.push(frame);
  });

  const groundMat = new THREE.MeshStandardMaterial({ color: OPTIONS.landscaping[0].ground, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const drivewayMat = new THREE.MeshStandardMaterial({ color: "#7d7a74", roughness: 1 });
  const driveway = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 8), drivewayMat);
  driveway.rotation.x = -Math.PI / 2;
  driveway.position.set(0, 0.01, 8);
  driveway.receiveShadow = true;
  group.add(driveway);

  const treeGroup = new THREE.Group();
  group.add(treeGroup);

  function rebuildTrees(count) {
    while (treeGroup.children.length) treeGroup.remove(treeGroup.children[0]);
    const spots = [
      [-6.5, 0, 2],
      [6.5, 0, 2.5],
      [-7, 0, -3],
      [7, 0, -2.5],
    ];
    for (let i = 0; i < Math.min(count, spots.length); i++) {
      const [x, , z] = spots[i];
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: "#5a4433", roughness: 1 })
      );
      trunk.position.set(x, 0.6, z);
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(0.9, 1.8, 8),
        new THREE.MeshStandardMaterial({ color: "#2f6b3a", roughness: 0.9 })
      );
      leaves.position.set(x, 1.9, z);
      leaves.castShadow = true;
      treeGroup.add(trunk, leaves);
    }
  }
  rebuildTrees(OPTIONS.landscaping[0].trees);

  return { group, walls, roof, door, windowMeshes, ground, driveway, rebuildTrees };
}

export function initHomeBuilder(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#8fb7d9");
  scene.fog = new THREE.Fog("#8fb7d9", 20, 55);

  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 200);
  camera.position.set(11, 6, 12);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const hemi = new THREE.HemisphereLight("#cfe6f5", "#4a8f3c", 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff4dd", 1.1);
  sun.position.set(10, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  scene.add(sun);

  const house = buildHouse();
  scene.add(house.group);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.target.set(0, 1.6, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.addEventListener("start", () => (controls.autoRotate = false));

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener("resize", resize);
  resize();

  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  const selected = {
    siding: OPTIONS.siding[0].id,
    roofing: OPTIONS.roofing[0].id,
    windows: OPTIONS.windows[0].id,
    doors: OPTIONS.doors[0].id,
    landscaping: OPTIONS.landscaping[0].id,
  };

  function findOption(category, id) {
    return OPTIONS[category].find((o) => o.id === id) || OPTIONS[category][0];
  }

  function applySelection(category, id) {
    selected[category] = id;
    const opt = findOption(category, id);
    if (category === "siding") house.walls.material.color.set(opt.color);
    if (category === "roofing") house.roof.material.color.set(opt.color);
    if (category === "doors") house.door.material.color.set(opt.color);
    if (category === "windows") house.windowMeshes.forEach((m) => m.material.color.set(opt.color));
    if (category === "landscaping") {
      house.ground.material.color.set(opt.ground);
      house.driveway.material.color.set(opt.driveway || "#7d7a74");
      house.rebuildTrees(opt.trees);
    }
  }

  function estimate() {
    let total = BASE_PRICE;
    for (const category of Object.keys(selected)) {
      total += findOption(category, selected[category]).delta;
    }
    return total;
  }

  function summary() {
    const lines = Object.keys(LABELS).map((category) => {
      const opt = findOption(category, selected[category]);
      return `${LABELS[category]}: ${opt.brand} ${opt.name}`;
    });
    lines.push(`Estimated build price: ${money(estimate())} (illustrative only, not a quote)`);
    return lines.join("\n");
  }

  function screenshot() {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  }

  return { OPTIONS, LABELS, selected, applySelection, estimate, summary, screenshot, money };
}
