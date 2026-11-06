import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { propertyRoomModel, classifyRoomPhoto, roomChoiceLabel } from '../js/room-pipeline.js';

export const PHOTO_ENGINE_VERSION = 3;

/** Data-only contract for the private reconstruction worker. No inference runs in the browser. */
export function planPhotoJobs(listing) {
  const id = String(listing?.id || '');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid listing ID');
  const photos = [...new Set([...(Array.isArray(listing.images) ? listing.images : []),
    ...(Array.isArray(listing.galleryImages) ? listing.galleryImages : [])])]
    .filter(photo => typeof photo === 'string');
  const { rooms } = propertyRoomModel(listing, photos);
  return {
    schemaVersion: 1, engineVersion: PHOTO_ENGINE_VERSION, listingId: id,
    propertyLabel: String(listing.address || listing.title || id),
    // Unnamed images need a visual room classifier; do not merge them into a guessed room.
    unassignedPhotos: photos.filter(photo => !classifyRoomPhoto(photo)),
    rooms: rooms.map(room => ({
      id: room.id.replace(/^reference-/, ''), label: roomChoiceLabel(room.label),
      roomType: room.roomType, photos: room.sourcePhotoUrls || [],
      groupingSource: room.sourcePhotoUrls?.length ? 'photo-filename' : 'listing-room-count',
      dimensions: {
        widthM: room.width, depthM: room.depth, heightM: room.height,
        spanMeters: Math.max(room.width, room.depth),
        source: room.sizeSource || 'preset', metricVerified: false,
      },
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const input = args[args.indexOf('--input') + 1];
  const output = args[args.indexOf('--output') + 1];
  if (!args.includes('--input') || !args.includes('--output') || !input || !output) {
    throw new Error('Use --input listings.json --output photo-jobs.json');
  }
  const data = JSON.parse(readFileSync(input, 'utf8'));
  const listings = Array.isArray(data) ? data : data.listings || [data.listing || data];
  const jobs = listings.map(planPhotoJobs);
  writeFileSync(output, JSON.stringify({ schemaVersion: 1, jobs }, null, 2) + '\n');
  console.log(`Prepared ${jobs.length} properties using photo engine ${PHOTO_ENGINE_VERSION}`);
}
