import { propertyRoomModel, roomChoiceLabel } from './room-pipeline.js';

const validId = id => /^[a-zA-Z0-9_-]{1,100}$/.test(String(id || ''));
const fileName = url => { try { return decodeURIComponent(new URL(url, 'https://smartrealty.us').pathname.split('/').at(-1)); } catch { return ''; } };

export function listingRooms(listing, models = []) {
  const photos = [...new Set([...(Array.isArray(listing.images) ? listing.images : []),
    ...(Array.isArray(listing.galleryImages) ? listing.galleryImages : [])])].filter(url => typeof url === 'string');
  const rooms = propertyRoomModel(listing, photos).rooms.map(room => ({
    ...room, id: room.id.replace(/^reference-/, ''), label: roomChoiceLabel(room.label),
  }));
  for (const model of models) {
    const existing = rooms.find(room => room.id === model.id);
    if (existing) existing.model = model.model;
    else rooms.push({ id: model.id, label: model.label, roomType: 'other', model: model.model });
  }
  return rooms.map(room => ({ ...room,
    href: '/room-builder/studio/?' + new URLSearchParams({ listing: listing.id, room: room.id }),
    photoFiles: (room.sourcePhotoUrls || []).map(fileName),
  }));
}

function finish(color, floor) {
  const pattern = floor ? '<path d="M0 16H64M0 32H64M0 48H64M32 0V16M12 16V32M44 32V48M24 48V64" stroke="#000" opacity=".07"/>' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="s" x2=".2" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".88"/></linearGradient></defs><rect width="64" height="64" fill="${color}"/><rect width="64" height="64" fill="url(#s)"/>${pattern}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** One complete editable room for any listing; photos remain references until reconstructed. */
export function planningRoomModel(listing, room) {
  const span = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 1.5 && Number(value) <= 30 ? Number(value) : fallback;
  const w = span(room.width, 4.6), d = span(room.depth, 4), h = span(room.height, 2.55);
  const listedRoom = Array.isArray(listing.roomSizes) ? listing.roomSizes.find(size => size?.id === room.id) : null;
  const ceilingFt = Number(listedRoom?.heightFt ?? listedRoom?.ceilingHeightFt ?? listing.ceilingFt ?? listing.ceilingHeightFt);
  const height = ceilingFt >= 7 && ceilingFt <= 20 ? ceilingFt * .3048 : h;
  const surface = (id, label, kind, origin, u, v, normal, width, depth) => ({
    id, label, kind, origin, u, v, normal, offset: 0, enabled: true, openings: [], supportPoints: 0,
    status: 'inferred_completion', polygon: [[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]],
  });
  const surfaces = [
    surface('plan-floor','Floor','floor',[0,0,0],[1,0,0],[0,0,1],[0,-1,0],w,d),
    surface('plan-ceiling','Ceiling','ceiling',[0,-height,0],[-1,0,0],[0,0,1],[0,1,0],w,d),
    surface('plan-north','Wall 1','wall',[0,-height/2,d/2],[-1,0,0],[0,1,0],[0,0,-1],w,height),
    surface('plan-south','Wall 2','wall',[0,-height/2,-d/2],[1,0,0],[0,1,0],[0,0,1],w,height),
    surface('plan-east','Wall 3','wall',[w/2,-height/2,0],[0,0,1],[0,1,0],[-1,0,0],d,height),
    surface('plan-west','Wall 4','wall',[-w/2,-height/2,0],[0,0,-1],[0,1,0],[1,0,0],d,height),
  ];
  const source = room.sizeSource || 'preset';
  const colors = { wall:'#d9d9ce', floor:room.roomType==='bathroom'?'#9faaa7':'#bfa47c', ceiling:'#ecece5' };
  const finishes = Object.fromEntries(surfaces.map(face => [face.id, {
    bounds: [face.polygon[0][0],face.polygon[0][1],face.polygon[2][0],face.polygon[2][1]],
    image: finish(colors[face.kind], face.kind==='floor'), coverage:0,
  }]));
  const references = room.sourcePhotoUrls?.length ? room.sourcePhotoUrls :
    [...(Array.isArray(listing.images) ? listing.images : []), ...(Array.isArray(listing.galleryImages) ? listing.galleryImages : [])];
  const sourcePhotos = [...new Set(references)].filter(url => {
    try { return ['https:','http:'].includes(new URL(url, 'https://smartrealty.us').protocol); } catch { return false; }
  }).slice(0,12);
  const placeholder = finish('#aeb9b3', false);
  return {
    engineVersion:4, referenceOnly:true, referencePhotoCount:sourcePhotos.length,
    listingId:listing.id, propertyLabel:listing.address || listing.title || 'Property', roomId:room.id, roomLabel:room.label,
    width:1000, height:700, center:[0,-height/2,0], radius:Math.hypot(w,height,d)/2,
    points:[], colors:[], confidence:[], cutoffs:{75:0}, finishes,
    views:(sourcePhotos.length ? sourcePhotos : [placeholder]).map((image,i) => ({name:`Photo ${i+1}`,image,
      pose:[[1,0,0,0],[0,1,0,height/2],[0,0,1,Math.max(w,d)*2]],intrinsics:[[850,0,500],[0,850,350],[0,0,1]]})),
    scale:{spanMeters:Math.max(w,d),source},
    shell:{schemaVersion:1, units:'meters', layoutVersion:'planning-1', surfaces, closedRoom:true, metricVerified:false,
      completion:{kind:'listing-plan',widthM:w,depthM:d,heightM:height,spanMeters:Math.max(w,d),metersPerUnit:1,
        source,heightSource:ceilingFt>=7&&ceilingFt<=20?'listed-height':'standard',inferredWallCount:4,observedWallCount:0,ceilingShape:'flat'}},
  };
}

export async function resolveStudioRoom(listingId, requestedRoom, photoUrl, models = [], request = globalThis.fetch) {
  if (!validId(listingId)) throw new Error('Invalid listing ID');
  let listing;
  try {
    const response = await request('/api/listings/' + encodeURIComponent(listingId), { signal:AbortSignal.timeout(8000) });
    if (response.ok) {
      const record = await response.json();
      if (record.listing?.id === listingId) listing = record.listing;
    }
  } catch { /* Published models can still open when listing data is temporarily unavailable. */ }
  const rooms = listing ? listingRooms(listing, models) : models;
  let room = requestedRoom && rooms.find(room => room.id === requestedRoom || room.id === 'reference-'+requestedRoom || room.roomType === requestedRoom);
  if (!room && !requestedRoom && photoUrl) room = rooms.find(room => room.photoFiles?.includes(fileName(photoUrl)));
  if (!room) room = rooms.find(room => room.id === 'living' || room.roomType === 'living') || rooms[0];
  if (!room) throw new Error('Listing room data is unavailable');
  if (room.model) {
    try {
      const response = await request(room.model, { signal:AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Model unavailable');
      const data = await response.json();
      if (data.listingId !== listingId || data.roomId !== room.id || !data.views?.length || !data.shell?.surfaces?.length) throw new Error('Incomplete room model');
      return {...data,roomLinks:rooms};
    } catch { /* Fall back in the same studio; keep every other room available. */ }
  }
  if (!listing) throw new Error('Listing data is unavailable');
  return {...planningRoomModel(listing,room),roomLinks:rooms};
}
