/* Smart Realty USA — Supabase session, member gates, and saved-listing sync. */
(function (global) {
  "use strict";

  const cfg = global.SRU_SUPABASE_CONFIG || {};
  const state = {
    client: null,
    session: null,
    configured: false,
    error: "",
  };

  function configReady() {
    return (
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(cfg.url || "")) &&
      String(cfg.anonKey || "").length > 40 &&
      !String(cfg.anonKey).includes("YOUR_")
    );
  }

  function sitePath(file) {
    const clean = String(file || "").replace(/^\/+/, "");
    if (/\.github\.io$/i.test(location.hostname)) {
      const project = location.pathname.split("/").filter(Boolean)[0] || "";
      return `/${project}/${clean}`.replace(/\/{2,}/g, "/");
    }
    return `/${clean}`;
  }

  function safeNext(raw) {
    if (!raw) return sitePath("index.html");
    try {
      const target = new URL(String(raw), location.href);
      if (target.origin !== location.origin || !/^https?:$/.test(target.protocol)) {
        return sitePath("index.html");
      }
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return sitePath("index.html");
    }
  }

  function authPageUrl(next) {
    return `${sitePath("auth.html")}?next=${encodeURIComponent(safeNext(next || location.href))}`;
  }

  function signupSource() {
    const ownOriginReferrer = (() => {
      try {
        const ref = new URL(document.referrer);
        return ref.origin === location.origin ? `${ref.pathname}${ref.search}` : "";
      } catch {
        return "";
      }
    })();
    if (ownOriginReferrer) return ownOriginReferrer;
    if (/\/auth\.html$/i.test(location.pathname)) {
      const intended = new URLSearchParams(location.search).get("next");
      if (intended) return safeNext(intended);
    }
    return `${location.pathname}${location.search}`;
  }

  function callbackUrl(next) {
    const url = new URL(location.href);
    url.hash = "";
    ["code", "error", "error_code", "error_description"].forEach((key) =>
      url.searchParams.delete(key),
    );
    if (/\/auth\.html$/i.test(url.pathname)) {
      url.searchParams.set("next", safeNext(next || url.searchParams.get("next")));
    }
    return url.href;
  }

  function userLabel(user) {
    const meta = (user && user.user_metadata) || {};
    return meta.full_name || meta.name || (user && user.email ? user.email.split("@")[0] : "Member");
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", !!hidden);
    el.toggleAttribute("hidden", !!hidden && el.hasAttribute("data-auth-visibility"));
  }

  function decorateGates(root) {
    const scope = root || document;
    scope.querySelectorAll?.(".signin-gate[data-requires-auth]").forEach((gate) => {
      if (!gate.querySelector(":scope > .signin-gate-overlay")) {
        const overlay = document.createElement("div");
        overlay.className = "signin-gate-overlay";
        overlay.innerHTML = `
          <span class="signin-gate-lock" aria-hidden="true">🔒</span>
          <strong></strong>
          <p></p>
          <button type="button" class="btn btn-primary btn-sm signin-gate-cta">Sign in to see this</button>`;
        overlay.querySelector("strong").textContent = gate.dataset.gateTitle || "Free member access";
        overlay.querySelector("p").textContent = gate.dataset.gateCopy || "Sign in with a magic link to unlock this section.";
        gate.appendChild(overlay);
      }
      gate.classList.toggle("is-auth-locked", !state.session);
    });
  }

  function updatePageState() {
    const signedIn = !!state.session;
    const user = state.session && state.session.user;
    document.documentElement.classList.toggle("has-member-session", signedIn);
    document.documentElement.classList.toggle("is-member-guest", !signedIn);
    if (signedIn) {
      document.getElementById("openLandingBanner")?.classList.add("hidden");
      document.body.classList.remove("has-open-banner");
    }

    document.querySelectorAll("[data-auth-guest]").forEach((el) => setHidden(el, signedIn));
    document.querySelectorAll("[data-auth-user]").forEach((el) => setHidden(el, !signedIn));
    document.querySelectorAll("[data-user-name]").forEach((el) => {
      el.textContent = signedIn ? userLabel(user) : "Guest";
    });

    const header = document.getElementById("headerUser");
    const headerName = document.getElementById("headerUserName");
    const signIn = document.getElementById("signInNav");
    const account = document.getElementById("signUpNav");
    if (header) setHidden(header, !signedIn);
    if (headerName) headerName.textContent = signedIn ? userLabel(user).split(/\s+/)[0] : "Guest";
    if (signIn) setHidden(signIn, signedIn);
    if (account) setHidden(account, signedIn);

    decorateGates(document);
    document.dispatchEvent(
      new CustomEvent("sru:auth-change", { detail: { session: state.session, user } }),
    );
  }

  function ensureModal() {
    let modal = document.getElementById("supabaseAuthModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "supabaseAuthModal";
    modal.className = "member-auth-modal hidden";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="member-auth-card glass" role="dialog" aria-modal="true" aria-labelledby="memberAuthTitle">
        <button type="button" class="member-auth-close" aria-label="Close">×</button>
        <p class="eyebrow">Free member access</p>
        <h2 id="memberAuthTitle">Unlock every listing detail</h2>
        <p class="member-auth-copy">Use a magic link—no password to remember.</p>
        <form class="member-auth-form">
          <label>Email
            <input type="email" name="email" required autocomplete="email" placeholder="you@email.com" />
          </label>
          <button type="submit" class="btn btn-primary btn-block">Email my sign-in link</button>
        </form>
        <button type="button" class="btn btn-outline btn-block member-google hidden">Continue with Google</button>
        <p class="member-auth-status" role="status"></p>
        <p class="member-auth-fine">Demo platform · Not a licensed brokerage transaction system.</p>
      </div>`;
    document.body.appendChild(modal);

    const close = () => {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    };
    modal.querySelector(".member-auth-close").addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    modal.querySelector(".member-auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button");
      const status = modal.querySelector(".member-auth-status");
      button.disabled = true;
      status.textContent = "Sending…";
      try {
        await sendMagicLink(form.elements.email.value, location.href, {
          signup_source: signupSource(),
          marketing_opt_in: true,
        });
        form.reset();
        status.textContent = "Check your email and tap the sign-in link.";
      } catch (error) {
        status.textContent = error.message || "Could not send the sign-in link.";
      } finally {
        button.disabled = false;
      }
    });

    const google = modal.querySelector(".member-google");
    google.classList.toggle("hidden", cfg.googleOAuthEnabled !== true);
    google.addEventListener("click", async () => {
      const status = modal.querySelector(".member-auth-status");
      status.textContent = "Opening Google…";
      try {
        await signInWithGoogle(location.href);
      } catch (error) {
        status.textContent = error.message || "Google sign-in is unavailable.";
      }
    });
    return modal;
  }

  function openSignIn(options) {
    const opts = options || {};
    const modal = ensureModal();
    const title = modal.querySelector("h2");
    const copy = modal.querySelector(".member-auth-copy");
    if (opts.title) title.textContent = opts.title;
    if (opts.copy) copy.textContent = opts.copy;
    modal.dataset.next = safeNext(opts.next || location.href);
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => modal.querySelector('input[type="email"]')?.focus(), 30);
  }

  async function sendMagicLink(email, next, metadata) {
    if (!state.client) throw new Error(state.error || "Supabase is not configured yet.");
    const cleanEmail = String(email || "").trim();
    if (!cleanEmail) throw new Error("Enter your email address.");
    const { error } = await state.client.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: callbackUrl(next),
        shouldCreateUser: true,
        data: {
          signup_source: (metadata && metadata.signup_source) || signupSource(),
          marketing_opt_in: metadata?.marketing_opt_in !== false,
        },
      },
    });
    if (error) throw error;
  }

  async function signInWithGoogle(next) {
    if (!state.client) throw new Error(state.error || "Supabase is not configured yet.");
    if (cfg.googleOAuthEnabled !== true) throw new Error("Google sign-in is not configured.");
    sessionStorage.setItem("sru_signup_source", signupSource());
    const { error } = await state.client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) throw error;
  }

  async function signOut() {
    if (state.client) await state.client.auth.signOut();
    state.session = null;
    publishSaved([]);
    if (global.SRU_AUTH?.logout) global.SRU_AUTH.logout();
    updatePageState();
  }

  function readLocalIds() {
    const ids = new Set();
    ["sru_favs", "sru_m_favs"].forEach((key) => {
      try {
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        if (Array.isArray(list)) list.forEach((id) => ids.add(String(id)));
      } catch {
        /* ignore malformed local data */
      }
    });
    return [...ids];
  }

  function publishSaved(ids) {
    const clean = [...new Set((ids || []).map(String))];
    localStorage.setItem("sru_favs", JSON.stringify(clean));
    localStorage.setItem("sru_m_favs", JSON.stringify(clean));
    document.dispatchEvent(
      new CustomEvent("sru:saved-listings", { detail: { listingIds: clean } }),
    );
    return clean;
  }

  async function syncSavedListings() {
    if (!state.client || !state.session) return [];
    const userId = state.session.user.id;
    const localIds = readLocalIds();
    if (localIds.length) {
      const { error } = await state.client.from("saved_listings").upsert(
        localIds.map((listingId) => ({ user_id: userId, listing_id: listingId })),
        { onConflict: "user_id,listing_id", ignoreDuplicates: true },
      );
      if (error) throw error;
    }
    const { data, error } = await state.client
      .from("saved_listings")
      .select("listing_id")
      .eq("user_id", userId);
    if (error) throw error;
    return publishSaved((data || []).map((row) => row.listing_id));
  }

  async function setSavedListing(listingId, saved) {
    if (!state.client || !state.session) {
      openSignIn({ title: "Sign in to save this home" });
      return false;
    }
    const match = { user_id: state.session.user.id, listing_id: String(listingId) };
    const request = saved
      ? state.client.from("saved_listings").upsert(match, { onConflict: "user_id,listing_id" })
      : state.client
          .from("saved_listings")
          .delete()
          .eq("user_id", match.user_id)
          .eq("listing_id", match.listing_id);
    const { error } = await request;
    if (error) throw error;
    return true;
  }

  async function touchProfile() {
    if (!state.client || !state.session) return;
    const user = state.session.user;
    const source = sessionStorage.getItem("sru_signup_source") || signupSource();
    const throttleKey = `sru_last_seen_${user.id}`;
    const last = Number(localStorage.getItem(throttleKey) || 0);
    if (Date.now() - last < 60 * 60 * 1000) return;
    const { data } = await state.client
      .from("profiles")
      .select("signup_source")
      .eq("id", user.id)
      .maybeSingle();
    const patch = { last_seen_at: new Date().toISOString() };
    if (!data?.signup_source) patch.signup_source = source;
    const { error } = await state.client.from("profiles").update(patch).eq("id", user.id);
    if (!error) {
      localStorage.setItem(throttleKey, String(Date.now()));
      sessionStorage.removeItem("sru_signup_source");
    }
  }

  async function applySession(session) {
    const wasSignedIn = !!state.session;
    state.session = session || null;
    if (document.readyState === "loading") {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }
    updatePageState();
    if (state.session) {
      touchProfile().catch(() => {});
      syncSavedListings().catch((error) => console.warn("Saved-listing sync failed", error));
    } else if (wasSignedIn) {
      publishSaved([]);
    }
  }

  async function boot() {
    state.configured = configReady();
    if (!state.configured) {
      state.error = "Add your Supabase Project URL and anon key to supabase-config.js.";
      await applySession(null);
      return state;
    }
    if (!global.supabase?.createClient) {
      state.error = "Supabase browser library did not load.";
      await applySession(null);
      return state;
    }
    state.client = global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data, error } = await state.client.auth.getSession();
    if (error) state.error = error.message;
    await applySession(data?.session || null);
    state.client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => applySession(session), 0);
    });
    return state;
  }

  document.addEventListener(
    "click",
    async (event) => {
      const signOutButton = event.target.closest(
        "[data-supabase-signout], #signOutBtn, #accSignOut, #btnSignOut",
      );
      if (signOutButton && state.session) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await signOut();
        location.href = sitePath("index.html");
        return;
      }

      const gate = event.target.closest("[data-requires-auth]");
      if (!gate || state.session) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openSignIn({
        title: gate.dataset.gateTitle || "Sign in to continue",
        copy: gate.dataset.gateCopy || "Use a free magic link—no password required.",
      });
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const modal = document.getElementById("supabaseAuthModal");
      modal?.classList.add("hidden");
      modal?.setAttribute("aria-hidden", "true");
    }
  });

  const api = {
    state,
    client: () => state.client,
    get session() {
      return state.session;
    },
    get configured() {
      return state.configured;
    },
    safeNext,
    authPageUrl,
    signupSource,
    userLabel,
    decorateGates,
    openSignIn,
    sendMagicLink,
    signInWithGoogle,
    signOut,
    syncSavedListings,
    setSavedListing,
    publishSaved,
    ready: null,
  };
  global.SRU_SUPABASE = api;
  api.ready = boot();
})(window);
