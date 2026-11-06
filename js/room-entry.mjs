// Use the photo studio only when the requested room has a completed layout.
export function photoRoomTarget(query, entries = []) {
  const params = new URLSearchParams(query);
  const listing = params.get('listing');
  if (!listing || params.get('engine') === 'planning' || params.get('mode') === 'walk') return '';
  const rooms = entries.filter(entry => entry.engineVersion >= 4 && entry.completedLayout === true);
  let choice;
  const room = params.get('room');
  const photo = params.get('photo');
  if (room) {
    choice = rooms.find(entry => entry.id === room);
  } else if (photo) {
    try {
      const file = decodeURIComponent(new URL(photo, 'https://smartrealty.us').pathname.split('/').at(-1));
      choice = rooms.find(entry => entry.photoFiles.includes(file));
    } catch { return ''; }
  } else {
    choice = rooms.find(entry => entry.id === 'living');
  }
  return choice ? '/room-builder/studio/?' + new URLSearchParams({ listing, room: choice.id }) : '';
}
