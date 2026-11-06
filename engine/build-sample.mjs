import { readFileSync } from "node:fs";
import { buildListing } from "./build-model.mjs";

const file = process.env.SRU_LISTING_JSON;
const id = "hud-413-772606";
const data = file
  ? JSON.parse(readFileSync(file, "utf8"))
  : await fetch("https://smartrealty.us/api/listings/" + id).then(response => response.json());
const listing = data.listing || data;
if (listing.id !== id) throw new Error("This shortcut expects the Blain Road listing.");
const pack = await buildListing(listing, {
  output: "models", textures: process.env.SRU_MLS_DERIVATIVE_OK === "1",
});
console.log(pack.listingId, "engine", pack.engineVersion, pack.glb);
