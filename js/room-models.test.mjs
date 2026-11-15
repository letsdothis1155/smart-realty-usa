import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listingRooms, planningRoomModel, resolveStudioRoom } from './room-models.mjs';
import { roomCopySample } from './room-copy-sample.mjs';
import { studioRoomTarget } from './room-entry.mjs';

const jsonFile = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const response = value => ({ ok: value !== undefined, json: async () => value });

test('the listing marketing sample opens as a fresh furnished room at the advertised dimensions', () => {
 const sample = roomCopySample();
 assert.equal(sample.sampleRoom, true);
 assert.equal(sample.listingId, 'demo-room-copy');
 assert.equal(sample.referencePhotoCount, 0);
 const { widthM, depthM, heightM, source } = sample.shell.completion;
 assert.deepEqual([widthM, depthM, heightM].map(value => Math.round(value / 0.3048)), [12, 14, 8]);
 assert.equal(source, 'sample-dimensions');
 const items = sample.shell.furniture;
 assert.ok(items.some(item => item.kind === 'kivik'));
 assert.ok(items.some(item => item.kind === 'poang'));
 assert.ok(items.some(item => item.kind === 'lackTable'));
 assert.ok(items.every(item => Math.abs(item.u) < widthM / 2 && Math.abs(item.v) < depthM / 2));
 assert.equal(sample.shell.surfaces.find(surface => surface.id === 'plan-south').openings[0].kind, 'doorway');
 items.pop();
 assert.equal(roomCopySample().shell.furniture.length, 6);
});

const samples = [
  {id:'sized',sqft:1800,beds:3,baths:2,roomSizes:[{id:'living',widthFt:20,lengthFt:12,heightFt:10}],images:['https://example.com/lr_123456.jpg']},
  {id:'no-room-sizes',sqft:1262,beds:3,baths:1,images:['https://example.com/IMG_001.jpg']},
  {id:'partial',beds:2,baths:1},
];

