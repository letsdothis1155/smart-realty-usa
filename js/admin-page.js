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

  function renderLeads(leads) {
    const body = $("#leadsBody");
    $("#leadsCount").textContent = `${leads.length} lead${leads.length === 1 ? "" : "s"}`;
    if (!leads.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No leads yet. Join the waitlist on the homepage.</td></tr>`;
      return;
    }
    body.innerHTML = leads
      .map(
        (L) => `<tr>
        <td>${esc(formatWhen(L.createdAt))}</td>
        <td>${esc(L.name || "—")}</td>
        <td><a href="mailto:${esc(L.email)}">${esc(L.email)}</a></td>
        <td>${esc(L.source || "—")}</td>
        <td>${esc(L.interest || "—")}</td>
      </tr>`
      )
      .join("");
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
    renderLeads(data.leads || []);
  }

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
      renderLeads(data.leads || []);
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
      const rows = [["createdAt", "name", "email", "source", "interest", "id"]];
      (data.leads || []).forEach((L) => {
        rows.push([
          L.createdAt || "",
          L.name || "",
          L.email || "",
          L.source || "",
          L.interest || "",
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
