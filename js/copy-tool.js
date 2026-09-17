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
      "I can pay securely by Stripe at https://buy.stripe.com/7sY9AVdfx0edbKqfhTebu00.",
    ]
      .filter((line, i, arr) => line !== "" || arr[i - 1] !== "")
      .join("\n");
    return (
      "mailto:andrewiredale@smartrealty.us?subject=" +
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
  document.getElementById("copyHire")?.addEventListener("click", async () => {
    paint();
    const msg = document.getElementById("copyMsg");
    const email = val("cEmail");
    const name = (email.split("@")[0] || "Copy client").replace(/[^\w.\- ]+/g, " ").trim() || "Copy client";
    if (!email) {
      if (msg) msg.textContent = "Enter your email so Andrew can quote the $150 pack.";
      document.getElementById("cEmail")?.focus();
      return;
    }
    const note = [
      "Listing copy pack | starting quote USD 150 | /copy/",
      "Address: " + (val("cAddr") || "(none)"),
      "City: " + (val("cCity") || "(none)"),
      "Type: " + (val("cType") || "(none)"),
      "Beds/baths/sqft: " + [val("cBeds"), val("cBaths"), val("cSqft")].join("/"),
      "Facts: " + (val("cFeats") || "(none)"),
    ].join(" | ").slice(0, 500);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email, intent: "services", note, website: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok !== true) throw new Error(data.error || "Could not save that request.");
      if (msg) {
        msg.textContent = data.emailed
          ? "Brief received. Andrew was notified. Pay with Stripe only after he confirms the job."
          : "Brief saved. Email Andrew from the button next to this, then pay only after he confirms.";
      }
    } catch (err) {
      if (msg) msg.textContent = (err.message || "Could not send.") + " Use Email $150 job.";
    }
  });
  paint();
})();
