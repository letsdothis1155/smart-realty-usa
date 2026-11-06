import test from 'node:test';
import assert from 'node:assert/strict';
import { planPhotoJobs } from './photo-jobs.mjs';

test('all listings share one room job contract; no room sizes required', () => {
  for (const [id, sqft] of [['house-a', 1262], ['house-b', 1456], ['house-c', undefined]]) {
    const job = planPhotoJobs({ id, sqft, beds: 2, baths: 1, images: [
      'https://example.com/lr_123456_1.jpg', 'https://example.com/lr_2_123456_2.jpg',
      'https://example.com/IMG_34.jpg',
    ] });
    const room = job.rooms.find(room => room.id === 'living');
    assert.equal(room.photos.length, 2);
    assert.equal(room.dimensions.metricVerified, false);
    assert.ok(room.dimensions.spanMeters > 0);
    assert.equal(room.dimensions.source, sqft ? 'listed-sqft' : 'preset');
    assert.equal(job.unassignedPhotos.length, 1);
    assert.ok(job.rooms.some(room => room.photos.length === 0));
  }
});

test('measured listing room dimensions take priority over area estimates', () => {
  const job = planPhotoJobs({ id: 'sized', sqft: 2000, beds: 2, baths: 1,
    roomSizes: [{ id: 'living', widthFt: 20, lengthFt: 12 }],
    images: ['https://example.com/lr_123456_1.jpg'] });
  const room = job.rooms.find(room => room.id === 'living');
  assert.equal(room.dimensions.source, 'listed-room');
  assert.ok(Math.abs(room.dimensions.spanMeters - 6.096) < .001);
});

test('job paths cannot escape the model directory', () => {
  assert.throws(() => planPhotoJobs({ id: '../private' }), /Invalid listing/);
});
