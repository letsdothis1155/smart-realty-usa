/* Overhead Earth view: Google Photorealistic 3D Tiles when a Map Tiles key
   is configured, otherwise a 3D globe with Esri satellite imagery. */
const CESIUM_JS = "https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Cesium.js";
const CESIUM_CSS = "https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/Widgets/widgets.css";

let cesiumPromise = null;
let mapsConfig = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Cesium failed to load"));
    document.head.appendChild(s);
  });
}

function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

export async function loadMapsConfig() {
  if (mapsConfig) return mapsConfig;
  try {
    const res = await fetch("/api/maps/config");
    mapsConfig = await res.json();
  } catch {
    mapsConfig = {
      ok: true,
      overhead: { provider: "esri-satellite-globe", google3d: false, tilesUrl: "", credit: "Satellite fallback" },
    };
  }
  return mapsConfig;
}

export async function ensureCesium() {
  if (window.Cesium) return window.Cesium;
  if (!cesiumPromise) {
    loadCss(CESIUM_CSS);
    cesiumPromise = loadScript(CESIUM_JS).then(() => window.Cesium);
  }
  return cesiumPromise;
}

export async function initEarthOverhead(container, opts = {}) {
  if (!container) throw new Error("Earth container required");
  const Cesium = await ensureCesium();
  const cfg = await loadMapsConfig();
  const overhead = (cfg && cfg.overhead) || {};
  const lat = Number(opts.lat);
  const lng = Number(opts.lng);
  const ready = Number.isFinite(lat) && Number.isFinite(lng);

  Cesium.Ion.defaultAccessToken = "";

  const esri = new Cesium.UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Esri, Maxar, Earthstar Geographics",
    maximumLevel: 19,
  });

  const viewer = new Cesium.Viewer(container, {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    fullscreenButton: true,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: document.createElement("div"),
    imageryProvider: esri,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  });
  viewer.scene.globe.enableLighting = true;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 2.0e7;

  let usedGoogle = false;
  if (overhead.google3d && overhead.tilesUrl) {
    try {
      const tileset = await Cesium.Cesium3DTileset.fromUrl(overhead.tilesUrl);
      viewer.scene.primitives.add(tileset);
      usedGoogle = true;
    } catch {
      usedGoogle = false;
    }
  }

  if (ready) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, opts.height || 420),
      orientation: {
        heading: Cesium.Math.toRadians(Number(opts.heading) || 0),
        pitch: Cesium.Math.toRadians(Number(opts.pitch) || -70),
        roll: 0,
      },
      duration: 1.4,
    });
    viewer.entities.add({
      name: opts.title || "Listing",
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: { pixelSize: 12, color: Cesium.Color.fromCssColorString("#e8c87a") },
      label: {
        text: opts.title || "Listing",
        font: "13px Inter, sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  return {
    viewer,
    usedGoogle,
    credit: usedGoogle
      ? "Google Photorealistic 3D Tiles · overhead / orbit"
      : overhead.credit || "Esri satellite globe · not Google 3D",
    flyTo(nextLat, nextLng, title) {
      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(nextLng, nextLat, opts.height || 420),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-70),
          roll: 0,
        },
        duration: 1.1,
      });
      if (title) {
        viewer.entities.removeAll();
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(nextLng, nextLat),
          point: { pixelSize: 12, color: Cesium.Color.fromCssColorString("#e8c87a") },
          label: {
            text: title,
            font: "13px Inter, sans-serif",
            fillColor: Cesium.Color.WHITE,
            pixelOffset: new Cesium.Cartesian2(0, -18),
          },
        });
      }
    },
    destroy() {
      try {
        viewer.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
