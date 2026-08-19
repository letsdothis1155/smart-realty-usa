/* Shared lead-form handler. Stores locally if PHP API is offline. */
(function () {
  const KEY = "sru_leads_local";

  function $(s, r) {
    return (r || document).querySelector(s);
  }

  function readLocal() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocal(row) {
    const list = readLocal();
    list.push(row);
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(-80)));
    } catch {
      /* quota */
    }
  }

  async function submitFromForm(form) {
    const fd = new FormData(form);
    const payload = {
      email: String(fd.get("email") || "").trim(),
      name: String(fd.get("name") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      state: String(fd.get("state") || "").trim(),
      intent: String(fd.get("intent") || form.getAttribute("data-intent") || "").trim(),
      interest: String(fd.get("intent") || form.getAttribute("data-intent") || "").trim(),
      budget: String(fd.get("budget") || "").trim(),
      property: String(fd.get("property") || "").trim(),
      message: String(fd.get("notes") || fd.get("message") || "").trim(),
      consent: form.querySelector("[name=consent]") ? !!form.querySelector("[name=consent]").checked : true,
      source: form.getAttribute("data-source") || "start",
    };
    if (!payload.email) throw new Error("Please enter a valid email.");
    if (form.querySelector("[name=consent]") && !payload.consent) {
      throw new Error("Check the box so we can follow up. We will not share this as a paid lead.");
    }
    window.SRU_GROWTH?.track("cta_clicked", { source: payload.source, intent: payload.intent });
    const localRow = { ...payload, id: "local_" + Date.now(), createdAt: new Date().toISOString(), status: "new" };
    try {
      if (window.SRU_AUTH?.submitLead) {
        const data = await SRU_AUTH.submitLead(payload);
        saveLocal({ ...localRow, serverId: data.lead?.id });
        return data.message || "Request received.";
      }
    } catch (err) {
      if (err && (err.code === "NO_API" || err.status === 405 || err.status === 503)) {
        saveLocal(localRow);
        return "Saved on this device. We will follow up when the list is online.";
      }
      throw err;
    }
    saveLocal(localRow);
    return "Saved on this device.";
  }

  function bind(form) {
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "1";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector("[data-lead-msg]") || document.querySelector(form.getAttribute("data-msg") || "#leadMsg");
      const btn = form.querySelector("[type=submit]");
      if (btn) btn.disabled = true;
      try {
        const text = await submitFromForm(form);
        if (msg) {
          msg.textContent = text;
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

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form[data-lead-form]").forEach(bind);
  });

  window.SRU_LEADS = { bind, submitFromForm, readLocal };
})();