test('all properties enter the same studio, including exterior-photo links', () => {
  for (const listing of samples) assert.match(studioRoomTarget('?listing='+listing.id+'&photo=https://example.com/front.jpg'), /\/room-builder\/studio\//);
  assert.equal(studioRoomTarget('?listing=home&engine=planning'),'');
  assert.equal(studioRoomTarget('?listing=home&mode=walk'),'');
  assert.equal(studioRoomTarget('?listing=../secret'),'');
});

test('every listed room has a complete furniture-ready layout, with optional photos and dimensions', () => {
  for (const listing of samples) {
    const rooms=listingRooms(listing);
    assert.ok(rooms.length >= listing.beds + Math.ceil(listing.baths) + 2);
    for (const room of rooms) {
      const model=planningRoomModel(listing,room);
      assert.equal(model.shell.surfaces.length,6);
      assert.equal(model.shell.closedRoom,true);
      assert.equal(model.shell.metricVerified,false);
      assert.equal(model.referenceOnly,true);
      assert.ok(model.views.length);
      assert.ok(model.shell.completion.widthM>0);
      assert.equal(Object.keys(model.finishes).length,6);
    }
  }
  const room=listingRooms(samples[0]).find(room=>room.id==='living');
  const model=planningRoomModel(samples[0],room);
  assert.equal(model.shell.completion.widthM,6.096);
  assert.equal(model.shell.completion.heightM,3.048);
});

test('published rooms win and unbuilt rooms remain in the same navigation', async () => {
  const listing=samples[0], models=[{id:'living',label:'Living room',model:'/models/sized/live.json'}];
  const roomModel={listingId:'sized',roomId:'living',views:[{}],shell:{surfaces:[{}]}};
  const request=async url=>({ok:true,json:async()=>url.startsWith('/api/')?{listing}:roomModel});
  const data=await resolveStudioRoom('sized',null,'https://example.com/front.jpg',models,request);
  assert.equal(data.referenceOnly,undefined);
  assert.ok(data.roomLinks.some(room=>room.roomType==='bedroom'));
  const bedroom=data.roomLinks.find(room=>room.roomType==='bedroom');
  const fallback=await resolveStudioRoom('sized',bedroom.id,null,models,request);
  assert.equal(fallback.referenceOnly,true);
  assert.equal(fallback.roomId,bedroom.id);
});

test('a failed or mismatched model remains editable without paid photo analysis', async () => {
  const listing=samples[1], models=[{id:'living',label:'Living room',model:'/models/wrong.json'}];
  const request=async url=>({ok:true,json:async()=>url.startsWith('/api/')?{listing}:{listingId:'wrong',roomId:'living'}});
  const data=await resolveStudioRoom(listing.id,'living',null,models,request);
  assert.equal(data.referenceOnly,true);
  assert.equal(data.listingId,listing.id);
  assert.ok(data.roomLinks.length>1);
});

test('published models can open during an API outage; unknown listings fail cleanly', async () => {
  const models=[{id:'living',label:'Living room',model:'/models/live.json'}];
  const request=async url=>({ok:!url.startsWith('/api/'),json:async()=>({listingId:'home',roomId:'living',views:[{}],shell:{surfaces:[{}]}})});
  const data=await resolveStudioRoom('home','living',null,models,request);
  assert.equal(data.roomId,'living');
  await assert.rejects(resolveStudioRoom('missing',null,null,[],request),/unavailable/);
});

test('Utica missing rooms never use a kitchen, living room, or exterior photo as their reference', async () => {
 const id = 'hud-201-719673';
 const listing = { id, address: '4133 State Route 764', beds: 3, baths: 1, sqft: 1495, images: [
  'https://photos.example/hhs/lr_596461_186529200.jpg',
  'https://photos.example/hhs/kit_596461_937204415.jpg',
  'https://photos.example/hhs/bdr_1_596461_76799237.jpg',
  'https://photos.example/hhs/bdr_2_596461_109170705.jpg',
  'https://photos.example/hhs/front_596461_123456789.jpg',
 ] };
 const request = async url => response(url === '/api/listings/' + id ? { listing } : undefined);
 for (const room of ['plan-bedroom-3', 'plan-bathroom-1']) {
  const result = await resolveStudioRoom(id, room, null, [], request);
  assert.equal(result.roomId, room);
  assert.equal(result.referencePhotoCount, 0);
  assert.ok(result.views[0].image.startsWith('data:image/svg+xml,'));
 }
 const kitchen = await resolveStudioRoom(id, null, listing.images[1], [], request);
 assert.equal(kitchen.roomId, 'kitchen');
 assert.equal(kitchen.views[kitchen.referenceIndex].image, listing.images[1]);
 const differentHost = await resolveStudioRoom(id, null, listing.images[1].replace('photos.example', 'unrelated.example'), [], request);
 assert.equal(differentHost.roomId, 'living');
 assert.equal(differentHost.referenceIndex, -1);
 assert.ok(differentHost.selectionNote);
 const explicit = await resolveStudioRoom(id, 'bedroom-2', listing.images[1], [], request);
 assert.equal(explicit.roomId, 'bedroom-2');
 assert.ok(explicit.selectionNote);
});

test('the published Blain plan restores all ten rooms when the listing API cannot find it', async () => {
 const id = 'hud-413-772606';
 const plan = jsonFile('../models/hud-413-772606/rooms.json');
 const manifest = jsonFile('../models/hud-413-772606/photo-rooms.json');
 const kitchen = manifest.rooms.find(room => room.id === 'kitchen');
 const requestedPhoto = new URL(kitchen.photoFiles[1], plan.rooms.find(room => room.id === 'kitchen').photo).href;
 const model = { listingId: id, roomId: 'kitchen', views: kitchen.photoFiles.map(() => ({})), shell: { surfaces: [{}] } };
 const request = async url => response({ [`/models/${id}/rooms.json`]: plan, [kitchen.model]: model }[url]);
 const result = await resolveStudioRoom(id, null, requestedPhoto, manifest.rooms, request);
 assert.equal(result.roomId, 'kitchen');
 assert.equal(result.referenceIndex, 1);
 assert.equal(result.roomLinks.length, 10);
 assert.equal(result.roomLinks.filter(room => room.model).length, 6);
 const dining = await resolveStudioRoom(id, 'dining', null, manifest.rooms, request);
 assert.equal(dining.propertyLabel, '15561 Blain Rd');
 assert.equal(dining.propertyHref, '/new-listings/');
 assert.equal(dining.propertyLinkText, '← Browse current listings');
 assert.equal(dining.referencePhotoCount, 1);
 assert.match(dining.views[0].image, /Eating_space/);
 assert.equal(dining.shell.surfaces.length, 6);
});

test('the brownstone and all stock-photo catalog listings open as editable estimates', async () => {
 const catalog = jsonFile('../data/listings.json');
 const request = async url => response(url === '/data/listings.json' ? catalog : undefined);
 for (const listing of catalog.listings) {
  const result = await resolveStudioRoom(listing.id, null, null, [], request);
  assert.equal(result.propertyLabel, listing.title);
  assert.equal(result.propertyHref, '/#listings');
  assert.ok(result.roomLinks.length >= 2);
  assert.equal(result.referencePhotoCount, 0);
 }
 const brownstone = await resolveStudioRoom('sr-019-louisville-highlands-brownstone', null, 'images/listing-19.jpg', [], request);
 assert.equal(brownstone.listingId, 'sr-019');
 assert.equal(brownstone.propertyLabel, 'Louisville Highlands Brownstone');
 assert.equal(brownstone.referencePhotoCount, 0);
 assert.match(brownstone.selectionNote, /could not be matched/);
});

test('a manifest cannot use a known kitchen filename as bedroom evidence', () => {
 const listing = { id: 'home', beds: 1, baths: 1, images: ['bedroom_1.jpg', 'kitchen.jpg'] };
 const models = [{ id: 'bedroom-1', model: '/wrong-model.json', photoFiles: ['kitchen.jpg'] }];
 assert.equal(listingRooms(listing, models).find(room => room.id === 'bedroom-1').model, undefined);
});
