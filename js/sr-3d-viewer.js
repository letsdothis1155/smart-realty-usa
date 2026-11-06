/* Copyright 2026 Andrew Iredale Jr / SMART REALTY.US LLC. All rights reserved.
   Viewer only. The reconstruction engine is not in this file.
   A browser copy of this viewer is not the product. */

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm";

const EYE = 1.55;
const RADIUS = 0.2;
const SPEED = 1.4;
const UP = new THREE.Vector3(0, 1, 0);

function hostOk() {
  const host = location.hostname;
  return host === "smartrealty.us"
    || host.endsWith(".smartrealty.us")
    || host === "localhost"
    || host === "127.0.0.1";
}

function segmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = 0;
  if (len2 > 0) t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
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

function pointHitsWall(x, z, walls, radius) {
  for (const wall of walls) {
    for (const [ax, az, bx, bz] of segmentsFor(wall)) {
      if (segmentDistance(x, z, ax, az, bx, bz) < radius) return true;
    }
  }
  return false;
}

function moveBlocked(x0, z0, x1, z1, walls, radius) {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.02, radius * 0.25)));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (pointHitsWall(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, walls, radius)) return true;
  }
  return false;
}

function insidePlan(x, z, rects) {
  return rects.some((rect) => x >= rect.x - 1e-6
    && x <= rect.x + rect.w + 1e-6
    && z >= rect.z - 1e-6
    && z <= rect.z + rect.d + 1e-6);
}

function ensureStyle() {
  if (document.getElementById("sr3d-style")) return;
  const style = document.createElement("style");
  style.id = "sr3d-style";
  style.textContent = `
    #sr-3d-viewer { position: relative; height: min(70vh, 520px); min-height: 280px; margin: 0.8rem 0 1rem; background: #121418; border-radius: 12px; overflow: hidden; }
    #sr-3d-viewer.sr3d-fill { position: absolute; inset: 0; height: 100%; min-height: 100%; margin: 0; border-radius: 0; }
    #sr-3d-viewer.sr3d-fill .sr3d-hud { top: 64px; }
    #sr-3d-viewer canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .sr3d-msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1.2rem; text-align: center; color: #e8e4dc; font: 600 0.95rem/1.4 Inter, system-ui, sans-serif; }
    .sr3d-hud { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; flex-wrap: wrap; gap: 6px; z-index: 2; pointer-events: none; }
    .sr3d-name, .sr3d-badge { pointer-events: none; color: #f4f1ea; background: rgba(10,12,16,0.72); border-radius: 999px; padding: 0.35rem 0.7rem; font: 600 0.78rem/1.2 Inter, system-ui, sans-serif; }
    .sr3d-badge { background: #8a6a2f; color: #fff; }
    .sr3d-rooms { position: absolute; top: 10px; right: 10px; z-index: 3; min-height: 48px; max-width: 46%; border: 0; border-radius: 10px; background: #f4f1ea; color: #1a1c20; font: 600 0.85rem/1.2 Inter, system-ui, sans-serif; padding: 0 0.6rem; }
    .sr3d-pad { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 3; display: flex; justify-content: space-between; gap: 8px; }
    .sr3d-pad button { min-width: 48px; min-height: 48px; border: 0; border-radius: 10px; background: rgba(244,241,234,0.92); color: #1a1c20; font: 700 1rem/1 Inter, system-ui, sans-serif; }
    .sr3d-hint { position: absolute; left: 12px; right: 12px; bottom: 68px; z-index: 3; text-align: center; color: #f4f1ea; background: rgba(10,12,16,0.72); border-radius: 10px; padding: 0.45rem 0.7rem; font: 600 0.8rem/1.3 Inter, system-ui, sans-serif; }
  `;
  document.head.appendChild(style);
}

function showMessage(el, text) {
  el.innerHTML = `<div class="sr3d-msg">${text}</div>`;
}

