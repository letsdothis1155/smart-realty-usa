import test from "node:test";
import assert from "node:assert/strict";
import { photoRoomTarget } from "./room-entry.mjs";

test("a property stays in the 3D builder, including ones with photo-matched rooms", () => {
  assert.equal(photoRoomTarget("?listing=hud-413-772606"), "");
  assert.equal(photoRoomTarget("?listing=hud-413-772606&engine=planning"), "");
  assert.equal(photoRoomTarget("?listing=hud-413-772606&room=kitchen"), "");
  const photo = "https://example.com/hhs/Master_bedroom_2_816648_472511470.jpg";
  assert.equal(photoRoomTarget("?listing=hud-413-772606&photo=" + encodeURIComponent(photo)), "");
  assert.equal(photoRoomTarget("?listing=hud-other"), "");
});

test('completed photo rooms open by default while planning and other rooms stay reachable', () => {
  const rooms = [{id:'living', engineVersion:4, completedLayout:true, photoFiles:['LR.jpg']},
                 {id:'kitchen', engineVersion:3, photoFiles:['KIT.jpg']}];
  const query = '?listing=home';
  const target = '/room-builder/studio/?listing=home&room=living';
  assert.equal(photoRoomTarget(query, rooms), target);
  assert.equal(photoRoomTarget(query + '&photo=https://example.com/LR.jpg', rooms), target);
  for (const override of ['engine=planning', 'mode=walk', 'room=kitchen', 'photo=unknown.jpg']) {
    assert.equal(photoRoomTarget(query + '&' + override, rooms), '');
  }
});
