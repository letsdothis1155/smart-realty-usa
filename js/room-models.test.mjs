import test from 'node:test';
import assert from 'node:assert/strict';
import { listingRooms, planningRoomModel, resolveStudioRoom } from './room-models.mjs';
import { studioRoomTarget } from './room-entry.mjs';

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
