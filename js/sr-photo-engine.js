async function startPhotoRoom() {
 const params=new URLSearchParams(location.search);
 const embedded=document.getElementById('editor-data').textContent.trim();
 if(embedded){ bootPhotoRoom(JSON.parse(embedded)); return; }
 const {loadPropertyPhotoRooms}=await import('/js/room-photo-previews.mjs?v=3');
 const listing=params.get('listing');
 const rooms=await loadPropertyPhotoRooms(listing);
 const entry=rooms.find(room=>room.id===params.get('room'));
 if(!entry)throw new Error('Room model is unavailable');
 const response=await fetch(entry.model,{signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Room model could not load');
 const data=await response.json();
 if(data.listingId!==listing||data.roomId!==entry.id||!data.views?.length||!data.shell?.surfaces?.length)throw new Error('Room model is incomplete');
 bootPhotoRoom({...data,roomLinks:rooms});
}

async function showPhotoFallback() {
 const params=new URLSearchParams(location.search);
 const listing=params.get('listing');
 document.getElementById('studio').hidden=true;
 document.getElementById('room-unavailable').hidden=false;
 if(!listing)return;
 document.getElementById('room-fallback-back').href='/room-builder/?listing='+encodeURIComponent(listing)+'&engine=planning';
 try {
  const response=await fetch('/api/listings/'+encodeURIComponent(listing),{signal:AbortSignal.timeout(6000)});
  if(!response.ok)return;
  const {listing:record}=await response.json();
  const gallery=document.getElementById('room-fallback-photos');
  for(const source of (record?.images||[]).slice(0,12)){
   const url=new URL(source,location.origin);
   if(!['https:','http:'].includes(url.protocol))continue;
   const photo=new Image();
   photo.alt='Listing photo';
   photo.onerror=()=>photo.remove();
   photo.src=url.href;
   gallery.append(photo);
  }
 } catch { /* Keep the unavailable message visible. */ }
}
startPhotoRoom().catch(showPhotoFallback);

function bootPhotoRoom(data) {
 document.getElementById('studio').hidden=false;
 document.getElementById('room-title').textContent=[data.propertyLabel,data.roomLabel].filter(Boolean).join(' · ')||'Room preview';
"use strict";
/* Inline renderer for the self-contained room editor. */
function createPhotoRenderer(canvas, finishes, redraw) {
 const gl = canvas.getContext('webgl', {antialias: true, alpha: true});
 if (!gl) return null;

 function shader(type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
   throw new Error(gl.getShaderInfoLog(result));
  }
  return result;
 }

 const program = gl.createProgram();
 gl.attachShader(program, shader(gl.VERTEX_SHADER, `
  attribute vec4 position;
  attribute vec2 uv;
  attribute vec3 tint;
  varying vec2 photoUV;
  varying vec3 materialTint;
  void main() {
   gl_Position = position;
   photoUV = uv;
   materialTint = tint;
  }
 `));
 gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
  precision mediump float;
  uniform sampler2D photo;
  varying vec2 photoUV;
  varying vec3 materialTint;
  void main() {
   gl_FragColor = texture2D(photo, photoUV) * vec4(materialTint, 1.0);
  }
 `));
 gl.linkProgram(program);
 if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);
 const vertices = gl.createBuffer();
 gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
 for (const [name, size, offset] of [['position', 4, 0], ['uv', 2, 16], ['tint', 3, 24]]) {
  const location = gl.getAttribLocation(program, name);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 36, offset);
 }
 gl.enable(gl.DEPTH_TEST);

 function makeTexture(image, color = [185, 186, 181, 255]) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
   new Uint8Array(color));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (image) {
   const photo = new Image();
   photo.onload = () => {
    if (gl.isContextLost()) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo);
    redraw();
   };
   photo.src = image;
  }
  return texture;
 }

 const fallback = makeTexture();
 const solid = makeTexture(null, [255,255,255,255]);
 const textures = new Map(Object.entries(finishes).map(([id, finish]) => [id, makeTexture(finish.image)]));
 return function draw(surfaces, triangles, clipPosition, objects = [], overPhoto = false) {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(overPhoto ? 0 : 17/255, overPhoto ? 0 : 24/255, overPhoto ? 0 : 32/255, overPhoto ? 0 : 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.colorMask(!overPhoto, !overPhoto, !overPhoto, !overPhoto);
  for (const face of surfaces) {
   const bounds = face.finishBounds || finishes[face.id]?.bounds;
   const origin = face.origin.map((coordinate, index) => coordinate + face.offset * face.normal[index]);
   const payload = [];
   for (const triangle of triangles(face)) {
    for (const point of triangle) {
     const delta = point.map((coordinate, index) => coordinate - origin[index]);
     const u = delta.reduce((sum, coordinate, index) => sum + coordinate * face.u[index], 0);
     const v = delta.reduce((sum, coordinate, index) => sum + coordinate * face.v[index], 0);
     payload.push(...clipPosition(point),
      bounds ? (u-bounds[0])/(bounds[2]-bounds[0]) : 0,
      bounds ? (v-bounds[1])/(bounds[3]-bounds[1]) : 0, 1, 1, 1);
    }
   }
   if (!payload.length) continue;
   gl.bindTexture(gl.TEXTURE_2D, textures.get(face.id) || fallback);
   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(payload), gl.STREAM_DRAW);
   gl.drawArrays(gl.TRIANGLES, 0, payload.length / 9);
  }
  gl.colorMask(true, true, true, true);
  if (objects.length) {
   const payload = [];
   for (const {points, rgb} of objects) {
    for (const point of points) payload.push(...clipPosition(point), 0, 0, ...rgb);
   }
   gl.bindTexture(gl.TEXTURE_2D, solid);
   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(payload), gl.STREAM_DRAW);
   gl.drawArrays(gl.TRIANGLES, 0, payload.length / 9);
  }
 };
}

/* Procedural room-planning models. The reconstructed floor provides a relative scale. */
const furnitureCatalog = {
 kivik: {
  label: 'IKEA KIVIK sofa', inches: [89.75, 32.625, 37.375], color: '#a49a8d', model: 'sofa',
  url: 'https://www.ikea.com/us/en/p/kivik-sofa-tibbleby-beige-gray-s39440593/',
 },
 poang: {
  label: 'IKEA POÄNG armchair', inches: [26.75, 39.375, 32.25], color: '#c9baa2',
  url: 'https://www.ikea.com/us/en/p/poaeng-armchair-birch-veneer-gunnared-beige-s69501981/',
 },
 lackTable: {
  label: 'IKEA LACK coffee table', inches: [35.375, 17.75, 21.625], color: '#3b302b', model: 'table',
  url: 'https://www.ikea.com/us/en/p/lack-coffee-table-black-brown-40104294/',
 },
 lackUnit: {
  label: 'IKEA LACK TV bench', inches: [63, 14.125, 13.75], color: '#3b302b',
  url: 'https://www.ikea.com/us/en/p/lack-tv-unit-black-brown-60566062/',
 },
 samsungQ6F: {
  label: 'Samsung Q6F 55″ TV', inches: [48.2, 27.9, 3], color: '#343b43', mount: 'wall',
  url: 'https://www.samsung.com/us/tvs/qled-tv/55-inch-class-qled-4k-tv-sku-qn55q6faafxza/',
 },
 lgC4: {
  label: 'LG C4 65″ OLED TV', inches: [56.7, 32.5, 1.8], color: '#2d3643', mount: 'wall',
  url: 'https://www.lg.com/us/tvs/lg-oled65c4pua-oled-4k-tv',
 },
 sofa: {label: 'Sofa', size: [.30, .12, .12], color: '#7e9886'},
 chair: {label: 'Armchair', size: [.14, .13, .13], color: '#bc795b'},
 table: {label: 'Coffee table', size: [.19, .065, .11], color: '#a9784f'},
 console: {label: 'Media console', size: [.24, .065, .08], color: '#95714f'},
 rug: {label: 'Area rug', size: [.34, .005, .26], color: '#b5986d'},
 lamp: {label: 'Floor lamp', size: [.075, .24, .075], color: '#e4ceb0'},
 plant: {label: 'Potted plant', size: [.09, .17, .09], color: '#527c52'},
};

function furnitureDimensions(item, span) {
 const {size, inches} = furnitureCatalog[item.kind];
 if(inches && roomScale) return inches.map(value=>value*.0254/roomScale.metersPerUnit*item.scale);
 return (size || inches.map(value => value/280)).map(value => value * span * item.scale);
}

function isWallItem(item) {
 return furnitureCatalog[item?.kind]?.mount === 'wall';
}

function furnitureAxes(item, surface) {
 if (isWallItem(item)) {
  const up = referenceFloor()?.normal;
  const sign = !up || dot(up, surface.v) < 0 ? -1 : 1;
  return [surface.u, mul(surface.v, sign), surface.normal];
 }
 const floor = surface;
 const cosine = Math.cos(item.angle), sine = Math.sin(item.angle);
 return [
  add(mul(floor.u, cosine), mul(floor.v, sine)),
  floor.normal,
  add(mul(floor.u, -sine), mul(floor.v, cosine)),
 ];
}

function surfaceContains(surface, [u,v]) {
 return surface.polygon.every(([a,b], i) => {
  const [c,d] = surface.polygon[(i+1) % surface.polygon.length];
  return (c-a)*(v-b)-(d-b)*(u-a) >= -1e-7;
 });
}

function furnitureFits(surface, item, span) {
 const [width,height,depth] = furnitureDimensions(item, span);
 const {u,v} = item;
 if (isWallItem(item)) {
  const left=u-width/2, right=u+width/2, top=v-height/2, bottom=v+height/2;
  return [[left,top],[right,top],[right,bottom],[left,bottom]].every(point => surfaceContains(surface,point)) &&
   !surface.openings.some(({enabled,bounds:[x0,y0,x1,y1]}) =>
    enabled && left<x1 && right>x0 && top<y1 && bottom>y0);
 }
 const cosine = Math.cos(item.angle), sine = Math.sin(item.angle);
 return [-width/2,width/2].every(x => [-depth/2,depth/2].every(z =>
  surfaceContains(surface,[u+x*cosine-z*sine,v+x*sine+z*cosine])));
}

function furnitureHit(ray, item, surface, span) {
 const center = world(surface, [item.u, item.v]);
 const relative = sub(ray.origin, center);
 const [width, height, depth] = furnitureDimensions(item, span);
 const mounted = isWallItem(item);
 const low = [-width/2, mounted ? -height/2 : 0, mounted ? 0 : -depth/2];
 const high = [width/2, mounted ? height/2 : height, mounted ? depth : depth/2];
 let start = 0, end = Infinity;
 for (const [i, axis] of furnitureAxes(item, surface).entries()) {
  const origin = dot(relative, axis), direction = dot(ray.direction, axis);
  if (Math.abs(direction) < 1e-8) {
   if (origin < low[i] || origin > high[i]) return Infinity;
   continue;
  }
  const a = (low[i]-origin)/direction, b = (high[i]-origin)/direction;
  start = Math.max(start, Math.min(a,b));
  end = Math.min(end, Math.max(a,b));
  if (start > end) return Infinity;
 }
 return start;
}

function furnitureMesh(item, surface, span, selected = false) {
 const dimensions = furnitureDimensions(item, span);
 const axes = furnitureAxes(item, surface);
 const mounted = isWallItem(item);
 const base = world(surface, [item.u, item.v]);
 const origin = mounted ? add(base, mul(surface.normal, span*.0002)) : base;
 const mirrored = dot(cross(axes[0], axes[1]), axes[2]) < 0;
 const mesh = [];
 const wood = '#624735', dark = '#272627', brass = '#81715a';
 const transform = ([x,y,z]) => add(origin, add(
  mul(axes[0], x*dimensions[0]), add(mul(axes[1], y*dimensions[1]), mul(axes[2], z*dimensions[2]))));
 function triangle(local, color) {
  const points = local.map(transform);
  if (mirrored) [points[1], points[2]] = [points[2], points[1]];
  const normal = cross(sub(points[1],points[0]), sub(points[2],points[0]));
  const area = Math.hypot(...normal);
  if (area < 1e-10) return;
  const brightness = .66 + .34*Math.max(0, dot(normal, [.35,-.88,-.32])/area);
  const rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255);
  mesh.push({points, rgb:rgb.map((channel,i) => Math.min(1, channel*brightness + (selected ? [.085,.072,.028][i] : 0)))});
 }
 function solid(rings, color) {
  const sides = rings[0].length;
  for (let layer=1;layer<rings.length;layer++) {
   for (let i=0;i<sides;i++) {
    const next=(i+1)%sides, low=rings[layer-1], high=rings[layer];
    triangle([low[i], high[i], low[next]], color);
    triangle([low[next], high[i], high[next]], color);
   }
  }
  const bottom=rings[0], top=rings.at(-1);
  for(let i=1;i<sides-1;i++) {
   triangle([bottom[0],bottom[i],bottom[i+1]],color);
   triangle([top[0],top[i+1],top[i]],color);
  }
 }
 function box(x,y,z,w,h,d,color,bevel=.10) {
  const edge = Math.min(w,d)*bevel, lip=Math.min(h*.18,edge);
  const ring = (level,inset) => {
   const a=w/2-inset,b=d/2-inset,c=Math.min(edge,a*.4,b*.4);
   return [[-a+c,-b],[a-c,-b],[a,-b+c],[a,b-c],[a-c,b],[-a+c,b],[-a,b-c],[-a,-b+c]]
    .map(([u,v])=>[x+u,y+level,z+v]);
  };
  solid([ring(0,lip/2),ring(lip,0),ring(h-lip,0),ring(h,lip/2)],color);
 }
 function round(x,y,z,w,h,d,color,top=1) {
  const ring=(level,factor)=>Array.from({length:12},(_,i)=>{
   const angle=i*Math.PI/6;
   return [x+Math.cos(angle)*w/2*factor,y+level,z+Math.sin(angle)*d/2*factor];
  });
  solid([ring(0,1),ring(h,top)],color);
 }
 const fabric=item.color;
 if (mounted) {
  const oled = item.kind === 'lgC4';
  box(0,-.22,.12,.34,.36,.24,dark);
  box(0,-.49,.36,oled ? .65 : .92,oled ? .61 : .90,.60,'#24282b',.035);
  box(0,-.5,.79,1,1,.36,'#141719',.025);
  box(0,-.482,.98,oled ? .982 : .970,.964,.04,fabric,.025);
  return mesh;
 }
 const model = furnitureCatalog[item.kind].model || item.kind;
 switch(model){
  case 'sofa':
  case 'chair': {
   box(0,.09,0,.96,.32,.91,fabric);
   box(0,.35,-.34,.9,.65,.26,fabric,.22);
   for(const side of [-1,1]) box(side*.426,.33,0,.148,.31,.88,fabric,.24);
   const cushions=model==='sofa'?(item.kind==='kivik'?2:3):1;
   for(let i=0;i<cushions;i++) box(((i+.5)/cushions-.5)*.69,.40,.06,.68/cushions,.14,.59,fabric,.22);
   for(const x of [-.36,.36]) for(const z of [-.32,.32]) box(x,0,z,.07,.12,.075,wood);
   break;
  }
  case 'poang': {
   const birch = '#bd9568';
   for (const x of [-.42,.42]) {
    box(x,0,.06,.11,.06,.88,birch);
    for (let i=0;i<6;i++) box(x,.05+i*.075,.39-i*.044,.11,.085,.14,birch);
    box(x,.53,-.02,.12,.05,.74,birch);
   }
   box(0,.38,.105,.72,.115,.66,fabric,.18);
   for (let i=0;i<5;i++) box(0,.47+i*.103,-.20-i*.052,.72,.118,.18,fabric,.22);
   box(0,.90,-.417,.69,.10,.165,fabric,.24);
   break;
  }
  case 'table': {
   const legs = item.kind === 'lackTable' ? fabric : wood;
   box(0,.82,0,1,.18,1,fabric,.10);
   for(const x of [-.40,.40]) for(const z of [-.36,.36]) box(x,0,z,.105,.84,.12,legs);
   break;
  }
  case 'lackUnit':
   box(0,.81,0,1,.19,1,fabric);
   box(0,.19,0,.89,.13,.98,fabric);
   for(const x of [-.452,.452]) box(x,0,0,.096,.83,.97,fabric);
   break;
  case 'console':
   box(0,.11,0,1,.89,1,fabric);
   for(const x of [-.32,0,.32]) box(x,.24,.497,.29,.58,.006,wood);
   for(const x of [-.38,.38]) for(const z of [-.35,.35]) box(x,0,z,.065,.14,.08,dark);
   break;
  case 'rug':
   box(0,.08,0,1,.65,1,fabric,.07);
   box(0,.73,0,.88,.20,.88,'#c9b491',.06);
   break;
  case 'lamp':
   round(0,0,0,.73,.03,.73,brass);
   round(0,.025,0,.09,.75,.09,brass);
   round(0,.72,0,1,.28,1,fabric,.63);
   break;
  case 'plant':
   round(0,0,0,.48,.31,.48,'#a57962',1.22);
   round(0,.29,0,.56,.035,.56,wood);
   round(0,.30,0,.07,.48,.07,'#69553d');
   for(const [x,y,z] of [[-.25,.43,.04],[.24,.50,.10],[.05,.63,-.24],[-.12,.75,.18],[.14,.84,-.06]]){
    round(x,y,z,.44,.13,.38,fabric,.60);
   }
 }
 return mesh;
}

let selectedFurniture = null, placingFurniture = false, furnitureCache;
const referenceFloor = () => original.surfaces.find(surface => surface.kind === 'floor');
const furnishingFloor = () => shell.surfaces.find(surface => surface.kind === 'floor' && surface.enabled);
const furnishingWalls = () => shell.surfaces.filter(surface => surface.kind === 'wall' && surface.enabled);
const furnitureItems = () => shell.furniture ||= [];
const currentFurniture = () => furnitureItems().find(item => item.id === selectedFurniture);

function floorSpan() {
 const floor = referenceFloor();
 if (!floor) return data.radius*2;
 const [left,top,right,bottom] = bounds(floor);
 return Math.max(right-left,bottom-top);
}

function furnitureSurface(item) {
 return isWallItem(item) ? furnishingWalls().find(wall => wall.id === item.wallId) : furnishingFloor();
}

function furnitureIsVisible(item, surface, span) {
 return Boolean(surface) && (!isWallItem(item) || furnitureFits(surface,item,span));
}

function surfaceIntersection(ray, surface) {
 const base = world(surface, [0,0]), denominator = dot(ray.direction, surface.normal);
 if (Math.abs(denominator) < 1e-8) return null;
 const distance = dot(sub(base,ray.origin),surface.normal)/denominator;
 if (distance <= 0) return null;
 const local = sub(add(ray.origin,mul(ray.direction,distance)),base);
 return {uv:[dot(local,surface.u),dot(local,surface.v)],distance,surface};
}

function surfaceAtRay(ray, surfaces = shell.surfaces) {
 let nearest = null;
 for (const surface of surfaces) {
  if (!surface.enabled) continue;
  const hit = surfaceIntersection(ray,surface);
  if (hit && surfaceContains(surface,hit.uv) && (!nearest || hit.distance<nearest.distance)) nearest=hit;
 }
 return nearest;
}

function wallAtRay(ray, surfaces) {
 const hit = surfaceAtRay(ray,surfaces);
 return hit?.surface.kind === 'wall' ? hit : null;
}

function overlapsWallItem(surface,item,span,neighbors) {
 const [width,height] = furnitureDimensions(item,span);
 return neighbors.some(other => {
  if (other.id === item.id || other.wallId !== surface.id) return false;
  const [otherWidth,otherHeight] = furnitureDimensions(other,span);
  return Math.abs(item.u-other.u) < (width+otherWidth)/2 &&
   Math.abs(item.v-other.v) < (height+otherHeight)/2;
 });
}

function placedFurnitureMeshes(visibleSurfaces) {
 const span = floorSpan();
 const placed = furnitureItems().map(item => ({item,surface:furnitureSurface(item)}))
  .filter(({surface})=>visibleSurfaces.includes(surface));
 const key = JSON.stringify([selectedFurniture, placed.map(({item,surface}) =>
  [item,surface?.offset,isWallItem(item) ? surface?.polygon : null,isWallItem(item) ? surface?.openings : null])]);
 if (furnitureCache?.key === key) return furnitureCache.objects;
 const objects = placed.flatMap(({item,surface}) => furnitureIsVisible(item,surface,span) ? furnitureMesh(
  item,surface,span,item.id === selectedFurniture) : []);
 furnitureCache = {key, objects};
 return objects;
}

function productLink(id, catalog) {
 const link = el(id);
 link.hidden = !catalog?.url;
 if (catalog?.url) {
  link.href = catalog.url;
  link.textContent = 'View ' + catalog.label + ' ↗';
 } else link.removeAttribute('href');
}

function furnitureStorageKey() {
 const version = original.layoutVersion ? '.layout-' + original.layoutVersion : '';
 return data.listingId && 'sru.photo-room.' + data.listingId + '.' + (data.roomId || 'living') + version;
}

let savedFurnitureState = '';
function saveFurniture() {
 const key = furnitureStorageKey();
 if (!key) return;
 const state = JSON.stringify(furnitureItems());
 if (state === savedFurnitureState) return;
 try {
  localStorage.setItem(key,state);
  savedFurnitureState=state;
  el('furniture-save-state').textContent='Furniture saved on this device';
 } catch { el('furniture-save-state').textContent='Device storage is unavailable. Download your layout to keep it.'; }
}

function restoreFurniture() {
 const key=furnitureStorageKey();
 if (!key || furnitureItems().length) return;
 try {
  const stored=JSON.parse(localStorage.getItem(key) || '[]');
  if (!Array.isArray(stored)) return;
  const ids=new Set();
  shell.furniture=stored.filter(item=>{
   if (!item || !furnitureCatalog[item.kind] || ids.has(item.id) ||
    !Number.isInteger(item.id) || item.id<=0 || !/^#[0-9a-f]{6}$/i.test(item.color) ||
    ![item.u,item.v,item.angle,item.scale].every(Number.isFinite) || item.scale<.45 || item.scale>1.6) return false;
   const surface=furnitureSurface(item);
   if (!surface) return false;
   ids.add(item.id);
   return true;
  });
 } catch { /* Saved layouts can be absent or from an older version. */ }
}

function syncFurniture() {
 saveFurniture();
 const list = el('furniture-list');
 const item = currentFurniture();
 const catalog = furnitureCatalog[el('furniture-kind').value];
 const wallItem = isWallItem(item);
 const surface = item && furnitureSurface(item);
 list.replaceChildren(new Option('Select an item', ''));
 furnitureItems().forEach((entry,index) => list.add(new Option(
  furnitureCatalog[entry.kind].label + ' · ' + (index+1), entry.id)));
 list.value = item ? String(item.id) : '';
 el('furniture-add').disabled = catalog.mount === 'wall' ? !furnishingWalls().length : !furnishingFloor();
 el('furniture-add').textContent = catalog.mount === 'wall' ? 'Add to wall' : 'Add furniture';
 el('furniture-specs').textContent = catalog.inches ? catalog.inches.join(' × ') + ' in (W × H × D)' : '';
 productLink('catalog-link',catalog);
 productLink('selected-product-link',furnitureCatalog[item?.kind]);
 el('furniture-move').textContent = wallItem ? 'Move on wall' : 'Move on floor';
 el('furniture-move').disabled = !item || (!wallItem && !surface) || (wallItem && !furnishingWalls().length);
 for (const id of ['furniture-left','furniture-right']) el(id).disabled = !surface || wallItem;
 for (const id of ['furniture-size','furniture-color']) el(id).disabled = !surface;
 el('furniture-remove').disabled = !item;
 el('furniture-size').value = item ? Math.round(item.scale*100) : 100;
 el('furniture-color').value = item?.color || '#7e9886';
 el('furniture-move').setAttribute('aria-pressed', String(placingFurniture));
 cloud.classList.toggle('place-furniture', placingFurniture);
 schedule();
}

function changeFurniture(changes, announce = true) {
 const item = currentFurniture();
 if (!item) return false;
 const next = {...item,...changes};
 const surface = furnitureSurface(next);
 const span = floorSpan();
 if (!surface || !furnitureFits(surface,next,span) ||
  (isWallItem(item) && overlapsWallItem(surface,next,span,furnitureItems()))) {
  if (announce) el('furniture-status').textContent = isWallItem(item)
   ? 'Choose a clear wall spot away from openings and other TVs.'
   : 'Choose a spot where the entire item fits on the reconstructed floor.';
  return false;
 }
 Object.assign(item,changes);
 saveFurniture();
 if (announce) {
  el('furniture-status').textContent = furnitureCatalog[item.kind].label + ' updated.';
  syncFurniture();
 } else schedule();
 return true;
}

function findFurniturePosition(item, surfaces) {
 const span = floorSpan(), camera = photoRay(data.width/2,data.height/2).origin;
 const mounted = isWallItem(item), projection = pixelProjection(true);
 let best = null, bestScore = -Infinity;
 for (const surface of surfaces) {
  const [left,top,right,bottom] = bounds(surface);
  const midU = (left+right)/2, midV = top+(bottom-top)*(mounted ? .54 : .5);
  const towardsPhoto = sub(camera,world(surface,[midU,midV]));
  const angle = mounted ? 0 : Math.atan2(-dot(towardsPhoto,surface.u),dot(towardsPhoto,surface.v));
  const neighbors = furnitureItems().filter(entry => furnitureSurface(entry) === surface && entry.kind !== 'rug');
  for (let i=1;i<16;i++) for (let j=1;j<16;j++) {
   const u = left+(right-left)*i/16, v = top+(bottom-top)*j/16;
   const candidate = {...item,u,v,angle};
   if (!furnitureFits(surface,candidate,span) ||
    (mounted && overlapsWallItem(surface,candidate,span,neighbors))) continue;
   const nearest = Math.min(.22*span,...neighbors.map(entry => Math.hypot(u-entry.u,v-entry.v)));
   let score = nearest - .35*Math.hypot(u-midU,v-midV);
   if (mounted) {
    const point = world(surface,[u,v]);
    const [x,y,z] = projection(point);
    const inPhoto = z>0 && x/z>data.width*.08 && x/z<data.width*.92 && y/z>data.height*.08 && y/z<data.height*.92;
    if (inPhoto) {
     const ray = {origin:camera,direction:sub(point,camera)};
     if (wallAtRay(ray)?.surface === surface) score += .35*span;
    }
    score += .1*span*Math.max(0,dot(surface.normal,towardsPhoto)/Math.hypot(...towardsPhoto));
    candidate.wallId = surface.id;
   }
   if (score>bestScore) {
    best=candidate;
    bestScore=score;
   }
  }
 }
 return best;
}

function addFurniture() {
 const kind = el('furniture-kind').value, catalog = furnitureCatalog[kind];
 const mounted = catalog.mount === 'wall';
 const floor = furnishingFloor();
 const surfaces = mounted ? previewSurfaces().filter(surface=>surface.kind==='wall'&&surface.enabled) : floor ? [floor] : [];
 const item = findFurniturePosition({
  id:1+Math.max(0,...furnitureItems().map(entry=>entry.id)),
  kind,scale:1,color:catalog.color,
 },surfaces);
 if (!item) {
  el('furniture-status').textContent = mounted
   ? 'No clear fitted wall area is large enough for this TV.'
   : 'There is no fitted floor area large enough for this item.';
  return;
 }
 furnitureItems().push(item);
 selectedFurniture = item.id;
 placingFurniture = false;
 el('furniture-status').textContent = catalog.label + (mounted
  ? ' mounted. Drag along this wall or choose Move on wall.'
  : ' added. Drag it in the view or choose Move on floor.');
 syncFurniture();
}

function setupFurniture() {
 el('furniture-kind').replaceChildren();
 for (const [label,match] of [
  ['IKEA furniture',entry=>entry.url?.startsWith('https://www.ikea.com/')],
  ['Wall-mounted TVs',entry=>entry.mount==='wall'],
  ['Other furniture',entry=>!entry.url],
 ]) {
  const group = document.createElement('optgroup');
  group.label = label;
  for (const [key,entry] of Object.entries(furnitureCatalog)) {
   if (match(entry)) group.append(new Option(entry.label,key));
  }
  el('furniture-kind').append(group);
 }
 el('furniture-kind').onchange = syncFurniture;
 el('furniture-add').onclick = addFurniture;
 el('furniture-list').onchange = () => {
  selectedFurniture = Number(el('furniture-list').value) || null;
  placingFurniture = false;
  syncFurniture();
 };
 el('furniture-move').onclick = () => {
  placingFurniture = !placingFurniture;
  el('furniture-status').textContent = !placingFurniture ? 'Placement canceled.' : isWallItem(currentFurniture())
   ? 'Click a clear spot on any visible wall, or use arrow keys on the current wall.'
   : 'Click the floor or use arrow keys to move the selected item.';
  syncFurniture();
  if (placingFurniture) cloud.focus();
 };
 for (const [id,sign] of [['furniture-left',-1],['furniture-right',1]]) {
  el(id).onclick = () => changeFurniture({angle:currentFurniture().angle+sign*Math.PI/12});
 }
 el('furniture-size').oninput = () => {
  if (!changeFurniture({scale:Number(el('furniture-size').value)/100},false)) syncFurniture();
 };
 el('furniture-color').oninput = () => changeFurniture({color:el('furniture-color').value},false);
 el('furniture-remove').onclick = () => {
  shell.furniture = furnitureItems().filter(item=>item.id!==selectedFurniture);
  selectedFurniture = null;
  placingFurniture = false;
  el('furniture-status').textContent = 'Item removed.';
  syncFurniture();
 };
 syncFurniture();
}

const el=id=>document.getElementById(id),original=structuredClone(data.shell);
const completion=original.completion;
let shell=structuredClone(original),photoMode=false,yaw=-.62,pitch=.52,zoom=1.24,pending=false,marking=false,corner=null,cursor=[data.width/2,data.height/2],image=null,imageGeneration=0;
const orbitTarget={yaw,pitch,zoom};
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let lastOrbitFrame=0;
const photo=el('photo'),cloud=el('cloud'),pc=photo.getContext('2d'),gc=cloud.getContext('2d');for(const c of [photo,cloud]){c.width=data.width;c.height=data.height;}
const referencePanel=el('photo-reference')||photo.closest('details');
const geometryPanel=el('geometry-controls')||el('surface').closest('details');
const referenceStatus=el('photo-status');
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,k)=>a.map(x=>x*k),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const orbitBasis=(()=>{
 const floor=referenceFloor();
 if(!completion||!floor)return [[1,0,0],[0,1,0],[0,0,1]];
 const down=mul(floor.normal,-1), initialForward=data.views[0].pose[2].slice(0,3);
 const levelForward=sub(initialForward,mul(down,dot(initialForward,down)));
 const length=Math.hypot(...levelForward);
 const forward=length>.01?mul(levelForward,1/length):floor.v;
 return [cross(down,forward),down,forward];
})();
const face=()=>shell.surfaces[Number(el('surface').value)],opening=()=>face().openings[Number(el('opening').value)],view=()=>data.views[Number(el('view').value)];
const finishCanvas=el('finish-canvas'), displayControl=el('display');
const photoOptions=[...displayControl.querySelectorAll('option[value="photo"],option[value="match"]')];
if(!data.points.length){
 for(const option of displayControl.querySelectorAll('option[value="both"],option[value="points"]'))option.remove();
 displayControl.value='shell';
}
finishCanvas.width=data.width;
finishCanvas.height=data.height;
new ResizeObserver(([entry])=>{
 const scale=Math.min(devicePixelRatio||1,2);
 const width=Math.min(1600,Math.max(data.width,Math.round(entry.contentRect.width*scale)));
 if(finishCanvas.width===width)return;
 finishCanvas.width=width;
 finishCanvas.height=Math.round(width*data.height/data.width);
 schedule();
}).observe(cloud);
let drawFinishes=null;
function disableFinishes(){
 drawFinishes=null;
 for(const option of photoOptions){option.disabled=true;option.hidden=true;}
 if(['match','photo'].includes(displayControl.value))displayControl.value='shell';
}
if(Object.keys(data.finishes||{}).length){
 try{drawFinishes=createPhotoRenderer(finishCanvas,data.finishes,schedule);}catch(error){console.warn('Photo finishes unavailable',error);}
 if(drawFinishes){
  for(const option of photoOptions){option.hidden=false;option.disabled=false;}
  displayControl.value='photo';
  finishCanvas.addEventListener('webglcontextlost',()=>{disableFinishes();schedule();});
 }
}
function bounds(f){return [Math.min(...f.polygon.map(p=>p[0])),Math.min(...f.polygon.map(p=>p[1])),Math.max(...f.polygon.map(p=>p[0])),Math.max(...f.polygon.map(p=>p[1]))];}
function world(f,p){return add(add(add(f.origin,mul(f.normal,f.offset)),mul(f.u,p[0])),mul(f.v,p[1]));}
function pixelProjection(usePhoto){
 if(usePhoto){
  const pose=view().pose;
  const k=view().intrinsics;
  const cameraX=pose[0].slice(0,3),cameraY=pose[1].slice(0,3),cameraZ=pose[2].slice(0,3);
  return point=>{
   const x=dot(cameraX,point)+pose[0][3],y=dot(cameraY,point)+pose[1][3],z=dot(cameraZ,point)+pose[2][3];
   return [k[0][0]*x+k[0][1]*y+k[0][2]*z,k[1][0]*x+k[1][1]*y+k[1][2]*z,z];
  };
 }
 const yawCos=Math.cos(yaw),yawSin=Math.sin(yaw),pitchCos=Math.cos(pitch),pitchSin=Math.sin(pitch);
 const focal=data.width*.9, distance=orbitRadius*2.8/zoom;
 return point=>{
  const relative=sub(point,orbitCenter);
  const [dx,dy,dz]=orbitBasis.map(axis=>dot(relative,axis));
  const x=yawCos*dx-yawSin*dz;
  const rotatedZ=yawSin*dx+yawCos*dz;
  const y=pitchCos*dy-pitchSin*rotatedZ;
  const z=pitchSin*dy+pitchCos*rotatedZ+distance;
  return [data.width/2*z+x*focal,data.height/2*z+y*focal,z];
 };
}
const automaticSpan = Number(completion?.spanMeters ?? data.scale?.spanMeters);
const scaleKey = data.listingId && 'sru.photo-scale.' + data.listingId + '.' + data.roomId +
 (original.layoutVersion ? '.layout-' + original.layoutVersion : '');
let roomScale = null;
let orbitCenter = data.center;
let orbitRadius = data.radius;

function updateScale(feet, source) {
 const span = floorSpan();
 roomScale = Number.isFinite(feet) && feet>=2 && feet<=100 && span>0
  ? {metersPerUnit:feet*.3048/span,spanFeet:feet,source}
  : null;
 shell.planningScale = roomScale;
 furnitureCache = null;
 let status = roomScale
  ? 'Longest floor span ' + feet.toFixed(1) + ' ft · ' + source
  : 'Relative planning scale';
 if (roomScale && [completion?.widthM,completion?.depthM,completion?.heightM,automaticSpan].every(value=>Number.isFinite(value)&&value>0)) {
  const dimensions=[completion.widthM,completion.depthM,completion.heightM]
   .map(meters=>(meters*feet/automaticSpan).toFixed(1)+' ft');
  const height=completion.ceilingShape==='vaulted'?'peak height':'height';
  status=dimensions.join(' × ')+` (width × depth × ${height}) · `+source;
  if(source!=='span entered by user'&&completion.heightSource&&!['listed-height','photo-vault-peak'].includes(completion.heightSource)) {
   status+=' · estimated height';
  }else if(source!=='span entered by user'&&completion.heightSource==='photo-vault-peak'){
   status+=' · estimated peak';
  }
 }
 el('room-scale-status').textContent=status;
 el('room-span-ft').value=roomScale ? feet.toFixed(2) : '';
 schedule();
}

function autoScale() {
 if(!completion&&original.units==='meters'){
  updateScale(floorSpan()/.3048,'calibrated reference');
 }else{
  const source=completion?.source||data.scale?.source;
  const labels={
   'listed-room':'listed width and depth',
   'preset':'typical room estimate',
   'photo-floor-and-typical-area':'photo proportions with typical room area',
   'photo-floor-and-listing-area':'photo proportions with estimated listing area',
   'photo-floor-and-listed-height':'photo proportions scaled to listed height',
   'typical-height-scale':'photo proportions scaled to typical ceiling height',
   'calibrated-reference':'calibrated reference',
  };
  const label=labels[source]||'estimated from listing area';
  updateScale(automaticSpan/.3048,label);
 }
}

function fitOrbit() {
 const points=shell.surfaces.filter(surface=>surface.enabled)
  .flatMap(surface=>surface.polygon.map(point=>world(surface,point)));
 if(!points.length)return;
 orbitCenter=[0,1,2].map(axis=>{
  const coordinates=points.map(point=>point[axis]);
  return (Math.min(...coordinates)+Math.max(...coordinates))/2;
 });
 orbitRadius=Math.max(...points.map(point=>Math.hypot(...sub(point,orbitCenter))));
 const halfAngle=Math.atan(Math.min(data.width,data.height)/(2*data.width*.9));
 zoom=2.8*Math.sin(halfAngle)*.85;
 orbitTarget.zoom=zoom;
 showOrbit();
 if(drawFinishes)displayControl.value='photo';
 schedule();
}

function showOrbit() {
 photoMode=false;
 if(displayControl.value==='match')displayControl.value=drawFinishes?'photo':'shell';
}

let sourceProjection,sceneProjection;
function project(point,alwaysPhoto=false){
 const [x,y,z]=(alwaysPhoto?sourceProjection:sceneProjection)(point);
 return z>.0001?[x/z,y/z,z]:null;
}
function clipPosition(point){
 const [x,y,z]=sceneProjection(point);
 const near=Math.max(.0001,data.radius*.004),far=Math.max(near*2,data.radius*32);
 return [2*x/data.width-z,z-2*y/data.height,((far+near)*z-2*far*near)/(far-near),z];
}
function photoRay(x,y){
 const pose=view().pose,k=view().intrinsics;
 const cy=(y-k[1][2])/k[1][1],cx=(x-k[0][2]-k[0][1]*cy)/k[0][0];
 return {
  origin:[0,1,2].map(j=>-dot(pose.map(row=>row[j]),pose.map(row=>row[3]))),
  direction:[0,1,2].map(j=>pose[0][j]*cx+pose[1][j]*cy+pose[2][j]),
 };
}
function previewRay(x,y){
 if(photoMode)return photoRay(x,y);
 function inverse([x,y,z]){
  const rz=-Math.sin(pitch)*y+Math.cos(pitch)*z;
  const local=[Math.cos(yaw)*x+Math.sin(yaw)*rz,Math.cos(pitch)*y+Math.sin(pitch)*z,
   -Math.sin(yaw)*x+Math.cos(yaw)*rz];
  return [0,1,2].map(i=>local.reduce((sum,value,j)=>sum+value*orbitBasis[j][i],0));
 }
 const focal=data.width*.9;
 return {
  origin:add(orbitCenter,inverse([0,0,-orbitRadius*2.8/zoom])),
  direction:inverse([(x-data.width/2)/focal,(y-data.height/2)/focal,1]),
 };
}
function previewSurfaces() {
 if(photoMode || !completion)return shell.surfaces;
 const eye=previewRay(data.width/2,data.height/2).origin;
 return shell.surfaces.filter(surface=>{
  if(surface.kind==='ceiling'||surface.kind==='sloped_ceiling')return false;
  if(surface.kind!=='wall')return true;
  const side=dot(sub(eye,world(surface,[0,0])),surface.normal);
  // Closed rooms have inward-facing planes. Hide walls between the eye and the interior.
  return side>=-orbitRadius*.015;
 });
}
function animateOrbit(timestamp){
 if(photoMode){lastOrbitFrame=0;return false;}
 const elapsed=lastOrbitFrame?Math.min(timestamp-lastOrbitFrame,48):16;
 const amount=reducedMotion.matches?1:1-Math.exp(-elapsed/48);
 yaw+=(orbitTarget.yaw-yaw)*amount;
 pitch+=(orbitTarget.pitch-pitch)*amount;
 zoom+=(orbitTarget.zoom-zoom)*amount;
 const moving=Math.max(Math.abs(yaw-orbitTarget.yaw),Math.abs(pitch-orbitTarget.pitch),Math.abs(zoom-orbitTarget.zoom))>.0005;
 if(!moving){({yaw,pitch,zoom}=orbitTarget);lastOrbitFrame=0;}
 else lastOrbitFrame=timestamp;
 return moving;
}
function clip(subject,polygon){let result=subject;for(let j=0;j<polygon.length;j++){const a=polygon[j],b=polygon[(j+1)%polygon.length],side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),out=[];if(!result.length)break;let prev=result[result.length-1];for(const curr of result){const sp=side(prev),sc=side(curr);if((sc>=-1e-9)!==(sp>=-1e-9))out.push([prev[0]+(curr[0]-prev[0])*sp/(sp-sc),prev[1]+(curr[1]-prev[1])*sp/(sp-sc)]);if(sc>=-1e-9)out.push(curr);prev=curr;}result=out;}return result;}
function triangles(f){
 if(!f.enabled)return [];
 const [x0,y0,x1,y1]=bounds(f),holes=f.openings.filter(o=>o.enabled).map(o=>o.bounds);
 const xs=[...new Set([x0,x1,...holes.flatMap(h=>[Math.max(x0,Math.min(x1,h[0])),Math.max(x0,Math.min(x1,h[2]))])])].sort((a,b)=>a-b);
 const ys=[...new Set([y0,y1,...holes.flatMap(h=>[Math.max(y0,Math.min(y1,h[1])),Math.max(y0,Math.min(y1,h[3]))])])].sort((a,b)=>a-b),out=[];
 for(let i=0;i<xs.length-1;i++)for(let j=0;j<ys.length-1;j++){
  const a=xs[i],b=xs[i+1],c=ys[j],d=ys[j+1],cx=(a+b)/2,cy=(c+d)/2;
  if(holes.some(h=>cx>h[0]&&cx<h[2]&&cy>h[1]&&cy<h[3]))continue;
  const polygon=clip([[a,c],[b,c],[b,d],[a,d]],f.polygon).map(p=>world(f,p));
  for(let k=1;k<polygon.length-1;k++){
   const triangle=[polygon[0],polygon[k],polygon[k+1]];
   if(Math.hypot(...cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0])))>1e-10)out.push(triangle);
  }
 }
 return out;
}
const triangleCache=new WeakMap();
function roomTriangles(surface){
 const revision=JSON.stringify([surface.enabled,surface.offset,surface.openings.map(opening=>[opening.enabled,opening.bounds])]);
 const previous=triangleCache.get(surface);
 if(previous?.polygon===surface.polygon&&previous.revision===revision)return previous.mesh;
 const mesh=triangles(surface);
 triangleCache.set(surface,{polygon:surface.polygon,revision,mesh});
 return mesh;
}
function outline(context,points,color,dashed=false){const ps=points.map(p=>project(p,true));if(ps.some(p=>!p))return;context.beginPath();ps.forEach((p,i)=>i?context.lineTo(p[0],p[1]):context.moveTo(p[0],p[1]));context.closePath();context.strokeStyle=color;context.lineWidth=2;context.setLineDash(dashed?[5,4]:[]);context.stroke();context.setLineDash([]);}
const hasWindowPhotos=Object.keys(data.finishes||{}).some(id=>id.startsWith('window:'));

el('window-photos').onchange=schedule;
function photoSurfaces(surfaces){
 if(!el('window-photos').checked)return surfaces;
 const windows=[];
 for(const face of surfaces){
  if(!face.enabled)continue;
  for(const opening of face.openings){
   const id='window:'+opening.id;
   if(!opening.enabled||opening.kind!=='window'||!data.finishes[id])continue;
   const [left,top,right,bottom]=opening.bounds;
   const polygon=clip([[left,top],[right,top],[right,bottom],[left,bottom]],face.polygon);
   if(polygon.length>=3)windows.push({...face,id,polygon,openings:[],finishBounds:opening.bounds});
  }
 }
 return surfaces.concat(windows);
}
function render(timestamp){
 pending=false;
 if(animateOrbit(timestamp))schedule();
 sourceProjection=pixelProjection(true);
 sceneProjection=photoMode?sourceProjection:pixelProjection(false);
 const f=face();
 if(image&&referencePanel?.open){
  pc.drawImage(image,0,0);
  if(marking||geometryPanel?.open){
   outline(pc,f.polygon.map(p=>world(f,p)),'#ffe174');
   for(const o of f.openings){const [a,b,c,d]=o.bounds;outline(pc,[[a,b],[c,b],[c,d],[a,d]].map(p=>world(f,p)),o.enabled?'#8ce6f3':'#ff9c91',!o.enabled);}
   if(corner){const p=project(world(f,corner),true);if(p){pc.fillStyle='#ffe174';pc.fillRect(p[0]-4,p[1]-4,8,8);}}
  }
 }
 const display=displayControl.value, textured=['match','photo'].includes(display)&&Boolean(drawFinishes);
 const overPhoto=display==='match'&&photoMode&&Boolean(image);
 finishCanvas.hidden=!textured;
 el('finish-note').hidden=!textured&&!overPhoto;
 el('match-note').hidden=!overPhoto;
 el('surface-note').hidden=overPhoto;
 el('windows-control').style.display=overPhoto||!hasWindowPhotos?'none':'';
 el('orbit').hidden=!photoMode;
 el('mode').textContent=overPhoto?'Listing photo + 3D furniture':photoMode?'Room from the photo camera':completion?'Editable 3D room':'Editable 3D room preview';
 const surfaces=previewSurfaces(),objects=placedFurnitureMeshes(surfaces);
 if(textured){
  if(overPhoto)gc.drawImage(image,0,0,cloud.width,cloud.height);
  drawFinishes(photoSurfaces(surfaces),roomTriangles,clipPosition,objects,overPhoto);
  return;
 }
 gc.fillStyle='#111820';gc.fillRect(0,0,cloud.width,cloud.height);
 if(overPhoto)gc.drawImage(image,0,0,cloud.width,cloud.height);
 const items=[],colors={floor:'#bfa987',wall:'#c9d2c7',ceiling:'#e4e4d9',sloped_ceiling:'#b6ccdb'};
 if(!overPhoto&&display!=='points')for(const s of surfaces)for(const triangle of roomTriangles(s)){const q=triangle.map(p=>project(p));if(q.every(Boolean))items.push({q,z:q.reduce((a,p)=>a+p[2],0)/3,color:s===f&&geometryPanel?.open?'#e4c56e':colors[s.kind]||'#aab8be'});}
 if(!overPhoto&&['points','both'].includes(display))for(let i=0;i<data.points.length;i++){if(data.confidence[i]<data.cutoffs['75'])continue;const p=project(data.points[i]);if(p&&p[0]>=0&&p[0]<data.width&&p[1]>=0&&p[1]<data.height)items.push({p,z:p[2],color:`rgb(${data.colors[i].join(',')})`});}
 for(const {points,rgb} of objects){
  const q=points.map(point=>project(point));
  if(q.every(Boolean))items.push({q,z:q.reduce((sum,p)=>sum+p[2],0)/3,color:`rgb(${rgb.map(value=>Math.round(value*255)).join(',')})`});
 }
 items.sort((a,b)=>b.z-a.z);for(const item of items){gc.fillStyle=item.color;if(item.p)gc.fillRect(item.p[0]-1,item.p[1]-1,2,2);else{gc.beginPath();item.q.forEach((p,i)=>i?gc.lineTo(p[0],p[1]):gc.moveTo(p[0],p[1]));gc.closePath();gc.fill();}}
}
function schedule(){if(!pending){pending=true;requestAnimationFrame(render);}}
function say(text){el('status').textContent=text;}
function populateSurfaces(){el('surface').replaceChildren();for(const [i,f] of shell.surfaces.entries()){const o=document.createElement('option');o.value=i;o.textContent=f.label;el('surface').append(o);}el('joins-control').hidden=!shell.seamRefinement;el('joins').disabled=!shell.seamRefinement;el('joins').checked=shell.seamRefinement?.active!==false;el('joins-note').textContent=shell.seamRefinement?`${shell.seamRefinement.joinedPairs} nearby observed joins refined. Turn off fitted joins to compare the original patches. Moving a surface can reopen a join.`:'';loadFace();}
function loadFace(){
 const f=face();
 el('visible').checked=f.enabled;
 el('offset').value=(f.offset/(data.radius*2)*100).toFixed(1);
 el('fit').textContent=f.status==='inferred_completion'?'Estimated from the surrounding room':
  `${(f.supportPoints||0).toLocaleString()} supporting samples · Photo-derived ${f.kind.replace('_',' ')}`;
 marking=false;
 corner=null;
 populateOpenings();
 schedule();
}
function populateOpenings(index=0){el('opening').replaceChildren();for(const [i,o] of face().openings.entries()){const option=document.createElement('option');option.value=i;option.textContent=`${o.kind} ${i+1}${o.status==='unconfirmed_candidate'?' · review':''}`;el('opening').append(option);}el('opening').value=String(index);loadOpening();}
function loadOpening(){const o=opening();for(const id of ['kind','cut','left','top','width','height','remove'])el(id).disabled=!o;el('opening').disabled=!o;if(o){const b=bounds(face()),w=b[2]-b[0],h=b[3]-b[1];el('kind').value=o.kind;el('cut').checked=o.enabled;for(const [id,value] of Object.entries({left:(o.bounds[0]-b[0])/w*100,top:(o.bounds[1]-b[1])/h*100,width:(o.bounds[2]-o.bounds[0])/w*100,height:(o.bounds[3]-o.bounds[1])/h*100}))el(id).value=value.toFixed(1);}else{el('cut').checked=false;for(const id of ['left','top','width','height'])el(id).value='';}schedule();}
function loadPhoto(){
 const generation=++imageGeneration;
 image=null;
 photo.hidden=true;
 el('camera').disabled=true;
 if(referenceStatus){
  referenceStatus.hidden=false;
  referenceStatus.textContent='Loading reference photo…';
 }
 corner=null;
 marking=false;
 if(photoMode){showOrbit();schedule();}
 const next=new Image();
 next.onload=()=>{
  if(generation!==imageGeneration)return;
  image=next;
  photo.hidden=false;
  el('camera').disabled=false;
  if(referenceStatus)referenceStatus.hidden=true;
  schedule();
 };
 next.onerror=()=>{
  if(generation!==imageGeneration)return;
  const message='This reference photo could not load. Try another angle.';
  if(referenceStatus)referenceStatus.textContent=message;
  else say(message);
  if(photoMode)showOrbit();
  schedule();
 };
 next.src=view().image;
}
el('view').replaceChildren();
for(const [i] of data.views.entries())el('view').add(new Option(`Photo ${i+1}`,i));
el('view').onchange=loadPhoto;
if(referencePanel)referencePanel.ontoggle=schedule;
if(geometryPanel)geometryPanel.ontoggle=schedule;
el('surface').onchange=loadFace;
el('opening').onchange=loadOpening;
displayControl.onchange=()=>{
 if(displayControl.value==='match'&&image)photoMode=true;
 else showOrbit();
 schedule();
};
el('joins').onchange=()=>{if(!shell.seamRefinement)return;shell.seamRefinement.active=el('joins').checked;for(const f of shell.surfaces){const polygon=el('joins').checked?f.seamRefinedPolygon:f.seamOriginalPolygon;if(polygon)f.polygon=structuredClone(polygon);}loadFace();say(el('joins').checked?'Fitted observed joins enabled. Unseen boundaries remain unfinished.':'Original observed patches shown for comparison.');};
el('visible').onchange=()=>{face().enabled=el('visible').checked;if(!furnitureSurface(currentFurniture()))placingFurniture=false;syncFurniture();say('Surface visibility edited. Download to keep changes.');};el('offset').oninput=()=>{const value=Number(el('offset').value);if(Number.isFinite(value)&&Math.abs(value)<=20){face().offset=value/100*data.radius*2;say('Surface position edited. Download to keep changes.');schedule();}};
el('kind').onchange=()=>{const index=Number(el('opening').value);opening().kind=el('kind').value;populateOpenings(index);say('Opening type edited.');};el('cut').onchange=()=>{opening().enabled=el('cut').checked;opening().status='user_edited_estimate';say('Opening cutout edited. Download to keep changes.');schedule();};
for(const id of ['left','top','width','height'])el(id).oninput=()=>{const values=['left','top','width','height'].map(k=>Number(el(k).value));if(values.some(v=>!Number.isFinite(v))||values[0]<0||values[1]<0||values[2]<=0||values[3]<=0||values[0]+values[2]>100||values[1]+values[3]>100){say('Keep opening bounds within 0–100% of this surface.');return;}const b=bounds(face()),w=(b[2]-b[0])/100,h=(b[3]-b[1])/100;opening().bounds=[b[0]+values[0]*w,b[1]+values[1]*h,b[0]+(values[0]+values[2])*w,b[1]+(values[1]+values[3])*h];opening().status='user_edited_estimate';say('Opening size edited.');schedule();};
function hit(x,y){const f=face(),r=view().pose,k=view().intrinsics,cy=(y-k[1][2])/k[1][1],cx=(x-k[0][2]-k[0][1]*cy)/k[0][0],direction=[0,1,2].map(j=>r[0][j]*cx+r[1][j]*cy+r[2][j]),camera=[0,1,2].map(j=>-(r[0][j]*r[0][3]+r[1][j]*r[1][3]+r[2][j]*r[2][3])),base=add(f.origin,mul(f.normal,f.offset)),denom=dot(direction,f.normal);if(Math.abs(denom)<1e-8)return null;const t=dot(sub(base,camera),f.normal)/denom;if(t<=0)return null;const d=sub(add(camera,mul(direction,t)),base);return [dot(d,f.u),dot(d,f.v)];}
function mark(x,y){if(!marking)return;const p=hit(x,y);if(!p){say('This ray does not meet the selected surface in front of the camera.');return;}if(!corner){corner=p;say('First corner set. Mark the opposite corner.');schedule();return;}const b=[Math.min(corner[0],p[0]),Math.min(corner[1],p[1]),Math.max(corner[0],p[0]),Math.max(corner[1],p[1])],f=face(),limits=bounds(f);b[0]=Math.max(limits[0],b[0]);b[1]=Math.max(limits[1],b[1]);b[2]=Math.min(limits[2],b[2]);b[3]=Math.min(limits[3],b[3]);if(b[2]-b[0]<=.005||b[3]-b[1]<=.005||clip([[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]],f.polygon).length<3){corner=null;say('Opening is outside this patch or too small. Choose the wall covering those photo corners.');schedule();return;}f.openings.push({id:`${f.id}-photo-${Date.now()}`,kind:'opening',bounds:b,enabled:true,status:'user_placed_estimate',sourceView:Number(el('view').value),evidence:'Two photo corners projected onto the selected inferred plane; not measured.'});marking=false;corner=null;populateOpenings(f.openings.length-1);say('Estimated opening added. Select Window or Doorway, inspect the cutout, then download to save.');}
el('mark').onclick=()=>{el('photo').closest('details').open=true;marking=!marking;corner=null;say(marking?'On the photo, mark two opposite corners of an opening on the gold outlined surface.':'Opening placement cancelled.');photo.focus();schedule();};photo.onclick=e=>{const b=photo.getBoundingClientRect();mark((e.clientX-b.left)*photo.width/b.width,(e.clientY-b.top)*photo.height/b.height);};photo.onkeydown=e=>{if(!marking)return;const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(e.key==='Enter'){e.preventDefault();mark(...cursor);}else if(d){e.preventDefault();cursor=cursor.map((v,i)=>Math.max(0,Math.min(i?data.height-1:data.width-1,v+d[i]*(e.shiftKey?10:1))));say(`Photo cursor ${cursor.map(Math.round).join(', ')}. Enter places a corner.`);}};
el('remove').onclick=()=>{face().openings.splice(Number(el('opening').value),1);populateOpenings();say('Opening removed from these local edits.');};
el('reset').onclick=()=>{shell=structuredClone(original);shell.planningScale=roomScale;selectedFurniture=null;placingFurniture=false;populateSurfaces();syncFurniture();say('Original room and furniture restored.');};
el('camera').onclick=()=>{
 if(!image)return;
 photoMode=true;
 displayControl.value='match';
 cloud.focus({preventScroll:true});
 cloud.scrollIntoView({block:'nearest',behavior:reducedMotion.matches?'auto':'smooth'});
 schedule();
};
el('orbit').onclick=()=>{showOrbit();schedule();cloud.focus({preventScroll:true});};

let drag=null;
function pointerRay(event){
 const rect=cloud.getBoundingClientRect();
 return previewRay((event.clientX-rect.left)*data.width/rect.width,(event.clientY-rect.top)*data.height/rect.height);
}
function freezeOrbit(){
 Object.assign(orbitTarget,{yaw,pitch,zoom});
 lastOrbitFrame=0;
}
cloud.onpointerdown=event=>{
 if(drag||event.button!==0)return;
 cloud.focus({preventScroll:true});
 const ray=pointerRay(event);
 const surfaces=previewSurfaces();
 if(placingFurniture){
  const item=currentFurniture(), surface=furnitureSurface(item);
  const wallItem=isWallItem(item);
  const hit=wallItem ? wallAtRay(ray,surfaces) : surface && surfaceIntersection(ray,surface);
  if(!hit){
   el('furniture-status').textContent=wallItem ? 'Click a clear spot on a visible wall.' : 'Click the reconstructed floor.';
   return;
  }
  const [u,v]=hit.uv;
  if(changeFurniture(wallItem ? {u,v,wallId:hit.surface.id} : {u,v})){
   placingFurniture=false;
   syncFurniture();
  }
  return;
 }
 let picked=null, pickedSurface, nearest=Infinity;
 if(!event.shiftKey){
  const span=floorSpan();
  for(const item of furnitureItems()){
   const surface=furnitureSurface(item);
   if(!surfaces.includes(surface)||!furnitureIsVisible(item,surface,span))continue;
   const distance=furnitureHit(ray,item,surface,span);
   if(distance<nearest){picked=item;pickedSurface=surface;nearest=distance;}
  }
 }
 const hit=pickedSurface && surfaceIntersection(ray,pickedSurface);
 if(picked && hit){
  freezeOrbit();
  selectedFurniture=picked.id;
  drag={id:event.pointerId,offset:[picked.u-hit.uv[0],picked.v-hit.uv[1]]};
  syncFurniture();
 }else drag={id:event.pointerId,x:event.clientX,y:event.clientY};
 cloud.setPointerCapture(event.pointerId);
};
cloud.onpointermove=event=>{
 if(drag?.id!==event.pointerId)return;
 if(drag.offset){
  const surface=furnitureSurface(currentFurniture()), hit=surface&&surfaceIntersection(pointerRay(event),surface);
  if(hit)changeFurniture({u:hit.uv[0]+drag.offset[0],v:hit.uv[1]+drag.offset[1]},false);
  return;
 }
 showOrbit();
 orbitTarget.yaw+=(event.clientX-drag.x)*.008;
 orbitTarget.pitch=Math.max(-1.4,Math.min(1.4,orbitTarget.pitch+(event.clientY-drag.y)*.008));
 Object.assign(drag,{x:event.clientX,y:event.clientY});
 schedule();
};
cloud.onlostpointercapture=cloud.onpointerup=cloud.onpointercancel=event=>{
 if(drag?.id!==event.pointerId)return;
 if(drag.offset)el('furniture-status').textContent='Furniture position saved in this layout.';
 drag=null;
};
cloud.onwheel=event=>{
 event.preventDefault();
 if(drag?.offset)return;
 showOrbit();
 const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?cloud.clientHeight:1);
 orbitTarget.zoom=Math.max(.3,Math.min(5,orbitTarget.zoom*Math.exp(-pixels*.001)));
 schedule();
};
cloud.onkeydown=event=>{
 const key=event.key;
 if(key==='Escape'&&placingFurniture){placingFurniture=false;syncFurniture();return;}
 const deltas={ArrowLeft:[-.10,0],ArrowRight:[.10,0],ArrowUp:[0,-.10],ArrowDown:[0,.10]};
 if(!deltas[key]&&!['+','=','-'].includes(key))return;
 event.preventDefault();
 if(placingFurniture&&deltas[key]){
  const item=currentFurniture();
  if(item&&furnitureSurface(item)){
   const [u,v]=deltas[key],span=floorSpan()*.15;
   changeFurniture({u:item.u+u*span,v:item.v+v*span});
  }
  return;
 }
 showOrbit();
 if(deltas[key]){
  orbitTarget.yaw+=deltas[key][0];
  orbitTarget.pitch=Math.max(-1.4,Math.min(1.4,orbitTarget.pitch+deltas[key][1]));
 }else orbitTarget.zoom=Math.max(.3,Math.min(5,orbitTarget.zoom*(key==='-'?1/1.15:1.15)));
 schedule();
};
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Downloaded '+name);}
el('json').onclick=()=>download('room-shell-edited.json',JSON.stringify(shell,null,2),'application/json');
el('obj').onclick=()=>{
 const scale=roomScale?.metersPerUnit || 1;
 const lines=['# Estimated room and furniture; units: '+(roomScale?'meters':shell.units)];
 let count=0;
 function mesh(name,triangles){
  lines.push('o '+name);
  for(const triangle of triangles){
   for(const point of triangle)lines.push('v '+point.map(value=>value*scale).join(' '));
   lines.push(`f ${count+1} ${count+2} ${count+3}`);
   count+=3;
  }
 }
 for(const surface of shell.surfaces)mesh(surface.id,roomTriangles(surface));
 const span=floorSpan();
 for(const item of furnitureItems()){
  const surface=furnitureSurface(item);
  if(furnitureIsVisible(item,surface,span))mesh('furniture-'+item.kind+'-'+item.id,
   furnitureMesh(item,surface,span).map(triangle=>triangle.points));
 }
 download('room-shell-edited.obj',lines.join('\n')+'\n','text/plain');
};
el('html').onclick=async()=>{
 try {
  const doc=document.documentElement.cloneNode(true);
  doc.querySelector('#editor-data').textContent=JSON.stringify({...data,shell}).replace(/</g,'\\u003c');
  const boot=doc.querySelector('#room-engine');
  if(boot.hasAttribute('src')){
   const response=await fetch(boot.src);
   if(!response.ok)throw new Error('Engine download failed');
   boot.removeAttribute('src');
   boot.textContent=(await response.text()).replace(/<\/script/gi,'<\\/script');
  }
  download('room-shell-edited.html','<!doctype html>'+doc.outerHTML,'text/html');
 } catch { say('The offline viewer could not be downloaded. Try again or download the layout.'); }
};
if(data.listingId){
 const back=el('property-back');
 back.hidden=false;
 back.querySelector('a').href='/room-builder/?listing='+encodeURIComponent(data.listingId)+'&engine=planning';
}
const roomLinks=Array.isArray(data.roomLinks)?data.roomLinks:[];
if(roomLinks.length){
 const selector=el('property-room');
 el('property-room-nav').hidden=false;
 selector.replaceChildren();
 for(const room of roomLinks)selector.add(new Option(room.label,room.href));
 selector.selectedIndex=roomLinks.findIndex(room=>room.id===data.roomId);
 selector.onchange=()=>{
  const destination=new URL(selector.value,location.href);
  if(destination.origin===location.origin)location.href=destination.href;
 };
}
el('fit-view').onclick=fitOrbit;
el('save-picture').onclick=()=>{
 fitOrbit();
 try {
  render(performance.now());
  const output=document.createElement('canvas');
  const layer=finishCanvas.hidden?cloud:finishCanvas;
  output.width=layer.width;
  output.height=layer.height;
  output.getContext('2d').drawImage(layer,0,0);
  output.toBlob(blob=>{
   if(blob)download('smart-realty-room-3d.png',blob,'image/png');
   else say('The picture could not be saved.');
  },'image/png');
 } catch { say('The picture could not be saved.'); }
};
el('room-scale-form').onsubmit=event=>{
 event.preventDefault();
 const span=Number(el('room-span-ft').value);
 updateScale(span,'span entered by user');
 if(scaleKey && roomScale)try{localStorage.setItem(scaleKey,String(span));}catch{}
};
el('room-scale-reset').onclick=()=>{
 if(scaleKey)try{localStorage.removeItem(scaleKey);}catch{}
 autoScale();
};
autoScale();
if(scaleKey)try{
 const stored=Number(localStorage.getItem(scaleKey));
 if(stored>=2&&stored<=100)updateScale(stored,'span entered by user');
}catch{}
if(original.planningScale?.source==='span entered by user'){
 updateScale(Number(original.planningScale.spanFeet),'span entered by user');
}
const requestedView=Number(new URLSearchParams(location.search).get('view'));
if(Number.isInteger(requestedView)&&requestedView>=0&&requestedView<data.views.length)el('view').value=String(requestedView);
const views=`${data.views.length} listing ${data.views.length===1?'photo':'photos'}`;
const evidence=el('room-evidence');
if(evidence)evidence.textContent=completion
 ? `Built from ${views}. ${completion.inferredWallCount>0?'Unseen walls use estimated positions.':'Wall positions are estimated from the photos.'}`
 : `Photo-derived preview from ${views}. Parts of the room may be missing.`;
el('surface-note').textContent=completion
 ? 'Finishes blend visible details from the photos. Unseen areas use matching colors.'
 : 'The preview uses textured surfaces visible in the listing photos.';
const geometryNote=el('geometry-note');
if(geometryNote)geometryNote.textContent=completion
 ? 'The 3D view hides near walls and the ceiling so you can see inside. Geometry downloads include them.'
 : 'The preview shows estimated surfaces visible in the listing photos.';
restoreFurniture();
populateSurfaces();setupFurniture();fitOrbit();loadPhoto();
el('viewer-loading').hidden=true;

}
