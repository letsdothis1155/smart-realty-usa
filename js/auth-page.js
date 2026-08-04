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
    if (base) {
      try {
        const healthPath = window.SRU_AUTH.ep
          ? window.SRU_AUTH.ep("health")
          : "/api/health.php";
        const h = await fetch(`${base}${healthPath}`, { method: "GET" });
        if (h.ok) {
          apiHint.textContent = "Accounts service online · passwords hashed on the server";
          apiHint.classList.add("ok");
        } else {
          apiHint.textContent =
            "Accounts API error — use Demo access, or check api/ on GoDaddy hosting";
          apiHint.classList.add("warn");
        }
      } catch {
        apiHint.textContent =
          "Accounts API offline (normal on local static preview) · Demo password still works · On GoDaddy, upload api/ folder";
        apiHint.classList.add("warn");
      }
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
    const pw = $("#signupPassword").value;
    const confirm = $("#signupConfirm").value;
    if (pw !== confirm) {
      showError("Passwords do not match.");
      return;
    }
    if (!$("#signupTerms").checked) {
      showError("Please confirm you understand this is a demo platform.");
      return;
    }
    setBusy(btn, true);
    try {
      if (!window.SRU_AUTH.apiBase()) {
        throw new Error("Account creation needs the Auth API. Run: cd server && npm install && npm start");
      }
      const data = await window.SRU_AUTH.register({
        name: $("#signupName").value,
        email: $("#signupEmail").value,
        password: pw,
        remember: $("#signupRemember").checked,
      });
      await goIn(data);
    } catch (err) {
      showError(err.message);
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

  // Deep-link ?tab=signup
  const tab = params.get("tab");
  if (tab === "signup" || tab === "demo" || tab === "signin") switchTab(tab);
})();
