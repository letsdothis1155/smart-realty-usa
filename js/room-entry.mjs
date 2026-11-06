import { PROPERTY_PHOTO_ROOMS } from "./room-photo-previews.mjs";

export function photoRoomTarget(search) {
  const params = new URLSearchParams(search);
  if (params.get("engine") === "planning" || params.get("demo") === "1") return "";
  const rooms = PROPERTY_PHOTO_ROOMS[params.get("listing")] || [];
  if (!rooms.length) return "";
  const requestedRoom = params.get("room");
  if (requestedRoom) return rooms.find(room => room.id === requestedRoom)?.href || "";
  let filename = "";
  try {
    filename = new URL(params.get("photo") || "", "https://smartrealty.us/").pathname.split("/").at(-1);
  } catch { /* A malformed reference cannot select a room. */ }
  const room = rooms.find(entry => entry.photoFiles.includes(filename)) || rooms[0];
  const view = room.photoFiles.indexOf(filename);
  return room.href + (view >= 0 ? "?view=" + view : "");
}
