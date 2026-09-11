import test from "node:test";
import assert from "node:assert/strict";

import { normalizeListingPhotoUrl, reconstructRoom } from "./room-pipeline.js";

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
