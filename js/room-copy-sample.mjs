import { planningRoomModel } from './room-models.mjs?v=3';
import { FT_TO_M } from './sr-layout.mjs';

export function roomCopySample() {
  const model = planningRoomModel(
    { id: 'demo-room-copy', title: 'Listing marketing sample', ceilingFt: 8 },
    { id: 'living', label: 'Living room', roomType: 'living',
      width: 12 * FT_TO_M, depth: 14 * FT_TO_M, sizeSource: 'sample-dimensions' },
  );
  model.shell.furniture = [
    { id: 1, kind: 'rug', u: -0.32, v: 0.43, angle: 0, scale: 1.4, color: '#baaa91' },
    { id: 2, kind: 'kivik', u: -0.32, v: 1.45, angle: Math.PI, scale: 1, color: '#81917d' },
    { id: 3, kind: 'poang', u: 1.12, v: -0.47, angle: 1.05, scale: 1, color: '#aa785c' },
    { id: 4, kind: 'lackTable', u: -0.32, v: 0.36, angle: 0, scale: 1, color: '#8b674b' },
    { id: 5, kind: 'lamp', u: 1.24, v: 1.49, angle: 0, scale: 1, color: '#e5d4b9' },
    { id: 6, kind: 'plant', u: -1.3, v: -1.48, angle: 0, scale: 1, color: '#5c7759' },
  ];
  const entryWall = model.shell.surfaces.find(surface => surface.id === 'plan-south');
  entryWall.openings.push({ id: 'sample-kitchen-door', kind: 'doorway', enabled: true,
    bounds: [-0.45, -0.81, 0.45, 4 * FT_TO_M], status: 'sample_layout' });
  return { ...model, sampleRoom: true, propertyHref: 'https://smartrealty.us/services/room-copy-sample/',
    propertyLinkText: '← Listing marketing sample' };
}
