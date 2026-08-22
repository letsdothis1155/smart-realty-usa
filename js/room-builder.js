/* Interactive 3D living room — WebGL, not a static render.
   Listing-3d keeps using initRoomBuilder(); the Sims HUD uses the extra methods. */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm";
import { buildFurnitureMesh, tintPlacement } from "/js/room-furniture.js";
import { DEFAULT_LAYOUT, findProduct, normalizeProduct } from "/js/room-catalog.js";
import { DEFAULT_LIVING_ROOM } from "/js/room-pipeline.js";

const IN_TO_M = 0.0254;
const gltfLoader = new GLTFLoader();
const modelCache = new Map();
const SNAP = 0.05;
const WALL_SNAP = 0.22;
const ROT_SNAP = Math.PI / 12;

function loadGltf(url) {
  if (!url) return Promise.resolve(null);
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve) => {
        gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
      })
    );
  }
  return modelCache.get(url).then((scene) => (scene ? scene.clone(true) : null));
}

function woodTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#b0895a";
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 42) {
    ctx.fillStyle = y % 84 === 0 ? "#a07748" : "#c49a68";
    ctx.fillRect(0, y, 512, 40);
    ctx.strokeStyle = "rgba(70,40,20,0.28)";
    ctx.beginPath();
    ctx.moveTo(0, y + 40);
    ctx.lineTo(512, y + 40);
    ctx.stroke();
    for (let x = (y % 84) * 20; x < 512; x += 180) {
      ctx.strokeStyle = "rgba(80,45,20,0.15)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 40, y + 40);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 5);
  t.anisotropy = 8;
  return t;
}

function wallTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#efece6";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 2);
  return t;
}

let instanceCounter = 0;
function nextInstanceId(product) {
  instanceCounter += 1;
  return `${product.id || product.sku || "item"}__${instanceCounter}`;
}

function aabbXZ(mesh) {
  mesh.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(mesh);
  return box;
}

function boxesOverlap(a, b, pad = 0.02) {
  return a.min.x < b.max.x - pad && a.max.x > b.min.x + pad && a.min.z < b.max.z - pad && a.max.z > b.min.z + pad && a.min.y < b.max.y - pad && a.max.y > b.min.y + pad;
}

