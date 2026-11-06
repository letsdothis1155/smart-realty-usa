import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPropertyPhotoRooms, PROPERTY_PHOTO_ROOMS } from './room-photo-previews.mjs';

test('new properties discover their rooms entirely from a generated manifest', async () => {
  const rooms = await loadPropertyPhotoRooms('new-house', async url => {
    assert.equal(url, '/models/new-house/photo-rooms.json');
    return { ok: true, json: async () => ({ listingId: 'new-house', engineVersion: 3, rooms: [
      { id: 'living', label: 'Living room', status: 'ready', model: '/models/new-house/photo-living-0123456789abcdef.json' },
      { id: 'kitchen', status: 'unavailable' },
      { id: 'bedroom', status: 'ready', model: 'https://other.test/model.json' },
    ] }) };
  });
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].engineVersion, 3);
  assert.match(rooms[0].href, /listing=new-house&room=living/);
});

test('failed, mismatched, and malformed manifests preserve previously published rooms', async () => {
  const id = 'hud-413-772606';
  for (const request of [async () => { throw new Error('offline'); },
    async () => ({ status: 404 }),
    async () => ({ ok: true, json: async () => ({ listingId: 'different', rooms: [] }) })]) {
    assert.deepEqual(await loadPropertyPhotoRooms(id, request), PROPERTY_PHOTO_ROOMS[id]);
  }
  assert.deepEqual(await loadPropertyPhotoRooms('../private', () => assert.fail('unexpected fetch')), []);
});

test('an empty valid rebuild suppresses old failed models', async () => {
  const rooms = await loadPropertyPhotoRooms('hud-413-772606', async () => ({ ok: true,
    json: async () => ({ listingId: 'hud-413-772606', rooms: [] }) }));
  assert.deepEqual(rooms, []);
});
