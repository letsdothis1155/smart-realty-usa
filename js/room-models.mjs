import { classifyRoomPhoto, propertyRoomModel, roomChoiceLabel } from './room-pipeline.js?v=room-match1';

const validId = id => /^[a-zA-Z0-9_-]{1,100}$/.test(String(id || ''));
const catalogId = /^sr-\d{3}(?:-[a-z0-9-]+)?$/;

function photoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, 'https://smartrealty.us/');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}

function fileName(url) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').at(-1)); } catch { return ''; }
}

function listingPhotos(listing) {
  return [...new Set([...(Array.isArray(listing.images) ? listing.images : []),
    ...(Array.isArray(listing.galleryImages) ? listing.galleryImages : []), listing.image].map(photoUrl).filter(Boolean))];
}

function archivedRooms(pack) {
  return [...pack.rooms, pack.hall].filter(room => validId(room?.id)).map(room => {
    const photo = photoUrl(room.photo);
    const named = photo && classifyRoomPhoto(photo);
    const match = named?.id === room.id;
    return {
      id: room.id, label: room.label || 'Room',
      roomType: match ? named.roomType : 'other',
      width: room.widthM ?? room.w, depth: room.depthM ?? room.d, height: room.heightM,
      sizeSource: room.estimated === false ? 'listed-room' : 'listed-sqft',
      sourcePhotoUrls: match ? [photo] : [],
    };
  });
}

export function listingRooms(listing, models = [], archive = []) {
  const photos = listing.provider === 'demo' ? [] : listingPhotos(listing);
  const rooms = archive.length ? archive : propertyRoomModel(listing, photos).rooms.map(room => ({
    ...room, id: room.id.replace(/^reference-/, ''), label: roomChoiceLabel(room.label),
  }));
  for (const model of models) {
    const photoFiles = Array.isArray(model.photoFiles) ? model.photoFiles : [];
    // Explicitly named photos for a different room invalidate the model-room association.
    if (photoFiles.some(name => {
      const identified = classifyRoomPhoto(name);
      return identified && identified.id !== model.id;
    })) continue;
    const existing = rooms.find(room => room.id === model.id);
    const published = { model: model.model, modelPhotoFiles: photoFiles };
    if (existing) Object.assign(existing, published);
    else rooms.push({ id: model.id, label: model.label, roomType: 'other', ...published });
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
  const sourcePhotos = [...new Set((room.sourcePhotoUrls || []).map(photoUrl).filter(Boolean))].slice(0,12);
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

async function readJson(path, request) {
  try {
    const response = await request(path, { signal: AbortSignal.timeout(6000) });
    if (response.ok) return await response.json();
  } catch { /* The next applicable listing source can still open the studio. */ }
  return null;
}

export async function loadStudioProperty(listingId, request = globalThis.fetch) {
  if (!validId(listingId)) return {};
  if (catalogId.test(listingId)) {
    const catalog = await readJson('/data/listings.json', request);
    const listing = Array.isArray(catalog?.listings) && catalog.listings.find(row =>
      row?.provider === 'demo' && (row.id === listingId || `${row.id}-${row.slug}` === listingId));
    if (listing) return { listing };
    return {};
  }
  const record = await readJson('/api/listings/' + encodeURIComponent(listingId), request);
  if (record?.listing?.id === listingId) return { listing: record.listing };
  const pack = await readJson(`/models/${listingId}/rooms.json`, request);
  if (pack?.listingId === listingId && Array.isArray(pack.rooms)) {
    const rooms = archivedRooms(pack);
    if (rooms.length) {
      return { listing: { id: listingId, title: pack.propertyLabel, images: rooms.flatMap(room => room.sourcePhotoUrls) },
        archive: rooms };
    }
  }
  return {};
}

function matchesPhoto(room, photo, archive) {
  if (!photo || !room.sourcePhotoUrls?.length) return false;
  if (room.sourcePhotoUrls.includes(photo)) return true;
  // An archived plan stores one primary URL per room. A second published angle
  // must use a name from that room's manifest and the same provider directory.
  return Boolean(archive && room.modelPhotoFiles?.includes(fileName(photo)) &&
    room.sourcePhotoUrls.some(source => new URL('.', source).href === new URL('.', photo).href));
}

export async function resolveStudioRoom(listingId, requestedRoom, requestedPhoto, models = [], request = globalThis.fetch) {
  if (!validId(listingId)) throw new Error('Invalid listing ID');
  const { listing, archive } = await loadStudioProperty(listingId, request);
  const rooms = listing ? listingRooms(listing, models, archive) : models;
  const id = (requestedRoom || '').replace(/^reference-/, '');
  const requested = id && (rooms.find(room => room.id === id) || rooms.find(room => room.roomType === id));
  const photo = photoUrl(requestedPhoto);
  const matchingRooms = rooms.filter(room => matchesPhoto(room, photo, archive));
  const photoRoom = matchingRooms.length === 1 ? matchingRooms[0] : null;
  const room = requested || (!id && photoRoom) || rooms.find(room => room.id === 'living' || room.roomType === 'living') || rooms[0];
  if (!room) throw new Error('Listing room data is unavailable');

  const matchedPhoto = photoRoom === room ? photo : '';
  const selectionNote = id && !requested ? 'The linked room is unavailable. Choose from the rooms listed here.' :
    requestedPhoto && !matchedPhoto ? 'The linked photo could not be matched to this room.' : '';
  const context = {
    roomLinks: rooms, selectionNote,
    propertyHref: '/new-listings/', propertyLinkText: '← Browse current listings',
  };
  if (listing?.provider === 'demo') {
    context.propertyHref = '/#listings';
    context.propertyLinkText = '← Demo listings';
  } else if (listing && !archive) {
    context.propertyHref += '?id=' + encodeURIComponent(listingId);
    context.propertyLinkText = '← Property listing';
  }
  if (room.model) {
    try {
      const response = await request(room.model, { signal:AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Model unavailable');
      const data = await response.json();
      if (data.listingId !== listingId || data.roomId !== room.id || !data.views?.length || !data.shell?.surfaces?.length) throw new Error('Incomplete room model');
      const modelFiles = room.modelPhotoFiles || room.photoFiles;
      const referenceIndex = matchedPhoto && modelFiles?.length === data.views.length
        ? modelFiles.indexOf(fileName(matchedPhoto)) : -1;
      return { ...data, ...context, referenceIndex };
    } catch { /* Fall back in the same studio; keep every other room available. */ }
  }
  if (!listing) throw new Error('Listing data is unavailable');
  const data = planningRoomModel(listing, room);
  const referenceIndex = matchedPhoto ? data.views.findIndex(view => view.image === matchedPhoto) : -1;
  return { ...data, ...context, referenceIndex };
}
