/* Draft listing copy. You edit it. Not an appraisal. */
(function () {
  function val(id) {
    return (document.getElementById(id)?.value || "").trim();
  }

  function bits() {
    const beds = val("cBeds") || "several";
    const baths = val("cBaths") || "multiple";
    const sqft = val("cSqft");
    const city = val("cCity") || "this market";
    const type = val("cType") || "home";
    const feats = val("cFeats");
    const addr = val("cAddr") || "this property";
    return { beds, baths, sqft, city, type, feats, addr };
  }

  function draft() {
    const b = bits();
    const size = b.sqft ? `${Number(b.sqft).toLocaleString()} sqft ` : "";
    const feat = b.feats ? ` Highlights: ${b.feats}.` : "";
    const h1 = `${b.beds}-bed ${b.type} in ${b.city}`;
    const h2 = `${size}${b.type} with ${b.baths} baths — ${b.city}`;
    const h3 = `A ${b.beds}-bedroom ${b.type} built around daily life in ${b.city}`;
    const p1 = `${b.addr} is a ${b.beds}-bedroom, ${b.baths}-bath ${b.type}${
      b.sqft ? ` of about ${Number(b.sqft).toLocaleString()} square feet` : ""
    } in ${b.city}.${feat} Confirm every fact with the owner or listing agent before you publish.`;
    const p2 = `Use this as a starting draft for ${b.city}. It is not an appraisal, CMA, or offer. SMART REALTY.US LLC is not a licensed brokerage.`;
    return { h1, h2, h3, p1, p2 };
  }

  function mailHref(text) {
    const email = val("cEmail");
    const sub = "Listing copy $150 — " + (val("cAddr") || val("cCity") || "SMART REALTY.US LLC");
    const body = [
      "I want the $150 listing copy pack from SMART REALTY.US LLC.",
      email ? "My email: " + email : "",
      "",
      text || "",
      "",
      "I understand this is copywriting, not a brokerage listing, appraisal, or guaranteed sale.",
      "Pay off-site after Andrew invoices. No cards on the website.",
    ]
      .filter((line, i, arr) => line !== "" || arr[i - 1] !== "")
      .join("\n");
    return (
      "mailto:ai@smartrealty.us?subject=" +
      encodeURIComponent(sub) +
      "&body=" +
      encodeURIComponent(body)
    );
  }

  function paint() {
    const d = draft();
    const out = document.getElementById("copyOut");
    if (!out) return;
    out.value = `HEADLINES\n1. ${d.h1}\n2. ${d.h2}\n3. ${d.h3}\n\nDESCRIPTION\n${d.p1}\n\n${d.p2}\n`;
    const a = document.getElementById("copyMail");
    if (a) a.href = mailHref(out.value);
  }

  document.getElementById("copyForm")?.addEventListener("input", paint);
  document.getElementById("copyForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    paint();
  });
  document.getElementById("copyBtn")?.addEventListener("click", async () => {
    paint();
    const t = document.getElementById("copyOut")?.value || "";
    try {
      await navigator.clipboard.writeText(t);
      const m = document.getElementById("copyMsg");
      if (m) m.textContent = "Copied. Edit before you send it to a client.";
    } catch {
      const m = document.getElementById("copyMsg");
      if (m) m.textContent = "Copy the box manually.";
    }
  });
  paint();
})();
