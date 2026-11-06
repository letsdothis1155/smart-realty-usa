import test from "node:test";
import assert from "node:assert/strict";

import { missingPlanningRooms, normalizeListingPhotoUrl, reconstructHouse, reconstructRoom } from "./room-pipeline.js";

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
