/* Copyright 2026 Andrew Iredale Jr / SMART REALTY.US LLC. */
function mountListingViewers() {
  for (const host of document.querySelectorAll("#sr-3d-viewer[data-listing-id]")) {
    const id = host.dataset.listingId;
    if (!id || host.dataset.mountedListing === id) continue;
    const frame = document.createElement("iframe");
    frame.title = "Editable 3D room builder";
    frame.loading = "lazy";
    frame.allowFullscreen = true;
    frame.style.cssText = "display:block;width:100%;height:clamp(460px,75vh,720px);border:0;border-radius:12px";
    const query = new URLSearchParams({ listing: id, from: location.pathname + location.search });
    frame.src = "/room-builder/?" + query;
    host.replaceChildren(frame);
    host.dataset.mountedListing = id;
  }
}
mountListingViewers();
new MutationObserver(mountListingViewers).observe(document.body, {
  childList: true, subtree: true, attributes: true, attributeFilter: ["data-listing-id"],
});
