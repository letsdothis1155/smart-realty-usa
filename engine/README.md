# Listing model engine

This folder builds a walkable GLB for one listing. The public page only loads `js/sr-3d-viewer.js` and the finished files in `models/`. It does not import this folder.

The sample is HUD listing `hud-413-772606` (15561 Blain Rd, Mt Sterling, Ohio, 1,456 sqft, 3 bd, 2 ba). The listing has no per-room sizes such as "Bedroom 1: 12x14". Every room in the sample is a split of the listed total and is badged **Dimensions estimated**.

Depth Anything and MiDaS are not installed. The 80 inch door and 36 inch counter are stored as scale references and were not measured in the photos. Furniture, cabinets, and windows are not placed. Each room's far wall uses that room's listing photo. The other surfaces use the photo's average color.

## Layout

```
engine/plan.mjs            floor plan, collision, listed-size rules
engine/plan.test.mjs
engine/glb-write.mjs       GLB writer, license, SmartRealty id
engine/glb-write.test.mjs
engine/sign.mjs            HMAC token helper, unused by the live site
engine/sign.test.mjs
engine/build-sample.mjs    the one sample
engine/batch.mjs           refuses to loop listings
engine/schema.sql          not applied
js/sr-3d-viewer.js         phone viewer, no engine import
models/hud-413-772606/     house.glb and rooms.json
```

The listing page embeds `<div id="sr-3d-viewer" data-listing-id="..."></div>`.

## Build the sample

```
node --test engine/plan.test.mjs engine/glb-write.test.mjs engine/sign.test.mjs engine/viewer-boundary.test.mjs
node engine/build-sample.mjs
```

`build-sample.mjs` reads `/tmp/blain.json` when that file exists, otherwise it fetches the live listing. It writes `models/hud-413-772606/house.glb` and `rooms.json`.

## Batch

Do not run this on every listing until the MLS/IDX agreement is confirmed. Listing photos are often licensed for display, and some agreements restrict derivative 3D models.

```
node engine/batch.mjs
```

That command exits 2. `SRU_MLS_DERIVATIVE_OK=1` still exits 2. The loop is not written.

## What is not deployed

- The Cloudflare Worker is not deployed. Do not run wrangler for this.
- `workers/signup` is unchanged. The OpenAI reconstruct route is out of credits and is not called.
- Supabase is still the placeholder project in `supabase-config.js`. `engine/schema.sql` is the table to apply later. Do not put a service role key in the repo.
- `engine/sign.mjs` can mint `listingId.exp.sig` with a secret that stays in the worker environment. No secret is stored here. The sample JSON says `"access": "sample"`, so the viewer loads the static GLB without a token.

## Protection, stated plainly

The engine source in this public GitHub repo is readable. Obfuscating the viewer does not hide it. The protection that matters is a private worker that never sends this folder to the browser. That worker is not running.

Until it is, `models/hud-413-772606/house.glb` is a normal static file. Anyone who can open the page can download it. The viewer's hostname check (`smartrealty.us`, `localhost`, `127.0.0.1`) is easy to bypass.

When a private signer is approved, the worker should:

1. Reject any `Origin` other than `https://smartrealty.us`.
2. Verify the HMAC token and its expiry with `engine/sign.mjs`.
3. Redirect to a short-lived signed URL for that listing's GLB.
4. Leave `access` as something other than `sample`, so the viewer waits for `data-token`.

The viewer already refuses a model path that does not start with `/models/<listing id>/`. It does not contain the HMAC secret, so it cannot decide that a token is valid. The worker has to do that.

A minify step can run over `js/sr-3d-viewer.js` at deploy time. The copy in the repo stays readable so the walk controls can be tested. Minified JavaScript is still the viewer, not the plan solver.

## Pages

GitHub Pages serves the site from `main`. This branch is not live. Merging would publish the sample GLB as a public file. Do that only after the sample has been checked and the MLS question is answered for anything beyond this one house.
