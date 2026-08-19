/* Smart Realty — admin leads viewer */
(function () {
  const $ = (s) => document.querySelector(s);
  const KEY = "sru_admin_pass";

  function apiBase() {
    return window.SRU_AUTH?.apiBase?.() || location.origin;
  }

  function usePhp() {
    return window.SRU_AUTH?.usePhp?.() !== false;
  }

  function listPath() {
    return usePhp() ? "/api/leads-list.php" : "/api/leads-list";
  }

  function showErr(m) {
    const el = $("#adminErr");
    if (!el) return;
    el.textContent = m || "";
    el.classList.toggle("hidden", !m);
  }

  function setUnlocked(on) {
    $("#loginCard")?.classList.toggle("hidden", on);
    $("#leadsCard")?.classList.toggle("hidden", !on);
    $("#adminStatus").textContent = on ? "Unlocked" : "Locked";
    $("#adminStatus").classList.toggle("on", on);
  }

  async function fetchLeads(password) {
    const res = await fetch(apiBase() + listPath(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Password": password,
      },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to load leads");
    return data;
  }

  let ALL_LEADS = [];

  function filterValue() {
    return $("#leadsFilter")?.value || "";
  }

  function filteredLeads() {
    const f = filterValue();
    if (!f) return ALL_LEADS;
    return ALL_LEADS.filter((L) =>
      String(L.intent || L.interest || "")
        .toLowerCase()
        .startsWith(f)
    );
  }

  function renderLeads(leads) {
    const body = $("#leadsBody");
    $("#leadsCount").textContent = `${leads.length} lead${leads.length === 1 ? "" : "s"}`;
    if (!leads.length) {
      body.innerHTML = `<tr><td colspan="8" class="admin-empty">No leads yet. Use /start/ or the homepage form.</td></tr>`;
      return;
    }
    const statuses = ["new", "contacted", "qualified", "follow_up", "closed", "spam"];
    body.innerHTML = leads
      .map((L) => {
        const opts = statuses
          .map((s) => `<option value="${s}"${(L.status || "new") === s ? " selected" : ""}>${s}</option>`)
          .join("");
        return `<tr>
        <td>${esc(formatWhen(L.createdAt))}</td>
        <td>${esc(L.name || "—")}</td>
        <td><a href="mailto:${esc(L.email)}">${esc(L.email)}</a></td>
        <td>${esc(L.phone || "—")}</td>
        <td>${esc(L.city || "—")}</td>
        <td>${esc(L.intent || L.interest || "—")}</td>
        <td><select data-lead-status="${esc(L.id)}">${opts}</select></td>
        <td>${esc(L.source || "—")}</td>
      </tr>`;
      })
      .join("");
    body.querySelectorAll("[data-lead-status]").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const pass = sessionStorage.getItem(KEY);
        if (!pass) return;
        const id = sel.getAttribute("data-lead-status");
        const path = usePhp() ? "/api/leads-update.php" : "/api/leads-update";
        try {
          await fetch(apiBase() + path, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Admin-Password": pass },
            body: JSON.stringify({ password: pass, id, status: sel.value }),
          });
        } catch {
          /* stay local */
        }
      });
    });
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
    } catch {
      return iso;
    }
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function unlock(password) {
    showErr("");
    const data = await fetchLeads(password);
    sessionStorage.setItem(KEY, password);
    setUnlocked(true);
    ALL_LEADS = data.leads || [];
    renderLeads(filteredLeads());
  }

  $("#leadsFilter")?.addEventListener("change", () => renderLeads(filteredLeads()));

  $("#adminLogin")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await unlock($("#adminPass").value);
    } catch (err) {
      showErr(err.message || "Login failed");
      sessionStorage.removeItem(KEY);
      setUnlocked(false);
    }
  });

  $("#refreshLeads")?.addEventListener("click", async () => {
    const pass = sessionStorage.getItem(KEY);
    if (!pass) return setUnlocked(false);
    try {
      const data = await fetchLeads(pass);
      ALL_LEADS = data.leads || [];
      renderLeads(filteredLeads());
    } catch (err) {
      showErr(err.message);
      setUnlocked(false);
    }
  });

  $("#lockAdmin")?.addEventListener("click", () => {
    sessionStorage.removeItem(KEY);
    setUnlocked(false);
    $("#adminPass").value = "";
  });

  $("#exportCsv")?.addEventListener("click", async () => {
    const pass = sessionStorage.getItem(KEY);
    if (!pass) return;
    try {
      const data = await fetchLeads(pass);
      ALL_LEADS = data.leads || [];
      const rows = [["createdAt", "name", "email", "phone", "city", "state", "intent", "status", "source", "budget", "id"]];
      filteredLeads().forEach((L) => {
        rows.push([
          L.createdAt || "",
          L.name || "",
          L.email || "",
          L.phone || "",
          L.city || "",
          L.state || "",
          L.intent || L.interest || "",
          L.status || "",
          L.source || "",
          L.budget || "",
          L.id || "",
        ]);
      });
      const csv = rows
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `smart-realty-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      showErr(err.message);
    }
  });

  // auto-unlock session
  const saved = sessionStorage.getItem(KEY);
  if (saved) {
    unlock(saved).catch(() => {
      sessionStorage.removeItem(KEY);
      setUnlocked(false);
    });
  }
})();
