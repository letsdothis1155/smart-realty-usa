/* Accounts hub — request access on GitHub Pages, member tools when login is live */
(function () {
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("reset") || "";
  const resetEmail = params.get("email") || "";
  const SIGNUP_TO =
    (window.SRU_CONFIG && window.SRU_CONFIG.auth && window.SRU_CONFIG.auth.signupEmail) ||
    "andrewiredale@smartrealty.us";

  function showErr(m) {
    const e = $("#accError");
    if (!e) return;
    e.textContent = m || "";
    e.classList.toggle("hidden", !m);
    $("#accStatus")?.classList.add("hidden");
  }
  function showOk(m) {
    const s = $("#accStatus");
    if (!s) return;
    s.textContent = m || "";
    s.classList.toggle("hidden", !m);
    $("#accError")?.classList.add("hidden");
  }

  function readJson(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function deviceStats() {
    const favs = readJson("sru_favs", []);
    const recent = readJson("sru_recent_searches", []);
    const requests = readJson("sru_account_requests", []);
    return {
      favs: Array.isArray(favs) ? favs.length : 0,
      recent: Array.isArray(recent) ? recent.length : 0,
      requests: Array.isArray(requests) ? requests.length : 0,
    };
  }

  function renderStats(user) {
    const el = $("#accStats");
    if (!el) return;
    const d = deviceStats();
    const access = user
      ? user.role === "demo" || user.id === "demo"
        ? "Demo"
        : "Full"
      : "Guest";
    el.innerHTML = `
      <div class="account-stat"><strong>${d.favs}</strong><span>Saved homes</span></div>
      <div class="account-stat"><strong>${d.recent}</strong><span>Recent searches</span></div>
      <div class="account-stat"><strong>${access}</strong><span>Access</span></div>
    `;
  }

  function renderPending() {
    const el = $("#pendingList");
    if (!el) return;
    const list = readJson("sru_account_requests", []);
    if (!Array.isArray(list) || !list.length) {
      el.innerHTML = `<p class="auth-lead" style="margin:0">No request saved on this device yet.</p>`;
      return;
    }
    const esc = (v) =>
      String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    el.innerHTML = list
      .slice(-8)
      .reverse()
      .map((r) => {
        const when = r.at ? new Date(r.at).toLocaleString() : "";
        return `<div class="account-pending-row"><strong>${esc(r.name || "Request")}</strong><span>${esc(r.email || "")}</span><span class="muted">${esc(when)}</span></div>`;
      })
      .join("");
  }

  function fillUser(user) {
    $("#accName").textContent = user.name || "Member";
    $("#accEmail").textContent = user.email || "";
    $("#accRole").textContent = user.role || "member";
    const initials = (user.name || "M")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    $("#accAvatar").textContent = initials;
    renderStats(user);

    const isDemo = user.role === "demo" || user.id === "demo";
    $("#changeSection")?.classList.toggle("hidden", isDemo);
    $("#accSignOut")?.classList.remove("hidden");
    if (isDemo) {
      showOk("Demo guest sessions cannot change password — request a full account.");
    }
  }

  function showGuest() {
    $("#accountGuest")?.classList.remove("hidden");
    $("#accountMember")?.classList.add("hidden");
    $("#accSignOut")?.classList.add("hidden");
    renderStats(null);
    renderPending();
  }

  function showMember() {
    $("#accountGuest")?.classList.add("hidden");
    $("#accountMember")?.classList.remove("hidden");
    $("#resetSection")?.classList.add("hidden");
  }

  async function boot() {
    if (resetToken && resetEmail) {
      $("#accountGuest")?.classList.add("hidden");
      $("#accountMember")?.classList.remove("hidden");
      $("#changeSection")?.classList.add("hidden");
      $("#resetSection")?.classList.remove("hidden");
      $("#accName").textContent = "Reset password";
      $("#accEmail").textContent = resetEmail;
      $("#accAvatar").textContent = "🔑";
      renderStats(null);
      return;
    }

    const user = (await window.SRU_AUTH.me()) || window.SRU_AUTH.getUser();
    if (!user || !window.SRU_AUTH.isSignedIn()) {
      showGuest();
      return;
    }
    showMember();
    fillUser(user);
  }

  $("#accountRequestForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("");
    if (!$("#reqTerms")?.checked) {
      return showErr("Please confirm you understand this is a demo platform.");
    }
    const name = $("#reqName").value.trim();
    const email = $("#reqEmail").value.trim();
    const note = $("#reqNote")?.value.trim() || "";
    const website = $("#reqWebsite")?.value || "";
    const btn = $("#reqBtn");
    const label = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Please wait…";
    }
    try {
      const data = await window.SRU_AUTH.requestAccount({ name, email, note, website });
      if (data.emailed) {
        showOk(
          data.message ||
            `Request sent to ${SIGNUP_TO}. We will email you at ${email} when your account is ready.`,
        );
        e.target.reset();
      } else {
        const body = encodeURIComponent(
          `Name: ${name}\nEmail: ${email}\nNote: ${note}\n\nSent from the accounts page on smartrealty.us.`,
        );
        const mailto = `mailto:${SIGNUP_TO}?subject=${encodeURIComponent("Account request: " + name)}&body=${body}`;
        showOk(data.message || "Request saved on this device.");
        const err = $("#accError");
        err.innerHTML = `Also <a href="${mailto}">email ${SIGNUP_TO}</a> so it hits the inbox.`;
        err.classList.remove("hidden");
      }
      renderPending();
      renderStats(null);
    } catch (err) {
      const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nNote: ${note}\n\nSent from the accounts page on smartrealty.us.`,
      );
      const mailto = `mailto:${SIGNUP_TO}?subject=${encodeURIComponent("Account request: " + name)}&body=${body}`;
      const box = $("#accError");
      box.innerHTML = `${err.message || "Could not send."} You can also <a href="${mailto}">email ${SIGNUP_TO}</a>.`;
      box.classList.remove("hidden");
      $("#accStatus")?.classList.add("hidden");
      renderPending();
      renderStats(null);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label || "Send account request";
      }
    }
  });

  $("#changeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("");
    const a = $("#newPw").value;
    const b = $("#newPw2").value;
    if (a !== b) return showErr("New passwords do not match.");
    try {
      const data = await window.SRU_AUTH.changePassword({
        currentPassword: $("#curPw").value,
        newPassword: a,
      });
      showOk(data.message || "Password updated.");
      e.target.reset();
    } catch (err) {
      showErr(err.message || "Could not update password.");
    }
  });

  $("#resetForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("");
    if ($("#resetPw").value !== $("#resetPw2").value) {
      return showErr("Passwords do not match.");
    }
    try {
      const data = await window.SRU_AUTH.resetPassword({
        email: resetEmail,
        token: resetToken,
        password: $("#resetPw").value,
        remember: true,
      });
      showOk(data.message || "Password reset.");
      setTimeout(() => {
        location.href = "index.html";
      }, 800);
    } catch (err) {
      showErr(err.message || "Reset failed.");
    }
  });

  $("#accSignOut")?.addEventListener("click", () => {
    window.SRU_AUTH.logout();
    location.href = "account.html";
  });

  boot();
})();
