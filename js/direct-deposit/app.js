/* Direct Deposit page orchestrator */
(function (global) {
  const ui = () => global.SRU_DD.ui;
  const api = () => global.SRU_DD.client;

  const state = {
    view: "dashboard",
    step: 1,
    tab: "popular",
    query: "",
    payers: [],
    loading: false,
    error: "",
    session: null,
    payer: null,
    connection: null,
    allocType: "entire",
    allocValue: 100,
    account: null,
    dash: null,
    switch: null,
    modal: false,
    busy: false,
    revealed: false,
  };

  const STEPS = 7;

  function $(id) {
    return document.getElementById(id);
  }

  function setError(msg) {
    state.error = msg || "";
    const box = $("ddError");
    if (!box) return;
    if (state.error) {
      box.textContent = state.error;
      box.classList.remove("hidden");
    } else {
      box.classList.add("hidden");
      box.textContent = "";
    }
  }

  function hashView() {
    const h = (location.hash || "#/").replace(/^#\/?/, "");
    if (h.startsWith("setup")) return "setup";
    if (h.startsWith("account")) return "account";
    return "dashboard";
  }

  function go(view, step) {
    state.view = view;
    if (step) state.step = step;
    const hash = view === "dashboard" ? "#/" : `#/${view}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
    render();
  }

  async function loadDashboard() {
    state.loading = true;
    render();
    try {
      state.dash = await api().dashboard();
      state.account = state.dash.destination;
      state.switch = state.dash.switch;
      setError("");
    } catch (err) {
      state.dash = null;
      setError(api().friendly(err));
    } finally {
      state.loading = false;
      render();
    }
  }

  let searchTimer = null;
  function queueSearch(q) {
    state.query = q;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadPayers(), 180);
  }

  async function loadPayers() {
    state.loading = true;
    renderPayerPane();
    try {
      const data = await api().payers(state.query, state.tab);
      state.payers = data.payers || [];
      setError("");
    } catch (err) {
      state.payers = [];
      setError(api().friendly(err));
    } finally {
      state.loading = false;
      renderPayerPane();
    }
  }

  async function startSetup() {
    state.step = 1;
    state.payer = null;
    state.connection = null;
    state.session = null;
    state.allocType = "entire";
    state.allocValue = 100;
    go("setup", 1);
  }

  async function beginSessionAndPick(payer) {
    state.payer = payer;
    state.modal = true;
    state.error = "";
    render();
  }

  async function confirmConnect() {
    state.busy = true;
    render();
    try {
      state.session = await api().session();
      const conn = await api().connect(state.session.sessionId, state.payer.id);
      state.connection = conn;
      state.modal = false;
      if (!state.account) {
        const acc = await api().account();
        state.account = acc.account;
      }
      state.step = 4;
      setError("");
    } catch (err) {
      setError(api().friendly(err));
    } finally {
      state.busy = false;
      render();
    }
  }

  async function submitSwitch() {
    state.busy = true;
    render();
    try {
      const created = await api().createSwitch({
        connectionId: state.connection.connectionId,
        allocationType: state.allocType,
        allocationValue: state.allocType === "entire" ? 100 : Number(state.allocValue),
        destinationAccountId: state.account && state.account.id,
      });
      state.switch = created;
      state.step = 7;
      setError("");
    } catch (err) {
      setError(api().friendly(err));
    } finally {
      state.busy = false;
      render();
    }
  }

  async function disableSwitch() {
    if (!state.switch || !state.switch.id) return;
    if (!confirm("Disable this Direct Deposit setup? This does not move money.")) return;
    try {
      await api().cancelSwitch(state.switch.id);
      await loadDashboard();
    } catch (err) {
      setError(api().friendly(err));
    }
  }

  async function revealAccount() {
    const password = prompt("Confirm your SmartRealty password to reveal details.");
    if (password == null) return;
    try {
      const data = await api().reveal(password);
      state.account = data.account;
      state.revealed = true;
      setError("");
      render();
    } catch (err) {
      setError(api().friendly(err));
    }
  }

  async function copyValue(label, value) {
    try {
      await navigator.clipboard.writeText(String(value));
      setError("");
      const box = $("ddError");
      if (box) {
        box.classList.remove("hidden");
        box.style.color = "var(--accent)";
        box.textContent = `${label} copied.`;
        setTimeout(() => {
          box.style.color = "";
          if (box.textContent === `${label} copied.`) box.classList.add("hidden");
        }, 1600);
      }
    } catch {
      setError("Could not copy.");
    }
  }

  function signedIn() {
    return !!(global.SRU_AUTH && global.SRU_AUTH.isSignedIn && global.SRU_AUTH.isSignedIn());
  }

  function renderPayerPane() {
    const host = $("ddPayers");
    if (!host) return;
    host.innerHTML = "";
    host.append(ui().PayerSearch({ value: state.query, onInput: queueSearch }));
    host.append(ui().PayerTabs(state.tab, (tab) => {
      state.tab = tab;
      loadPayers();
    }));
    if (state.loading) {
      const sk = ui().el(`<div class="dd-skeleton" aria-hidden="true"><div class="dd-skel"></div><div class="dd-skel"></div><div class="dd-skel"></div></div>`);
      host.append(sk);
      return;
    }
    host.append(ui().PayerGrid(state.payers, beginSessionAndPick));
  }

  function renderSteps() {
    const host = $("ddSteps");
    if (!host) return;
    host.innerHTML = "";
    for (let i = 1; i <= STEPS; i += 1) {
      const dot = ui().el(`<span class="dd-step-dot"></span>`);
      dot.dataset.on = i <= state.step ? "1" : "0";
      host.append(dot);
      if (i < STEPS) host.append(ui().el(`<span class="dd-step-line"></span>`));
    }
  }

  function render() {
    const root = $("ddRoot");
    if (!root) return;
    const title = $("ddHeadTitle");
    const sub = $("ddHeadSub");
    const main = $("ddMain");
    const dock = $("ddDock");
    const modalHost = $("ddModal");
    main.innerHTML = "";
    dock.innerHTML = "";
    modalHost.innerHTML = "";
    $("ddPayers").classList.add("hidden");
    $("ddSteps").classList.add("hidden");

    if (!signedIn()) {
      title.textContent = "SmartRealty Direct Deposit";
      sub.textContent = "Sign in to connect who pays you. SmartRealty is not a bank.";
      main.append(ui().el(`
        <div class="dd-card">
          <p class="dd-sub">This feature needs a SmartRealty member session and the Node API (sandbox by default).</p>
        </div>`));
      const next = encodeURIComponent("/direct-deposit/app/#/setup");
      const a = ui().el(`<a class="dd-cta" href="/auth.html?next=${next}">Sign in</a>`);
      dock.append(a);
      return;
    }

    if (state.view === "account") {
      title.textContent = "Your Direct Deposit Details";
      sub.textContent = "Masked by default. Reveal requires your password.";
      main.append(ui().SensitiveAccountDetails({
        account: state.account,
        revealed: state.revealed,
        onReveal: revealAccount,
        onCopy: copyValue,
      }));
      const back = ui().el(`<button type="button" class="dd-ghost">Back to Direct Deposit</button>`);
      back.addEventListener("click", () => go("dashboard"));
      dock.append(back);
      return;
    }

    if (state.view === "setup") {
      $("ddSteps").classList.remove("hidden");
      renderSteps();
      if (state.step === 1) {
        title.textContent = "Set Up Direct Deposit";
        sub.textContent = "Route some or all of an eligible paycheck to your SmartRealty-linked account.";
        main.append(ui().el(`<div class="dd-intro-art" aria-hidden="true"></div>`));
        main.append(ui().el(`<p class="dd-legal">A regulated payroll partner handles login. SmartRealty never asks for your employer password. This sandbox does not send live ACH or payroll instructions.</p>`));
        const cta = ui().el(`<button type="button" class="dd-cta">Get Started</button>`);
        cta.addEventListener("click", () => {
          state.step = 2;
          if (location.hash !== "#/setup/payers") history.replaceState(null, "", "#/setup/payers");
          loadPayers();
          render();
        });
        dock.append(cta);
      } else if (state.step === 2 || state.step === 3) {
        title.textContent = "Set Up Direct Deposit";
        sub.textContent = "Choose who pays you";
        $("ddPayers").classList.remove("hidden");
        renderPayerPane();
      } else if (state.step === 4) {
        title.textContent = "Select deposit amount";
        sub.textContent = "How much of each eligible paycheck should be routed?";
        main.append(ui().DepositAllocation({
          type: state.allocType,
          value: state.allocValue,
          onChange: (t, v) => {
            state.allocType = t;
            state.allocValue = v;
            render();
          },
        }));
        const cta = ui().el(`<button type="button" class="dd-cta">Continue</button>`);
        cta.addEventListener("click", () => {
          state.step = 5;
          render();
        });
        dock.append(cta);
      } else if (state.step === 5) {
        title.textContent = "Select destination";
        sub.textContent = "Your eligible SmartRealty-linked receiving account.";
        main.append(ui().DepositDestination(state.account));
        const cta = ui().el(`<button type="button" class="dd-cta">Continue</button>`);
        cta.addEventListener("click", () => {
          state.step = 6;
          render();
        });
        dock.append(cta);
      } else if (state.step === 6) {
        title.textContent = "Review";
        sub.textContent = "Confirm this Direct Deposit request.";
        main.append(ui().DepositReview({
          payer: state.payer,
          account: state.account,
          allocation: { allocationType: state.allocType, allocationValue: state.allocValue },
          status: "pending",
        }));
        const cta = ui().el(`<button type="button" class="dd-cta">Confirm Direct Deposit</button>`);
        cta.disabled = state.busy;
        cta.addEventListener("click", submitSwitch);
        dock.append(cta);
      } else {
        title.textContent = "Submitted";
        sub.textContent = "No funds were moved.";
        main.append(ui().DepositSuccess());
        const cta = ui().el(`<button type="button" class="dd-cta">View Direct Deposit Status</button>`);
        cta.addEventListener("click", async () => {
          await loadDashboard();
          go("dashboard");
        });
        dock.append(cta);
      }

      if (state.modal && state.payer) {
        modalHost.append(ui().ConnectionModal({
          payer: state.payer,
          busy: state.busy,
          error: state.error,
          onConfirm: confirmConnect,
          onClose: () => {
            state.modal = false;
            render();
          },
        }));
      }
      return;
    }

    title.textContent = "Direct Deposit";
    sub.textContent = "Put your income to work. Connect a paycheck to your SmartRealty-linked financial account.";
    if (state.loading && !state.dash) {
      main.append(ui().el(`<div class="dd-skeleton"><div class="dd-skel"></div><div class="dd-skel"></div><div class="dd-skel"></div></div>`));
      return;
    }
    main.append(ui().DirectDepositDashboard({
      dash: state.dash || { status: "not_configured" },
      onAction: (id) => {
        if (id === "setup" || id === "manage" || id === "employer") startSetup();
        else if (id === "amount") {
          startSetup().then(() => {
            state.step = 4;
            render();
          });
        } else if (id === "account") go("account");
        else if (id === "disable") disableSwitch();
      },
    }));
  }

  async function boot() {
    state.view = hashView();
    render();
    if (!signedIn()) return;
    await loadDashboard();
    if (state.view === "account" && !state.account) {
      try {
        const data = await api().account();
        state.account = data.account;
        render();
      } catch (err) {
        setError(api().friendly(err));
      }
    }
    if (state.view === "setup") {
      state.step = /setup\/payers/.test(location.hash) ? 2 : 1;
      if (state.step === 2) loadPayers();
      render();
    }
  }

  global.SRU_DD.app = { boot, state, go };
  document.addEventListener("DOMContentLoaded", boot);
  window.addEventListener("hashchange", () => {
    state.view = hashView();
    if (state.view === "setup") {
      state.step = /setup\/payers/.test(location.hash) ? 2 : 1;
      if (state.step === 2) loadPayers();
    }
    render();
  });
})(window);
