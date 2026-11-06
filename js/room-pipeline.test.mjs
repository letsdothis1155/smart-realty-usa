import test from "node:test";
import assert from "node:assert/strict";

import { listPropertyRooms, missingPlanningRooms, normalizeListingPhotoUrl, photoWallDistance, reconstructHouse, reconstructRoom, roomChoiceLabel } from "./room-pipeline.js";

function browserConfig() {
  globalThis.window = {
    location: { origin: "https://smartrealty.us" },
    SRU_CONFIG: {
      siteUrl: "https://smartrealty.us",
      photoReconstruction: { enabled: true, endpoint: "/api/shop/reconstruct" },
    },
  };
}

test.afterEach(() => {
  delete globalThis.window;
  delete globalThis.fetch;
});

test("normalizes a listing photo against the site root", () => {
  browserConfig();
  assert.equal(
    normalizeListingPhotoUrl("images/gallery/g-01.jpg"),
    "https://smartrealty.us/images/gallery/g-01.jpg"
  );
});

test("uses the configured reconstruction endpoint and preserves the listing id", async () => {
  browserConfig();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      async json() {
        return {
          ok: true,
          room: {
            mode: "vision",
            roomType: "living",
            width: 5.8,
            depth: 4.7,
            height: 2.65,
            photoUrl: "https://smartrealty.us/images/gallery/g-01.jpg",
          },
        };
      },
    };
  };

  const room = await reconstructRoom({
    photoUrl: "images/gallery/g-01.jpg",
    listingId: "sr-001",
  });

  assert.equal(request.url, "/api/shop/reconstruct");
  const requestBody = JSON.parse(request.options.body);
  assert.equal(requestBody.listingId, "sr-001");
  assert.deepEqual(requestBody.imageUrls, ["https://smartrealty.us/images/gallery/g-01.jpg"]);
  assert.equal(room.mode, "vision");
  assert.equal(room.listingId, "sr-001");
  assert.equal(room.width, 5.8);
});

test("sends up to four unique listing photos with the selected photo first", async () => {
  browserConfig();
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { async json() { return { ok: true, room: { mode: "vision" } }; } };
  };

  await reconstructRoom({
    photoUrl: "images/gallery/g-02.jpg",
    photoUrls: ["images/gallery/g-01.jpg", "images/gallery/g-02.jpg", "images/gallery/g-03.jpg", "images/gallery/g-04.jpg", "images/gallery/g-05.jpg"],
  });

  assert.deepEqual(requestBody.imageUrls, [
    "https://smartrealty.us/images/gallery/g-02.jpg",
    "https://smartrealty.us/images/gallery/g-01.jpg",
    "https://smartrealty.us/images/gallery/g-03.jpg",
    "https://smartrealty.us/images/gallery/g-04.jpg",
  ]);
});

test("falls back to a usable sample room when analysis is unavailable", async () => {
  browserConfig();
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  const room = await reconstructRoom({ photoUrl: "images/gallery/g-02.jpg" });
  assert.equal(room.mode, "fallback");
  assert.equal(room.photoUrl, "");
  assert.equal(room.sourcePhotoUrl, "https://smartrealty.us/images/gallery/g-02.jpg");
});

test("preserves a specific API credit error for an honest builder status", async () => {
  browserConfig();
  globalThis.fetch = async () => ({
    async json() {
      return {
        ok: false,
        code: "openai_credits_exhausted",
        room: {
          mode: "fallback",
          label: "AI photo matching needs API credits. Showing a sample room for now.",
          analysis: { sceneKind: "unusable", confidence: "low" },
        },
      };
    },
  });

  const room = await reconstructRoom({ photoUrl: "images/gallery/g-01.jpg" });
  assert.equal(room.mode, "fallback");
  assert.equal(room.analysis.errorCode, "openai_credits_exhausted");
});

test("reconstructs the complete gallery in batches and keeps global photo indices", async () => {
  browserConfig();
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      async json() {
        return { ok: true, house: { mode: "vision", rooms: [{ id: "living-room", photoIndices: [0, 1] }] } };
      },
    };
  };
  const house = await reconstructHouse({ listingId: "house-1", photoUrls: Array.from({ length: 10 }, (_, i) => `images/gallery/g-${i}.jpg`) });
  const bodies = requests.map(request => JSON.parse(request.options.body));
  assert.deepEqual(bodies.map(body => body.mode), ["house", "house"]);
  assert.deepEqual(bodies.map(body => body.imageUrls.length), [8, 2]);
  assert.equal(house.rooms[0].id, "living-room");
  assert.deepEqual(house.rooms[1].photoIndices, [8, 9]);
  assert.notEqual(house.rooms[0].id, house.rooms[1].id);
});

test("creates a separate editable fallback room for every photo", async () => {
  browserConfig();
  globalThis.fetch = async () => { throw new Error("offline"); };
  const house = await reconstructHouse({ photoUrls: ["images/gallery/g-01.jpg", "images/gallery/g-02.jpg"] });
  assert.equal(house.rooms.length, 2);
  assert.deepEqual(house.rooms.map((room) => room.photoIndices), [[0], [1]]);
  assert.equal(house.rooms[1].sourcePhotoUrl, "https://smartrealty.us/images/gallery/g-02.jpg");
});

test("sizes every listed room from the home's square footage", () => {
  const small = missingPlanningRooms({ beds: 3, baths: 2, sqft: 1650 }, []);
  const large = missingPlanningRooms({ beds: 3, baths: 2, sqft: 4200 }, []);
  const bedrooms = small.filter((room) => room.roomType === "bedroom");
  assert.equal(bedrooms.length, 3);
  assert.equal(bedrooms[0].sizeSource, "listed-sqft");
  assert.equal(bedrooms[0].finish, "linen");
  assert.ok(bedrooms[0].width > bedrooms[2].width);
  assert.match(bedrooms[0].label, /1,650 sqft/);
  assert.ok(large.find((room) => room.roomType === "living").width > small.find((room) => room.roomType === "living").width);
  assert.equal(small.filter((room) => room.roomType === "bathroom").length, 2);
});

