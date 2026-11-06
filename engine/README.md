# Smart Realty room engine

Every property opens the same editable builder. The builder reads listing photos, room sizes, beds, baths, and square footage. Room names come from photo filenames and listing counts. The shared layout solver uses listed room spans when available and estimates the rest from the property area.

The photo studio loads room geometry, cameras, and textures as data. Its shared code handles furniture, openings, walls, scale, and PNG, OBJ, JSON, and offline viewer exports. Published photo-derived models currently cover six Blain Road rooms. The walk-through remains available separately at `/room-builder/?listing=LISTING_ID&mode=walk` when a GLB is published.

Load `/js/sr-engine.js` once in the site's shared page template. An individual listing needs only:

```html
<div id="sr-3d-viewer" data-listing-id="123"></div>
```

## Rebuild models

Run from the repository root with Node.js 20 or later.

```sh
node engine/batch.mjs --output models
node engine/batch.mjs --output models --stale-only
node engine/batch.mjs --input /path/to/listings.json --output /tmp/sru-model-preview
```

The first command traverses the live listing feed. It writes a versioned manifest and GLB per supported listing and a summary to `models/rebuild-report.json`. A listing with insufficient or inconsistent area is recorded as unavailable and the command continues. The output is local until deployed. The input file can contain one listing, a listing array, or an API response.

The default batch builds data-derived layouts and does not copy provider photos into the GLB. The optional macOS texture path needs `sips` and confirmation of derivative photo rights. Set `SRU_MLS_DERIVATIVE_OK=1` and pass `--with-textures` only after verifying those rights. Failed photos are recorded and the model uses a neutral finish. The photo-derived studio models use previously reconstructed camera and surface data. The GLB batch does not run depth inference.

## Audit

### Photo pipeline, version 3

`node engine/photo-jobs.mjs --input listings.json --output photo-jobs.json` prepares data for every listing through the same sizing and room-grouping code. The private local worker consumes these jobs, reconstructs photo-derived surfaces, checks every camera, retries a weak ordering once, and caches unchanged inputs. It writes a content-addressed model and `/models/LISTING_ID/photo-rooms.json`. The studio and property builder discover that manifest automatically. A new listing requires no registry edit or custom scene. The inference worker stays outside this public repository; it is currently a local process, not a hosted API.

Fixed: manual per-listing model registration; repetitive inference for unchanged inputs; one failed camera ordering stopping a room; scale labels confusing typical room sizes with listing-derived estimates. Inferred room proportions now use the observed floor while preserving the shared plan's estimated area. Stated room measurements retain priority. Each model records its engine version, source evidence, and unverified-scale status. Missing photos or failed geometry use the existing photo fallback.

Still open: visual grouping for unnamed photos, measured calibration, complete unseen geometry, automatic hosted processing when listings change, and physical-device checks. Public browser code and public models can be copied; keeping inference source private protects that source, not the downloadable viewer or model data.

| Found | Repair |
| --- | --- |
| Six photo pages each shipped a copy of the viewer and its controls | Shared one studio and retained the old URLs as redirects |
| A successful walk-through probe replaced the editor, and a failed probe could block startup | Open the editor by default and make walk-through explicit |
| The model rebuild command exited without building, and the generator accepted only the sample ID | Use a shared generator, paginate listings, and record versions and per-listing results |
| Editable and walkable rooms used different sizing calculations, and photo-studio product sizes used only relative scene units | Share the layout solver and apply a labeled planning scale to the studio |
| Background estimates matched bedrooms by type alone, which could assign the wrong photo geometry | Match by source photo and preserve the active room's edits |
| Missing listing data and failed textures left incomplete screens | Show a photo fallback when a preview cannot open, and try the next available texture |
| A missing import was caught in browser startup testing | Restored the import and rechecked all three listings |

Tested with live listing records for HUD 413-772606, HUD 201-738041, and HUD 387-633615. All three lacked individual room measurements, so their plans use estimated dimensions. A separate fixture confirmed that stated room dimensions take precedence. Full-catalog photo-derived reconstruction, measured dimensions for those listings, and physical-device mobile crash reproduction remain open.
