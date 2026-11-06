/**
 * Batch processor for every listing.
 * It does not loop. MLS photos are often licensed for display only.
 * Andrew has to confirm the agreement before any full run.
 */

const confirmed = process.env.SRU_MLS_DERIVATIVE_OK === "1";
if (!confirmed) {
  console.error("MLS/IDX check: listing photos are usually licensed for display. Some agreements restrict derivative 3D models. The batch did not start. Set SRU_MLS_DERIVATIVE_OK=1 only after that agreement is confirmed.");
  process.exit(2);
}

console.error("The batch loop is not turned on. The only built model is models/hud-413-772606. Confirm the agreement in writing, then turn the loop on in a later change.");
process.exit(2);