test("keeps a photo-analyzed room instead of adding a second template", () => {
  const rooms = missingPlanningRooms({ beds: 1, baths: 1, sqft: 1650 }, [
    { mode: "vision", roomType: "bedroom", label: "Primary bedroom" },
  ]);
  assert.equal(rooms.filter((room) => room.roomType === "bedroom").length, 0);
  assert.equal(rooms.find((room) => room.roomType === "living").sizeSource, "listed-sqft");
});

test("lists every named room on a property and skips exterior photos", () => {
  const listing = { beds: 3, baths: 2, sqft: 1456 };
  const photos = [
    "Front_816648_322987517.jpg",
    "Front_and_side_816648_815940133.jpg",
    "Back_816648_808128586.jpg",
    "Yard_816648_800775385.jpg",
    "Outbuildings_816648_592051287.jpg",
    "Living_room_816648_464717697.jpg",
    "living_room_2_816648_957795975.jpg",
    "Living_room_other_816648_467866297.jpg",
    "Kitchen_816648_245544855.jpg",
    "Kitchen_2_816648_880863790.jpg",
    "Kitchen_other_816648_875656326.jpg",
    "Eating_space_816648_228444448.jpg",
    "Hall_816648_432624766.jpg",
    "Master_bedroom_816648_478831611.jpg",
    "Master_bedroom_2_816648_472511470.jpg",
    "Master_bathroom__816648_741646386.jpg",
    "utility_room_816648_929781356.jpg",
    "utility_room_other_816648_986604687.jpg",
    "Bedroom_1_816648_863846879.jpg",
    "Bedroom_2_816648_933622323.jpg",
    "Full_bathroom_816648_813882787.jpg",
    "Full_bathroom_other_816648_577997996.jpg",
  ];
  const rooms = listPropertyRooms(listing, photos);
  const ids = rooms.map((room) => room.id);
  assert.deepEqual(ids, [
    "reference-living",
    "reference-kitchen",
    "reference-dining",
    "reference-primary-bedroom",
    "reference-bedroom-1",
    "reference-bedroom-2",
    "reference-primary-bathroom",
    "reference-hall-bathroom",
    "reference-hall",
    "reference-utility",
  ]);
  assert.equal(rooms.find((room) => room.id === "reference-kitchen").sourcePhotoUrls.length, 3);
  assert.equal(rooms.find((room) => room.id === "reference-living").photoIndices.length, 3);
  assert.equal(rooms.some((room) => /photo \d/i.test(room.label)), false);
  assert.equal(rooms.some((room) => room.roomType === "bedroom"), true);
  assert.equal(rooms.filter((room) => room.roomType === "bedroom").length, 3);
  assert.equal(rooms.filter((room) => room.roomType === "bathroom").length, 2);
});

test("reads abbreviated HUD photo names and fills rooms the photos do not name", () => {
  const listing = { beds: 3, baths: 2, sqft: 1495 };
  const photos = [
    "https://res.cloudinary.com/yardi/image/upload/hhs/ftont_g2_use_596461_639551419.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/back_patio_596461_128711486.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/bdr_2_g_596461_275099997.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/bedroom_1_g_596461_599271901.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/hall_bath_g_596461_187637170.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/kit_g_596461_390048129.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/lr_g_596461_431229384.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/master_bath_g_596461_47279565.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/master_g_596461_1.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/shop_596461_9.jpg",
    "https://res.cloudinary.com/yardi/image/upload/hhs/img_5113_616407_1.jpg",
  ];
  const rooms = listPropertyRooms(listing, photos);
  assert.deepEqual(rooms.map((room) => room.id), [
    "reference-living",
    "reference-kitchen",
    "reference-primary-bedroom",
    "reference-bedroom-1",
    "reference-bedroom-2",
    "reference-primary-bathroom",
    "reference-hall-bathroom",
    "reference-shop",
  ]);
});

test("room choices keep the short name in front of the size note", () => {
  assert.equal(
    roomChoiceLabel("Kitchen · photo reference · about 12×10 ft from the listed 1,456 sqft"),
    "Kitchen"
  );
  assert.equal(roomChoiceLabel("Bedroom 2 · about 11×9 ft from the listed 1,495 sqft"), "Bedroom 2");
  assert.equal(roomChoiceLabel(""), "Room");
});

test("photo wall distance fills the camera on the tighter axis", () => {
  const tanV = Math.tan((25 * Math.PI) / 180);
  const wide = photoWallDistance(5, 2.5, 50, 1.6);
  const narrow = photoWallDistance(2.2, 2.4, 50, 1.6);
  assert.ok(Math.abs(wide - 1.25 / tanV) < 1e-9);
  assert.ok(Math.abs(narrow - 1.1 / (tanV * 1.6)) < 1e-9);
  assert.ok(narrow < wide);
});

test("lists living, kitchen, bedrooms, and bathrooms when photos are unnamed", () => {
  const rooms = listPropertyRooms(
    { beds: 3, baths: 2, sqft: 1650 },
    ["images/mansion-1.jpg", "images/gallery/g-01.jpg", "interior.jpg"]
  );
  assert.deepEqual(rooms.map((room) => room.roomType), [
    "living", "kitchen", "bedroom", "bedroom", "bedroom", "bathroom", "bathroom",
  ]);
  assert.equal(rooms.some((room) => room.id.startsWith("reference-")), false);
});