function mount(el) {
  if (!el) return false;
  ensureStyle();
  if (el._sr3d) {
    el._sr3d.stop();
    el._sr3d.renderer?.dispose();
    el._sr3d = null;
  }
  el.innerHTML = "";
  if (!hostOk()) {
    showMessage(el, "This viewer only runs on smartrealty.us.");
    return true;
  }
  const listingId = el.dataset.listingId || "";
  if (!listingId) {
    showMessage(el, "This listing does not have a 3D model yet.");
    return true;
  }
  const canvas = document.createElement("canvas");
  canvas.dataset.room = "";
  canvas.dataset.ready = "0";
  el.appendChild(canvas);
  const hud = document.createElement("div");
  hud.className = "sr3d-hud";
  const nameEl = document.createElement("div");
  nameEl.className = "sr3d-name";
  const badge = document.createElement("div");
  badge.className = "sr3d-badge";
  badge.hidden = true;
  badge.textContent = "Dimensions estimated";
  hud.append(nameEl, badge);
  el.appendChild(hud);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
  } catch {
    showMessage(el, "This browser cannot run WebGL.");
    return true;
  }
  if (!renderer.getContext()) {
    showMessage(el, "This browser cannot run WebGL.");
    return true;
  }
  renderer.setClearColor(0x121418, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 80);
  camera.rotation.order = "YXZ";
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xfff4e5, 0x3a342c, 0.45));
  const sun = new THREE.DirectionalLight(0xffffff, 0.65);
  sun.position.set(4, 8, 2);
  scene.add(sun);

  const pos = { x: 0, z: 0 };
  let yaw = 0;
  let pitch = 0;
  let walls = [];
  let rects = [];
  let catalog = [];
  let startRoom = "";
  let select = null;
  let hint = null;
  let running = true;
  const keys = new Set();
  const held = new Set();

  function resize() {
    const width = Math.max(2, el.clientWidth || 640);
    const height = Math.max(2, el.clientHeight || 360);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function syncCamera() {
    camera.position.set(pos.x, EYE, pos.z);
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = 0;
  }

  function roomAt(x, z) {
    const hits = rects.filter((rect) => x >= rect.x && x <= rect.x + rect.w && z >= rect.z && z <= rect.z + rect.d);
    hits.sort((a, b) => a.w * a.d - b.w * b.d);
    return hits[0] || null;
  }

  function faceOf(room) {
    if (!room) return 0;
    if (room.photoWall === "maxZ") return Math.PI;
    if (room.photoWall === "minX") return Math.PI / 2;
    return 0;
  }

  function updateHud() {
    const room = roomAt(pos.x, pos.z);
    const meta = catalog.find((item) => item.id === room?.id);
    const label = meta?.label || room?.id || "";
    const size = meta && meta.widthFt
      ? (meta.estimated
        ? ` · about ${Math.round(meta.widthFt)}×${Math.round(meta.depthFt)} ft`
        : ` · ${meta.widthFt}×${meta.depthFt} ft`)
      : "";
    nameEl.textContent = label ? `${label}${size}` : "";
    badge.hidden = !meta?.estimated;
    if (select && room && document.activeElement !== select && select.value !== room.id) select.value = room.id;
    if (hint && room && startRoom && room.id !== startRoom) hint.hidden = true;
    canvas.dataset.room = room?.id || "";
    canvas.dataset.x = pos.x.toFixed(3);
    canvas.dataset.z = pos.z.toFixed(3);
    canvas.dataset.yaw = yaw.toFixed(3);
  }

  function allowed(x0, z0, x1, z1) {
    if (moveBlocked(x0, z0, x1, z1, walls, RADIUS)) return false;
    return insidePlan(x1, z1, rects);
  }

  function step(dt, input) {
    yaw -= (input.look || 0) * dt * 1.6;
    syncCamera();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() > 1e-8) {
      fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, UP);
      let mx = fwd.x * (input.forward || 0) + right.x * (input.strafe || 0);
      let mz = fwd.z * (input.forward || 0) + right.z * (input.strafe || 0);
      const len = Math.hypot(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }
      const nx = pos.x + mx * SPEED * dt;
      const nz = pos.z + mz * SPEED * dt;
      if (allowed(pos.x, pos.z, nx, nz)) {
        pos.x = nx;
        pos.z = nz;
      } else if (allowed(pos.x, pos.z, nx, pos.z)) {
        pos.x = nx;
      } else if (allowed(pos.x, pos.z, pos.x, nz)) {
        pos.z = nz;
      }
    }
    syncCamera();
    updateHud();
  }

  function inputNow() {
    const forward = (keys.has("KeyW") || keys.has("ArrowUp") || held.has("forward") ? 1 : 0)
      - (keys.has("KeyS") || keys.has("ArrowDown") || held.has("back") ? 1 : 0);
    const strafe = (keys.has("KeyD") || keys.has("ArrowRight") || held.has("right") ? 1 : 0)
      - (keys.has("KeyA") || keys.has("ArrowLeft") || held.has("left") ? 1 : 0);
    const look = (keys.has("KeyE") || held.has("lookRight") ? 1 : 0)
      - (keys.has("KeyQ") || held.has("lookLeft") ? 1 : 0);
    return { forward, strafe, look };
  }

  let last = performance.now();
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hidden) step(dt, inputNow());
    renderer.render(scene, camera);
    if (canvas.dataset.ready !== "1") canvas.dataset.ready = "1";
    if (!document.hidden) requestAnimationFrame(loop);
  }

  function onHide() {
    if (document.hidden) return;
    last = performance.now();
    if (running) requestAnimationFrame(loop);
  }

  select = document.createElement("select");
  select.className = "sr3d-rooms";
  select.setAttribute("aria-label", "Choose a room");
  el.appendChild(select);
  select.addEventListener("change", () => {
    const meta = catalog.find((item) => item.id === select.value);
    if (!meta) return;
    pos.x = meta.x + meta.w / 2;
    pos.z = meta.z + meta.d / 2;
    yaw = faceOf(meta);
    pitch = 0;
    syncCamera();
    updateHud();
  });

  hint = document.createElement("div");
  hint.className = "sr3d-hint";
  hint.textContent = "The far wall is the listing photo. Turn around to walk through the door.";
  el.appendChild(hint);

  const pad = document.createElement("div");
  pad.className = "sr3d-pad";
  const buttons = [
    ["left", "←", "Strafe left"],
    ["back", "↓", "Walk back"],
    ["forward", "↑", "Walk forward"],
    ["right", "→", "Strafe right"],
    ["lookLeft", "↺", "Look left"],
    ["lookRight", "↻", "Look right"],
  ];
  for (const [act, text, label] of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.act = act;
    button.textContent = text;
    button.setAttribute("aria-label", label);
    const release = () => held.delete(act);
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      held.add(act);
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
    pad.appendChild(button);
  }
  el.appendChild(pad);

  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    yaw -= (event.clientX - drag.x) * 0.005;
    pitch = Math.max(-1.1, Math.min(1.1, pitch - (event.clientY - drag.y) * 0.005));
    drag.x = event.clientX;
    drag.y = event.clientY;
    syncCamera();
  });
  const endDrag = (event) => {
    if (drag && drag.id === event.pointerId) drag = null;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  function onKey(event) {
    const tag = event.target && event.target.tagName;
    if (tag && /^(input|select|textarea)$/i.test(tag)) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    if (event.type === "keydown") keys.add(event.code);
    else keys.delete(event.code);
  }
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onHide);

  function stop() {
    running = false;
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onHide);
  }

  function basis() {
    syncCamera();
    camera.updateMatrixWorld();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP);
    return {
      f: [fwd.x, fwd.y, fwd.z],
      r: [right.x, right.y, right.z],
    };
  }

  el._sr3d = {
    renderer,
    stop,
    setYaw(value) { yaw = value; pitch = 0; syncCamera(); updateHud(); },
    setPos(x, z, nextYaw) {
      pos.x = x;
      pos.z = z;
      if (nextYaw != null) yaw = nextYaw;
      syncCamera();
      updateHud();
    },
    pos() { return { x: pos.x, z: pos.z, yaw, room: canvas.dataset.room }; },
    basis,
    simulate(ms, input) {
      const frames = Math.max(1, Math.round(ms / 16));
      const dt = ms / frames / 1000;
      for (let i = 0; i < frames; i += 1) step(dt, input || { forward: 0, strafe: 0, look: 0 });
      renderer.render(scene, camera);
    },
  };

  resize();
  const params = new URLSearchParams();
  const token = el.dataset.token || "";
  fetch(`/models/${encodeURIComponent(listingId)}/rooms.json`)
    .then((response) => {
      if (response.status === 404) throw new Error("missing");
      if (!response.ok) throw new Error("bad");
      return response.json();
    })
    .then((pack) => {
      if (pack.listingId && pack.listingId !== listingId) throw new Error("mismatch");
      if (pack.access !== "sample") {
        if (!token) throw new Error("token");
        params.set("token", token);
      }
      const glbPath = String(pack.glb || "");
      if (!glbPath.startsWith(`/models/${listingId}/`)) throw new Error("path");
      walls = Array.isArray(pack.walls) ? pack.walls : [];
      rects = Array.isArray(pack.rects) ? pack.rects : [];
      catalog = [...(pack.rooms || []), pack.hall].filter(Boolean);
      if (pack.note) el.title = pack.note;
      select.innerHTML = catalog.map((room) => `<option value="${room.id}">${room.label || room.id}</option>`).join("");
      const start = pack.start || {};
      pos.x = Number(start.x) || 0;
      pos.z = Number(start.z) || 0;
      yaw = Number(start.yaw) || 0;
      startRoom = start.id || "";
      select.value = startRoom || catalog[0]?.id || "";
      syncCamera();
      updateHud();
      resize();
      const loader = new GLTFLoader();
      loader.load(`${glbPath}${params.toString() ? `?${params}` : ""}`, (gltf) => {
        scene.add(gltf.scene);
        renderer.render(scene, camera);
        canvas.dataset.ready = "1";
        requestAnimationFrame(loop);
      }, undefined, () => {
        showMessage(el, "The model file did not load.");
      });
    })
    .catch((error) => {
      const text = error.message === "missing"
        ? "This listing does not have a 3D model yet."
        : error.message === "token"
          ? "This model needs a signed link from SmartRealty."
          : "The 3D model could not be opened.";
      showMessage(el, text);
    });
  return true;
}

window.SRU_3D = { mount };
window.dispatchEvent(new Event("sr-3d-ready"));
