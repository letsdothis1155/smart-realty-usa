/* Member account hub */
(function () {
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("reset") || "";
  const resetEmail = params.get("email") || "";

  function showErr(m) {
    const e = $("#accError");
    e.textContent = m || "";
    e.classList.toggle("hidden", !m);
    $("#accStatus").classList.add("hidden");
  }
  function showOk(m) {
    const s = $("#accStatus");
    s.textContent = m || "";
    s.classList.toggle("hidden", !m);
    $("#accError").classList.add("hidden");
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

    let favs = 0;
    try {
      favs = JSON.parse(localStorage.getItem("sru_favs") || "[]").length;
    } catch { /* ignore */ }
    let recent = 0;
    try {
      recent = JSON.parse(localStorage.getItem("sru_recent_searches") || "[]").length;
    } catch { /* ignore */ }
    $("#accStats").innerHTML = `
      <div class="account-stat"><strong>${favs}</strong><span>Saved homes</span></div>
      <div class="account-stat"><strong>${recent}</strong><span>Recent searches</span></div>
      <div class="account-stat"><strong>${user.role === "demo" ? "Demo" : "Full"}</strong><span>Access</span></div>
    `;

    const isDemo = user.role === "demo" || user.id === "demo";
    $("#changeSection").classList.toggle("hidden", isDemo);
    if (isDemo) {
      showOk("Demo guest sessions cannot change password — create a full account.");
    }
  }

  async function boot() {
    // Password reset deep link
    if (resetToken && resetEmail) {
      $("#accountGuest").classList.add("hidden");
      $("#accountMember").classList.remove("hidden");
      $("#changeSection").classList.add("hidden");
      $("#resetSection").classList.remove("hidden");
      $("#accName").textContent = "Reset password";
      $("#accEmail").textContent = resetEmail;
      $("#accAvatar").textContent = "🔑";
      $("#accStats").innerHTML = "";
      return;
    }

    const user = (await window.SRU_AUTH.me()) || window.SRU_AUTH.getUser();
    if (!user || !window.SRU_AUTH.isSignedIn()) {
      $("#accountGuest").classList.remove("hidden");
      $("#accountMember").classList.add("hidden");
      return;
    }
    $("#accountGuest").classList.add("hidden");
    $("#accountMember").classList.remove("hidden");
    $("#resetSection").classList.add("hidden");
    fillUser(user);
  }

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
    location.href = "auth.html?next=account.html";
  });

  boot();
})();
