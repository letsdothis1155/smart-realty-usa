/* Bind lead forms and listing/service cards on revenue pages */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function prefillFromQuery(form) {
    const q = new URLSearchParams(location.search);
    ["property", "city", "state", "name", "email"].forEach((k) => {
      const v = q.get(k);
      const el = form.querySelector(`[name="${k}"]`);
      if (v && el && !el.value) el.value = v.slice(0, 160);
    });
  }

  function bindLeadForm(form) {
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "1";
    prefillFromQuery(form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector("[data-lead-msg]");
      const btn = form.querySelector("[type=submit]");
      const consent = form.querySelector("[name=consent]");
      if (btn) btn.disabled = true;
      try {
        await window.SRU_REVENUE.submitLead({
          email: form.querySelector("[name=email]")?.value,
          name: form.querySelector("[name=name]")?.value,
          phone: form.querySelector("[name=phone]")?.value,
          city: form.querySelector("[name=city]")?.value,
          state: form.querySelector("[name=state]")?.value,
          intent: form.getAttribute("data-intent") || form.querySelector("[name=intent]")?.value,
          budget: form.querySelector("[name=budget]")?.value,
          property: form.querySelector("[name=property]")?.value,
          message: form.querySelector("[name=message]")?.value,
          consent: !!(consent && consent.checked),
          source: form.getAttribute("data-source") || "website",
        });
        if (msg) {
          msg.textContent = "Request saved. We will only use it to follow up on this inquiry. Not a brokerage commitment.";
          msg.classList.remove("hidden", "err");
          msg.classList.add("ok");
        }
        form.reset();
      } catch (err) {
        if (msg) {
          msg.textContent = err.message || "Could not send.";
          msg.classList.remove("hidden", "ok");
          msg.classList.add("err");
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  function renderTiers(host) {
    if (!host || !window.SRU_REVENUE) return;
    const tiers = SRU_REVENUE.listingTiers();
    host.innerHTML = Object.values(tiers)
      .map(
        (t) => `<article class="g-card">
        <h3>${esc(t.name)}</h3>
        <p class="goal-amt">${t.monthlyCents ? esc(SRU_REVENUE.money(t.monthlyCents)) + " / mo catalog" : "Free"}</p>
        <p>${esc(t.blurb)}</p>
        <button type="button" class="btn ${t.id === "free" ? "btn-outline" : "btn-primary"}" data-sku="${esc(t.id)}">${
          t.id === "free" ? "Use free listing" : "Request this plan"
        }</button>
      </article>`
      )
      .join("");
    host.querySelectorAll("[data-sku]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sku = SRU_REVENUE.listingTiers()[btn.getAttribute("data-sku")];
        const order = SRU_REVENUE.sandboxOrder(sku, "listing");
        const box = document.getElementById("orderMsg");
        if (box) {
          box.textContent =
            sku.monthlyCents === 0
              ? "Free listing noted on this device. Live inventory still requires a real property and is not a brokerage listing."
              : `Sandbox request ${order.id} for ${sku.name}. No card was charged. Live billing is off.`;
          box.classList.remove("hidden");
        }
      });
    });
  }

  function renderServices(host) {
    if (!host || !window.SRU_REVENUE) return;
    const skus = SRU_REVENUE.serviceSkus();
    host.innerHTML = Object.values(skus)
      .map(
        (t) => `<article class="g-card">
        <h3>${esc(t.name)}</h3>
        <p class="goal-amt">${esc(SRU_REVENUE.money(t.cents))} catalog</p>
        <p>${esc(t.blurb)}</p>
        <button type="button" class="btn btn-primary" data-svc="${esc(t.id)}">Request this service</button>
      </article>`
      )
      .join("");
    host.querySelectorAll("[data-svc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sku = SRU_REVENUE.serviceSkus()[btn.getAttribute("data-svc")];
        const order = SRU_REVENUE.sandboxOrder(sku, "service");
        const box = document.getElementById("orderMsg");
        if (box) {
          box.textContent = `Sandbox request ${order.id} for ${sku.name}. No card charged. We follow up on the services form below.`;
          box.classList.remove("hidden");
        }
      });
    });
  }

  function investCalc() {
    const form = document.getElementById("investForm");
    const out = document.getElementById("investOut");
    if (!form || !out) return;
    function run() {
      const price = Number(form.price.value) || 0;
      const rent = Number(form.rent.value) || 0;
      const downPct = Number(form.down.value) || 20;
      const rate = Number(form.rate.value) || 6.5;
      const tax = Number(form.tax.value) || 0;
      const ins = Number(form.ins.value) || 0;
      const maint = Number(form.maint.value) || 0;
      const vac = Number(form.vac.value) || 5;
      const down = price * (downPct / 100);
      const loan = Math.max(0, price - down);
      const mRate = rate / 100 / 12;
      const n = 360;
      const mortgage =
        loan <= 0 ? 0 : mRate === 0 ? loan / n : (loan * mRate) / (1 - Math.pow(1 + mRate, -n));
      const gro = rent * 12 * (1 - vac / 100);
      const opex = tax + ins + maint;
      const noi = gro - opex;
      const cashFlow = noi - mortgage * 12;
      const cap = price ? (noi / price) * 100 : 0;
      const coc = down ? (cashFlow / down) * 100 : 0;
      out.innerHTML = `
        <p><strong>Estimated monthly mortgage:</strong> ${esc(SRU_REVENUE.money(Math.round(mortgage * 100)))}</p>
        <p><strong>Estimated NOI / year:</strong> ${esc(SRU_REVENUE.money(Math.round(noi * 100)))}</p>
        <p><strong>Estimated cash flow / year:</strong> ${esc(SRU_REVENUE.money(Math.round(cashFlow * 100)))}</p>
        <p><strong>Cap rate (est.):</strong> ${cap.toFixed(2)}%</p>
        <p><strong>Cash-on-cash (est.):</strong> ${coc.toFixed(2)}%</p>
        <p class="g-fine">Estimates only. Not an appraisal, loan offer, or investment advice. Edit the assumptions.</p>`;
    }
    form.addEventListener("input", run);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      run();
    });
    run();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-lead-form]").forEach(bindLeadForm);
    renderTiers(document.getElementById("listingTiers"));
    renderServices(document.getElementById("serviceSkus"));
    investCalc();
    if (window.SRU_GROWTH) SRU_GROWTH.touchSession();
  });
})();