export function initRoomBuilder(canvas, options = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c5d4de");
  scene.fog = new THREE.Fog("#c5d4de", 16, 36);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 80);
  camera.position.set(3.4, 3.55, 7.35);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const hemi = new THREE.HemisphereLight("#fff7ea", "#6a6458", 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff3d4", 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 28;
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight("#b8c8e0", 0.25);
  fill.position.set(-4, 3, 2);
  scene.add(fill);

  const roomRoot = new THREE.Group();
  const shellGroup = new THREE.Group();
  const itemsGroup = new THREE.Group();
  roomRoot.add(shellGroup);
  roomRoot.add(itemsGroup);
  scene.add(roomRoot);

  let onSelectChange = () => {};
  let onModeChange = () => {};
  let onTimeChange = () => {};
  let onBusy = () => {};
  let onChange = () => {};

  let roomWidth = Number(options.width) || DEFAULT_LIVING_ROOM.width;
  let roomDepth = Number(options.depth) || DEFAULT_LIVING_ROOM.depth;
  let roomHeight = Number(options.height) || DEFAULT_LIVING_ROOM.height;
  let photoUrl = options.photoUrl || "";
  let hour = 14;
  let mode = "orbit";
  let cutaway = true;

  const floorTex = woodTexture();
  const wallTex = wallTexture();
  const windowLights = [];
  const cutawayMeshes = [];
  let southWall = null;
  let ceilingMesh = null;

  function rebuildShell(opts = {}) {
    roomWidth = Number(opts.width) || roomWidth;
    roomDepth = Number(opts.depth) || roomDepth;
    roomHeight = Number(opts.height) || roomHeight;
    if (opts.photoUrl !== undefined) photoUrl = opts.photoUrl || "";
    while (shellGroup.children.length) shellGroup.remove(shellGroup.children[0]);
    windowLights.length = 0;
    cutawayMeshes.length = 0;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth, roomDepth),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.72, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData.role = "floor";
    shellGroup.add(floor);

    const wallMat = () =>
      new THREE.MeshStandardMaterial({
        map: wallTex,
        color: "#f3f0ea",
        roughness: 0.92,
        metalness: 0,
      });

    function wall(w, h, x, y, z, rotY) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat());
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      m.receiveShadow = true;
      m.userData.role = "wall";
      shellGroup.add(m);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.08, 0.04),
        new THREE.MeshStandardMaterial({ color: "#efe8dc", roughness: 0.6 })
      );
      base.position.set(x, 0.04, z);
      base.rotation.y = rotY;
      base.translateZ(0.02);
      shellGroup.add(base);
      return m;
    }

    wall(roomWidth, roomHeight, 0, roomHeight / 2, -roomDepth / 2, 0);
    wall(roomDepth, roomHeight, -roomWidth / 2, roomHeight / 2, 0, Math.PI / 2);
    wall(roomDepth, roomHeight, roomWidth / 2, roomHeight / 2, 0, -Math.PI / 2);
    southWall = wall(roomWidth, roomHeight, 0, roomHeight / 2, roomDepth / 2, Math.PI);
    cutawayMeshes.push(southWall);

    function addWindow(x, z, rotY, width = 1.15, height = 1.35, sill = 0.95) {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.08, height + 0.08, 0.06),
        new THREE.MeshStandardMaterial({ color: "#efeae0", roughness: 0.5 })
      );
      frame.position.set(x, sill + height / 2, z);
      frame.rotation.y = rotY;
      frame.translateZ(0.03);
      shellGroup.add(frame);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshStandardMaterial({
          color: "#9ec4e8",
          emissive: "#8fb7dd",
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0.72,
          roughness: 0.15,
          metalness: 0.1,
          side: THREE.DoubleSide,
        })
      );
      glass.position.copy(frame.position);
      glass.rotation.y = rotY;
      glass.translateZ(0.062);
      glass.userData.role = "window";
      shellGroup.add(glass);
      const paneLight = new THREE.PointLight("#cfe4ff", 0.35, 6, 2);
      paneLight.position.copy(glass.position);
      paneLight.translateZ(0.4);
      shellGroup.add(paneLight);
      windowLights.push({ glass, paneLight });
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, height, 0.04), frame.material);
      mullion.position.copy(frame.position);
      mullion.rotation.y = rotY;
      mullion.translateZ(0.05);
      shellGroup.add(mullion);
    }

    addWindow(-roomWidth / 2, -roomDepth * 0.22, Math.PI / 2);
    addWindow(-roomWidth / 2, roomDepth * 0.18, Math.PI / 2);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 2.05, 0.06),
      new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 0.55 })
    );
    door.position.set(roomWidth * 0.28, 1.025, roomDepth / 2 - 0.03);
    shellGroup.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: "#c9a56a", metalness: 0.8, roughness: 0.25 }));
    knob.position.set(roomWidth * 0.28 + 0.32, 1.0, roomDepth / 2 - 0.07);
    shellGroup.add(knob);
    cutawayMeshes.push(door, knob);

    ceilingMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth, roomDepth),
      new THREE.MeshStandardMaterial({ color: "#f7f4ee", roughness: 1, side: THREE.DoubleSide })
    );
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.y = roomHeight;
    ceilingMesh.userData.role = "ceiling";
    shellGroup.add(ceilingMesh);
    cutawayMeshes.push(ceilingMesh);

    if (photoUrl) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      loader.load(photoUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const north = shellGroup.children.find((c) => c.userData.role === "wall" && Math.abs(c.position.z + roomDepth / 2) < 0.01);
        if (north) north.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
      });
    }

    applyCutaway(cutaway);
    setTimeOfDay(hour);
  }

  function applyCutaway(on) {
    cutaway = on;
    cutawayMeshes.forEach((m) => {
      if (m) m.visible = !on;
    });
  }

  rebuildShell(options);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.6;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.target.set(0, 1.05, 0);
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.screenSpacePanning = true;

  const walkRig = new THREE.Object3D();
  walkRig.position.set(0, 1.58, roomDepth / 2 - 0.9);
  scene.add(walkRig);
  const walkPitch = new THREE.Object3D();
  walkRig.add(walkPitch);
  const keys = new Set();
  let walkLook = false;
  let lookLast = null;

  function setMode(next) {
    if (next === mode) return mode;
    if (next === "walk") {
      applyCutaway(false);
      controls.enabled = false;
      walkRig.position.set(0.35, 1.6, 1.85);
      walkRig.rotation.y = 0;
      walkPitch.rotation.x = -0.08;
      walkPitch.add(camera);
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      mode = "walk";
    } else {
      walkPitch.remove(camera);
      scene.add(camera);
      camera.position.set(3.4, 3.55, 7.35);
      camera.lookAt(0, 1, 0);
      controls.target.set(0, 1.05, 0);
      controls.enabled = true;
      applyCutaway(true);
      mode = "orbit";
    }
    onModeChange(mode);
    return mode;
  }

  function setTimeOfDay(h) {
    hour = Math.max(5, Math.min(22, Number(h) || 14));
    const t = (hour - 6) / 14;
    const az = -0.4 + t * 2.2;
    const el = Math.max(0.08, Math.sin(Math.max(0, t) * Math.PI));
    sun.position.set(Math.cos(az) * 9, 1.4 + el * 9, Math.sin(az) * 6);
    sun.target.position.set(0, 0, 0);
    const day = THREE.MathUtils.clamp((hour - 6) / 12, 0, 1);
    const dusk = hour >= 18;
    sun.intensity = dusk ? 0.15 : 0.45 + el * 1.1;
    sun.color.set(dusk ? "#ffb070" : hour < 8 ? "#ffd7a8" : "#fff3d4");
    hemi.intensity = dusk ? 0.18 : 0.4 + el * 0.25;
    scene.background.set(dusk ? "#1a2430" : hour < 8 ? "#c9b8a4" : "#c5d4de");
    scene.fog.color.copy(scene.background);
    windowLights.forEach(({ glass, paneLight }) => {
      if (glass.material) glass.material.emissiveIntensity = dusk ? 0.08 : 0.25 + el * 0.3;
      paneLight.intensity = dusk ? 0.05 : 0.2 + el * 0.35;
    });
    renderer.toneMappingExposure = dusk ? 0.72 : 1.05;
    onTimeChange(hour);
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener("resize", resize);
  requestAnimationFrame(resize);
  resize();

  const items = new Map();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let selectedId = null;
  let dragId = null;
  let dragMoved = false;
  let placing = null;
  let ghost = null;
  const undo = [];
  const redo = [];
  const clock = new THREE.Clock();

  function snapshot() {
    return [...items.values()].map((m) => ({
      product: { ...m.userData.product },
      x: m.position.x,
      z: m.position.z,
      y: m.position.y,
      rot: m.rotation.y,
      scale: m.scale.x,
    }));
  }

  function pushUndo() {
    undo.push(snapshot());
    if (undo.length > 50) undo.shift();
    redo.length = 0;
  }

  function restY(product, mesh) {
    if (Number.isFinite(product.yOverride)) return product.yOverride;
    if (product.wallMounted) return product.mountHeightM || 1.5;
    if (Number.isFinite(product.sitOnHeightM)) return product.sitOnHeightM;
    return 0;
  }

  function worldFootprint(mesh) {
    const fp = mesh.userData.footprint || { w: 0.4, d: 0.4, h: 0.4 };
    const yaw = mesh.rotation.y;
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    const w = fp.w * c + fp.d * s;
    const d = fp.w * s + fp.d * c;
    return { w, d, h: fp.h };
  }

  function clampToRoom(mesh, x, z) {
    const fp = worldFootprint(mesh);
    const hw = roomWidth / 2 - fp.w / 2 - 0.04;
    const hd = roomDepth / 2 - fp.d / 2 - 0.04;
    mesh.position.x = THREE.MathUtils.clamp(x, -hw, hw);
    mesh.position.z = THREE.MathUtils.clamp(z, -hd, hd);
  }

  function snapWall(mesh, product) {
    if (!(product.wallMounted || product.wallAffinity || product.snap === "wall")) return;
    const fp = worldFootprint(mesh);
    const x = mesh.position.x;
    const z = mesh.position.z;
    const distN = Math.abs(z + roomDepth / 2 - fp.d / 2);
    const distS = Math.abs(roomDepth / 2 - fp.d / 2 - z);
    const distW = Math.abs(x + roomWidth / 2 - fp.w / 2);
    const distE = Math.abs(roomWidth / 2 - fp.w / 2 - x);
    const nearest = Math.min(distN, distS, distW, distE);
    if (nearest > WALL_SNAP && !product.wallMounted) return;
    if (nearest === distN) {
      mesh.position.z = -roomDepth / 2 + fp.d / 2 + 0.02;
      mesh.rotation.y = 0;
    } else if (nearest === distS) {
      mesh.position.z = roomDepth / 2 - fp.d / 2 - 0.02;
      mesh.rotation.y = Math.PI;
    } else if (nearest === distW) {
      mesh.position.x = -roomWidth / 2 + fp.w / 2 + 0.02;
      mesh.rotation.y = Math.PI / 2;
    } else {
      mesh.position.x = roomWidth / 2 - fp.w / 2 - 0.02;
      mesh.rotation.y = -Math.PI / 2;
    }
  }

  function gridSnap(mesh) {
    mesh.position.x = Math.round(mesh.position.x / SNAP) * SNAP;
    mesh.position.z = Math.round(mesh.position.z / SNAP) * SNAP;
  }

  function collides(mesh, ignoreId) {
    const product = mesh.userData.product || {};
    if (product.collide === false || product.category === "rug") return false;
    const a = aabbXZ(mesh);
    const hw = roomWidth / 2;
    const hd = roomDepth / 2;
    if (a.min.x < -hw + 0.01 || a.max.x > hw - 0.01 || a.min.z < -hd + 0.01 || a.max.z > hd - 0.01) return true;
    for (const [id, other] of items) {
      if (id === ignoreId) continue;
      const op = other.userData.product || {};
      if (op.collide === false || op.category === "rug") continue;
      if (boxesOverlap(a, aabbXZ(other))) return true;
    }
    return false;
  }

  function markValidity(mesh, ignoreId) {
    const valid = !collides(mesh, ignoreId);
    mesh.userData.valid = valid;
    mesh.traverse((ch) => {
      if (ch.isMesh && ch.material && ch.material.emissive && mesh.userData.ghost) {
        ch.material.emissive.set(valid ? "#1f8a4c" : "#c0392b");
        ch.material.emissiveIntensity = 0.65;
      }
    });
    return valid;
  }

  function selectItem(id) {
    for (const [itemId, mesh] of items) {
      mesh.traverse((ch) => {
        if (!ch.material || !ch.material.emissive || mesh.userData.ghost) return;
        if (!ch.userData._em) {
          ch.userData._em = { c: ch.material.emissive.clone(), i: ch.material.emissiveIntensity || 0 };
        }
        if (itemId === id) {
          ch.material.emissive = new THREE.Color(0x1b4f8a);
          ch.material.emissiveIntensity = Math.max(ch.userData._em.i, 0.35);
        } else {
          ch.material.emissive.copy(ch.userData._em.c);
          ch.material.emissiveIntensity = ch.userData._em.i;
        }
      });
    }
    selectedId = id;
    const mesh = id ? items.get(id) : null;
    onSelectChange(mesh ? mesh.userData.product : null, mesh || null);
  }

  async function buildMesh(product) {
    const p = normalizeProduct(product) || product;
    if (p.glbUrl && p.modelSource && p.modelSource !== "proxy" && p.modelSource !== "procedural") {
      const sceneObj = await loadGltf(p.glbUrl);
      if (sceneObj) {
        const box = new THREE.Box3().setFromObject(sceneObj);
        const size = box.getSize(new THREE.Vector3());
        const targetW = Math.max(Number(p.widthIn) || 12, 2) * IN_TO_M;
        const s = size.x > 0.001 ? targetW / size.x : 1;
        sceneObj.scale.setScalar(s);
        const wrapped = new THREE.Group();
        wrapped.add(sceneObj);
        const sized = new THREE.Box3().setFromObject(wrapped);
        const sz = sized.getSize(new THREE.Vector3());
        wrapped.userData.footprint = { w: sz.x, d: sz.z, h: sz.y };
        return wrapped;
      }
    }
    return buildFurnitureMesh(p);
  }

  async function addItem(product, opts = {}) {
    const p = normalizeProduct(product) || product;
    const instanceId = opts.instanceId || nextInstanceId(p);
    if (!opts.silent) onBusy(true);
    const mesh = await buildMesh(p);
    mesh.userData.product = { ...p, instanceId };
    mesh.userData.footprint = mesh.userData.footprint || { w: 0.5, d: 0.5, h: 0.5 };
    if (!opts.silent) pushUndo();
    const x = opts.x ?? 0;
    const z = opts.z ?? 0;
    clampToRoom(mesh, x, z);
    mesh.position.y = opts.y != null ? opts.y : restY(p, mesh);
    if (opts.rot != null) mesh.rotation.y = opts.rot;
    if (opts.scale) mesh.scale.setScalar(opts.scale);
    if (!opts.skipSnap) snapWall(mesh, p);
    itemsGroup.add(mesh);
    items.set(instanceId, mesh);
    if (!opts.silent) selectItem(instanceId);
    if (!opts.silent) onBusy(false);
    onChange();
    return instanceId;
  }

  function disposeMesh(mesh) {
    mesh.traverse((ch) => {
      if (ch.isLight) ch.dispose?.();
    });
  }

  function removeItem(id, silent) {
    const mesh = items.get(id);
    if (!mesh) return;
    if (!silent) pushUndo();
    itemsGroup.remove(mesh);
    disposeMesh(mesh);
    items.delete(id);
    if (selectedId === id) selectItem(null);
    if (!silent) onChange();
  }

  function rotateSelected(delta = ROT_SNAP) {
    const mesh = items.get(selectedId);
    if (!mesh) return;
    pushUndo();
    mesh.rotation.y += delta;
    snapWall(mesh, mesh.userData.product);
    onChange();
  }

  function scaleSelected(factor) {
    const mesh = items.get(selectedId);
    if (!mesh) return;
    pushUndo();
    const next = Math.max(0.5, Math.min(2.2, mesh.scale.x * factor));
    mesh.scale.setScalar(next);
    onChange();
  }

  function duplicateSelected() {
    const mesh = items.get(selectedId);
    if (!mesh) return;
    const p = mesh.userData.product;
    return addItem(p, {
      x: mesh.position.x + 0.45,
      z: mesh.position.z + 0.45,
      y: mesh.position.y,
      rot: mesh.rotation.y,
      scale: mesh.scale.x,
    });
  }

  async function replaceSelected(product) {
    const mesh = items.get(selectedId);
    if (!mesh) return;
    const pos = mesh.position.clone();
    const rot = mesh.rotation.y;
    const id = selectedId;
    pushUndo();
    removeItem(id, true);
    return addItem(product, { x: pos.x, z: pos.z, y: pos.y, rot, silent: true });
  }

  async function restore(state) {
    for (const id of [...items.keys()]) removeItem(id, true);
    for (const row of state) {
      await addItem(row.product, {
        x: row.x,
        z: row.z,
        y: row.y,
        rot: row.rot,
        scale: row.scale,
        instanceId: row.product.instanceId,
        silent: true,
        skipSnap: true,
      });
    }
    onChange();
  }

  async function undoLast() {
    if (!undo.length) return;
    redo.push(snapshot());
    await restore(undo.pop());
  }

  async function redoLast() {
    if (!redo.length) return;
    undo.push(snapshot());
    await restore(redo.pop());
  }

  function pointerToRay(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  function hitItem(event) {
    pointerToRay(event);
    const meshes = [];
    for (const mesh of items.values()) {
      mesh.traverse((ch) => {
        if (ch.isMesh) meshes.push(ch);
      });
    }
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData.product) obj = obj.parent;
    return obj;
  }

  function floorHit(event) {
    pointerToRay(event);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(floorPlane, hit)) return hit;
    return null;
  }

  function clearGhost() {
    if (ghost) {
      itemsGroup.remove(ghost);
      ghost = null;
    }
    placing = null;
    if (mode === "orbit") controls.enabled = true;
  }

  async function beginPlace(product) {
    clearGhost();
    const p = normalizeProduct(product) || product;
    placing = p;
    onBusy(true);
    ghost = await buildMesh(p);
    ghost.userData.product = { ...p, instanceId: "ghost" };
    ghost.userData.ghost = true;
    ghost.userData.valid = true;
    controls.enabled = false;
    ghost.traverse((ch) => {
      if (ch.isLight) ch.visible = false;
      if (ch.isMesh && ch.material) {
        const src = Array.isArray(ch.material) ? ch.material[0] : ch.material;
        const c = src.clone();
        c.transparent = true;
        c.opacity = 0.48;
        c.depthWrite = false;
        ch.material = c;
        ch.castShadow = false;
      }
    });
    tintPlacement(ghost, true);
    itemsGroup.add(ghost);
    ghost.position.set(0, restY(p, ghost), Math.min(roomDepth * 0.28, roomDepth / 2 - 0.6));
    clampToRoom(ghost, ghost.position.x, ghost.position.z);
    markValidity(ghost, null);
    onBusy(false);
    selectItem(null);
  }

  function cancelPlace() {
    clearGhost();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (mode === "walk") {
      walkLook = true;
      lookLast = { x: event.clientX, y: event.clientY };
      const obj = hitItem(event);
      if (obj && obj.userData.product) selectItem(obj.userData.product.instanceId);
      return;
    }
    if (placing && ghost) {
      const hit = floorHit(event);
      if (hit && ghost.userData.valid !== false) {
        const p = placing;
        const x = ghost.position.x;
        const z = ghost.position.z;
        const y = ghost.position.y;
        const rot = ghost.rotation.y;
        clearGhost();
        addItem(p, { x, z, y, rot });
      }
      return;
    }
    const obj = hitItem(event);
    if (obj && obj.userData.product) {
      const id = obj.userData.product.instanceId;
      selectItem(id);
      dragId = id;
      dragMoved = false;
      pushUndo();
      controls.enabled = false;
    } else {
      selectItem(null);
    }
  });

  window.addEventListener("pointermove", (event) => {
    if (mode === "walk" && walkLook && lookLast) {
      const dx = event.clientX - lookLast.x;
      const dy = event.clientY - lookLast.y;
      walkRig.rotation.y -= dx * 0.005;
      walkPitch.rotation.x = THREE.MathUtils.clamp(walkPitch.rotation.x - dy * 0.005, -1.1, 1.1);
      lookLast = { x: event.clientX, y: event.clientY };
      return;
    }
    if (placing && ghost && mode === "orbit") {
      const hit = floorHit(event);
      if (!hit) return;
      ghost.position.y = restY(placing, ghost);
      clampToRoom(ghost, hit.x, hit.z);
      gridSnap(ghost);
      snapWall(ghost, placing);
      markValidity(ghost, null);
      return;
    }
    if (!dragId) return;
    const mesh = items.get(dragId);
    if (!mesh) return;
    const hit = floorHit(event);
    if (!hit) return;
    dragMoved = true;
    clampToRoom(mesh, hit.x, hit.z);
    gridSnap(mesh);
    snapWall(mesh, mesh.userData.product);
  });

  window.addEventListener("pointerup", () => {
    if (dragId && dragMoved) onChange();
    if (dragId && !dragMoved) undo.pop();
    dragId = null;
    dragMoved = false;
    walkLook = false;
    lookLast = null;
    if (mode === "orbit") controls.enabled = true;
  });

  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    keys.add(e.code);
    if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) redoLast();
      else undoLast();
    }
    if (e.code === "Escape") {
      cancelPlace();
      selectItem(null);
    }
    if (e.code === "Delete" || e.code === "Backspace") {
      if (selectedId) removeItem(selectedId);
    }
    if (e.code === "KeyQ") rotateSelected(-ROT_SNAP);
    if (e.code === "KeyE") rotateSelected(ROT_SNAP);
    if (e.code === "KeyR" && selectedId) rotateSelected(Math.PI / 2);
    if ((e.metaKey || e.ctrlKey) && e.code === "KeyD") {
      e.preventDefault();
      duplicateSelected();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  function walkTick(dt) {
    if (mode !== "walk") return;
    const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3.2 : 1.7) * dt;
    const forward = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const strafe = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    if (!forward && !strafe) return;
    const yaw = walkRig.rotation.y;
    const dx = Math.sin(yaw) * -forward + Math.cos(yaw) * strafe;
    const dz = Math.cos(yaw) * -forward - Math.sin(yaw) * strafe;
    const nx = THREE.MathUtils.clamp(walkRig.position.x + dx * speed, -roomWidth / 2 + 0.28, roomWidth / 2 - 0.28);
    const nz = THREE.MathUtils.clamp(walkRig.position.z + dz * speed, -roomDepth / 2 + 0.28, roomDepth / 2 - 0.28);
    walkRig.position.x = nx;
    walkRig.position.z = nz;
  }

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);
    walkTick(dt);
    if (mode === "orbit") controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  function screenshot() {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  }

  function placedList() {
    return [...items.values()].map((m) => m.userData.product);
  }

  function roomTotal() {
    return placedList().reduce((s, p) => s + Number(p.price || 0), 0);
  }

  function summary() {
    const list = placedList();
    if (!list.length) return "No items placed yet.";
    const total = roomTotal();
    const lines = list.map((p) => `${p.name} — $${Number(p.price || 0).toLocaleString("en-US")}`);
    return `ROOM TOTAL — $${Math.round(total).toLocaleString("en-US")}\n${lines.join("\n")}`;
  }

  function exportDesign() {
    return {
      reconstruction: { width: roomWidth, depth: roomDepth, height: roomHeight, photoUrl },
      items: snapshot(),
      total: roomTotal(),
    };
  }

  async function autoFurnish(layout = DEFAULT_LAYOUT) {
    onBusy(true);
    pushUndo();
    for (const id of [...items.keys()]) removeItem(id, true);
    const sx = roomWidth / DEFAULT_LIVING_ROOM.width;
    const sz = roomDepth / DEFAULT_LIVING_ROOM.depth;
    for (const row of layout) {
      const product = findProduct(row.id);
      if (!product) continue;
      await addItem(product, {
        x: row.x * sx,
        z: row.z * sz,
        y: row.y,
        rot: row.rot,
        silent: true,
        skipSnap: true,
      });
    }
    selectItem(null);
    onBusy(false);
    onChange();
  }

  async function resetRoom() {
    await autoFurnish(DEFAULT_LAYOUT);
  }

  function projectSelected() {
    const mesh = items.get(selectedId);
    if (!mesh) return null;
    const v = mesh.position.clone();
    v.y += (mesh.userData.footprint?.h || 0.6) * 0.6;
    v.project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  return {
    addItem,
    removeItem,
    selectItem,
    rotateSelected,
    scaleSelected,
    duplicateSelected,
    replaceSelected,
    undoLast,
    redoLast,
    screenshot,
    summary,
    exportDesign,
    applyReconstruction: rebuildShell,
    beginPlace,
    cancelPlace,
    setMode,
    getMode: () => mode,
    setTimeOfDay,
    autoFurnish,
    resetRoom,
    placedList,
    roomTotal,
    projectSelected,
    resize,
    get selectedId() {
      return selectedId;
    },
    set onSelect(fn) {
      onSelectChange = fn || (() => {});
    },
    set onMode(fn) {
      onModeChange = fn || (() => {});
    },
    set onTime(fn) {
      onTimeChange = fn || (() => {});
    },
    set onBusyChange(fn) {
      onBusy = fn || (() => {});
    },
    set onRoomChange(fn) {
      onChange = fn || (() => {});
    },
  };
}
