/* Auth page controller — sign in / create account / demo */
(function () {
  const params = new URLSearchParams(location.search);
  const nextUrl = safeNext(params.get("next") || "index.html");

  const $ = (s) => document.querySelector(s);
  const statusEl = $("#authStatus");
  const errorEl = $("#authError");
  const apiHint = $("#apiHint");

  function safeNext(url) {
    if (!url) return "index.html";
    // block open redirects
    if (/^https?:\/\//i.test(url) || url.startsWith("//")) return "index.html";
    if (url.includes("..")) return "index.html";
    return url;
  }

  function showError(msg) {
    errorEl.textContent = msg || "Something went wrong.";
    errorEl.classList.remove("hidden");
    statusEl.classList.add("hidden");
  }

  function showStatus(msg) {
    statusEl.textContent = msg || "";
    statusEl.classList.remove("hidden");
    errorEl.classList.add("hidden");
  }

  function clearMsgs() {
    errorEl.classList.add("hidden");
    statusEl.classList.add("hidden");
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.textContent = busy ? "Please wait…" : btn.dataset.label;
  }

  function switchTab(name) {
    document.querySelectorAll(".auth-tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".auth-form").forEach((f) => {
      f.classList.toggle("hidden", f.dataset.panel !== name);
    });
    clearMsgs();
  }

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });

  async function goIn(data) {
    showStatus(data.message || "Success. Redirecting…");
    setTimeout(() => {
      location.href = nextUrl;
    }, 450);
  }

  // If already signed in, bounce to site
  (async function boot() {
    const base = window.SRU_AUTH.apiBase();
    const live = window.SRU_AUTH.hasLiveApi
      ? await window.SRU_AUTH.hasLiveApi()
      : false;
    const signupTo =
      (window.SRU_CONFIG && window.SRU_CONFIG.auth && window.SRU_CONFIG.auth.signupEmail) ||
      "andrewiredale@smartrealty.us";
    if (live) {
      apiHint.textContent = `Accounts service online · new requests still email ${signupTo}`;
      apiHint.classList.add("ok");
    } else if (base) {
      apiHint.textContent =
        `Browse is open. Request an account and it emails ${signupTo}. Sign-in needs the PHP API (not on GitHub Pages).`;
      apiHint.classList.add("warn");
    } else {
      apiHint.textContent =
        "No API base — open via http:// (not file://) or set auth.apiUrl · Demo password still works";
      apiHint.classList.add("warn");
    }

    if (window.SRU_AUTH.isSignedIn()) {
      const user = await window.SRU_AUTH.me();
      if (user) {
        showStatus(`Already signed in as ${user.name}. Opening site…`);
        setTimeout(() => {
          location.href = nextUrl;
        }, 500);
      }
    }
  })();

  $("#signinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMsgs();
    const btn = $("#signinBtn");
    setBusy(btn, true);
    try {
      if (!window.SRU_AUTH.apiBase()) {
        throw new Error("Create-account / sign-in needs the Auth API. Use Demo access, or run: cd server && npm start");
      }
      const data = await window.SRU_AUTH.login({
        email: $("#signinEmail").value,
        password: $("#signinPassword").value,
        remember: $("#signinRemember").checked,
      });
      await goIn(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(btn, false);
    }
  });

  $("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMsgs();
    const btn = $("#signupBtn");
    if (!$("#signupTerms").checked) {
      showError("Please confirm you understand this is a demo platform.");
      return;
    }
    const name = $("#signupName").value.trim();
    const email = $("#signupEmail").value.trim();
    const note = $("#signupNote")?.value.trim() || "";
    const website = $("#signupWebsite")?.value || "";
    if (name.length < 2) {
      showError("Enter your name.");
      return;
    }
    if (!email) {
      showError("Enter your email.");
      return;
    }
    setBusy(btn, true);
    try {
      const data = await window.SRU_AUTH.requestAccount({ name, email, note, website });
      const to =
        (window.SRU_CONFIG && window.SRU_CONFIG.auth && window.SRU_CONFIG.auth.signupEmail) ||
        "andrewiredale@smartrealty.us";
      if (data.emailed) {
        showStatus(
          data.message ||
            `Request sent to Smart Realty. We will email you at ${email} when your account is ready.`,
        );
        $("#signupForm").reset();
      } else {
        const body = encodeURIComponent(
          `Name: ${name}\nEmail: ${email}\nNote: ${note}\n\nSent from the account request page on smartrealty.us.`,
        );
        const mailto = `mailto:${to}?subject=${encodeURIComponent("Account request: " + name)}&body=${body}`;
        showStatus(
          data.message || "Request saved on our side. Send the same note by email so it hits the inbox.",
        );
        errorEl.innerHTML = `Also <a href="${mailto}">email ${to}</a> so we see it right away.`;
        errorEl.classList.remove("hidden");
      }
    } catch (err) {
      const to =
        (window.SRU_CONFIG && window.SRU_CONFIG.auth && window.SRU_CONFIG.auth.signupEmail) ||
        "andrewiredale@smartrealty.us";
      const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nNote: ${note}\n\nSent from the account request page on smartrealty.us.`,
      );
      const mailto = `mailto:${to}?subject=${encodeURIComponent("Account request: " + name)}&body=${body}`;
      errorEl.innerHTML = `${err.message || "Could not send."} You can also <a href="${mailto}">email ${to}</a>.`;
      errorEl.classList.remove("hidden");
      statusEl.classList.add("hidden");
    } finally {
      setBusy(btn, false);
    }
  });

  $("#demoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMsgs();
    const btn = $("#demoBtn");
    setBusy(btn, true);
    try {
      const data = await window.SRU_AUTH.demoLogin($("#demoPassword").value, false);
      await goIn(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(btn, false);
    }
  });

  $("#forgotForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMsgs();
    const btn = $("#forgotBtn");
    const result = $("#forgotResult");
    setBusy(btn, true);
    try {
      if (!window.SRU_AUTH.apiBase()) {
        throw new Error("Forgot-password needs the accounts API (GoDaddy api/ folder).");
      }
      const data = await window.SRU_AUTH.forgotPassword($("#forgotEmail").value);
      showStatus(data.message || "Check your email.");
      if (data.resetPath) {
        const link = data.resetPath.startsWith("http")
          ? data.resetPath
          : new URL(data.resetPath, location.origin).href;
        result.innerHTML = `Demo reset link:<br><a href="${link}">${link}</a>`;
        result.classList.remove("hidden");
      }
    } catch (err) {
      showError(err.message);
      result?.classList.add("hidden");
    } finally {
      setBusy(btn, false);
    }
  });

  // Deep-link ?tab=signup
  const tab = params.get("tab");
  if (tab === "signup" || tab === "demo" || tab === "signin" || tab === "forgot") switchTab(tab);
})();
