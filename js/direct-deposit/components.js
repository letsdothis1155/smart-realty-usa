/* Reusable Direct Deposit UI components — original SmartRealty chrome */
(function (global) {
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function monogram(name) {
    const parts = String(name || "SR").trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function statusLabel(status) {
    const map = {
      not_configured: "Not configured",
      setup_started: "Setup started",
      pending: "Pending",
      active: "Active",
      action_required: "Action required",
      failed: "Failed",
      disabled: "Disabled",
    };
    return map[status] || status || "Unknown";
  }

  function allocationCopy(item) {
    if (!item) return "—";
    if (item.allocationType === "entire" || item.allocationValue === 100 && item.allocationType === "percent") {
      return "100% of each paycheck";
    }
    if (item.allocationType === "percent") return `${item.allocationValue}% of each paycheck`;
    if (item.allocationType === "fixed") return `$${Number(item.allocationValue).toFixed(2)} per paycheck`;
    return "—";
  }

  function PayerCard(payer, onSelect) {
    const btn = el(`
      <button type="button" class="dd-payer" data-type="${payer.type}">
        <span class="dd-payer-mark">${monogram(payer.name)}</span>
        <span class="dd-payer-name"></span>
      </button>`);
    btn.querySelector(".dd-payer-name").textContent = payer.name;
    btn.setAttribute("aria-label", `Select ${payer.name}`);
    btn.addEventListener("click", () => onSelect(payer));
    return btn;
  }

  function PayerGrid(payers, onSelect) {
    const wrap = el(`<div class="dd-grid" role="list"></div>`);
    if (!payers.length) {
      wrap.append(el(`<div class="dd-empty" style="grid-column:1/-1">No matching payers. Try a payroll provider or another spelling.</div>`));
      return wrap;
    }
    payers.forEach((p) => {
      const card = PayerCard(p, onSelect);
      card.setAttribute("role", "listitem");
      wrap.append(card);
    });
    return wrap;
  }

  function PayerTabs(active, onChange) {
    const tabs = [
      ["popular", "Popular"],
      ["employer", "Employer"],
      ["payroll", "Payroll"],
      ["gig", "Gig"],
      ["government", "Government"],
    ];
    const nav = el(`<div class="dd-tabs" role="tablist" aria-label="Who pays you"></div>`);
    tabs.forEach(([id, label]) => {
      const b = el(`<button type="button" class="dd-tab" role="tab">${label}</button>`);
      b.id = `tab-${id}`;
      b.setAttribute("aria-selected", id === active ? "true" : "false");
      b.addEventListener("click", () => onChange(id));
      nav.append(b);
    });
    return nav;
  }

  function PayerSearch({ value, onInput }) {
    const box = el(`
      <div class="dd-search">
        <span class="dd-search-ico" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </span>
        <label class="sr-hp" for="payerQuery">Who pays you?</label>
        <input id="payerQuery" type="search" enterkeyhint="search" autocomplete="off" placeholder="Who pays you?" />
      </div>`);
    const input = box.querySelector("input");
    input.value = value || "";
    input.addEventListener("input", () => onInput(input.value));
    return box;
  }

  function ConnectionModal({ payer, onConfirm, onClose, busy, error }) {
    const modal = el(`
      <div class="dd-modal" role="dialog" aria-modal="true" aria-labelledby="connTitle">
        <div class="dd-modal-card">
          <p class="dd-kicker">Payroll partner</p>
          <h2 id="connTitle" class="dd-title" style="font-size:1.45rem">Connect ${payer ? payer.name : "payer"}</h2>
          <p class="dd-sub">You’ll continue with our payroll partner. SmartRealty never collects or stores your employer or payroll password.</p>
          <p class="dd-legal">This sandbox does not send live payroll instructions.</p>
          <div class="dd-error hidden" id="connErr"></div>
          <div class="dd-actions">
            <button type="button" class="dd-cta" id="connGo">Continue with partner</button>
            <button type="button" class="dd-ghost" id="connNo">Cancel</button>
          </div>
        </div>
      </div>`);
    const err = modal.querySelector("#connErr");
    if (error) {
      err.textContent = error;
      err.classList.remove("hidden");
    }
    const go = modal.querySelector("#connGo");
    go.disabled = !!busy;
    go.addEventListener("click", onConfirm);
    modal.querySelector("#connNo").addEventListener("click", onClose);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) onClose();
    });
    return modal;
  }

  function DepositAllocation({ type, value, onChange }) {
    const wrap = el(`<div class="dd-choices" role="radiogroup" aria-label="Deposit amount"></div>`);
    const options = [
      ["entire", "Entire paycheck", "100% of each paycheck"],
      ["percent", "Percentage", "Send a percent of each paycheck"],
      ["fixed", "Fixed dollar amount", "Send a set amount each paycheck"],
    ];
    options.forEach(([id, title, sub]) => {
      const b = el(`
        <button type="button" class="dd-choice" role="radio">
          <span class="dd-choice-radio" aria-hidden="true"></span>
          <span><strong></strong><span></span></span>
        </button>`);
      b.setAttribute("aria-checked", type === id ? "true" : "false");
      b.querySelector("strong").textContent = title;
      b.querySelector("span span").textContent = sub;
      b.addEventListener("click", () => onChange(id, value));
      wrap.append(b);
    });
    if (type === "percent" || type === "fixed") {
      const field = el(`
        <label class="dd-field">${type === "percent" ? "Percent" : "Dollars per paycheck"}
          <input type="number" min="1" ${type === "percent" ? "max='100'" : "max='1000000'"} step="${type === "percent" ? "1" : "0.01"}" />
        </label>`);
      const input = field.querySelector("input");
      input.value = value || (type === "percent" ? "25" : "250");
      input.addEventListener("input", () => onChange(type, input.value));
      wrap.append(field);
    }
    return wrap;
  }

  function DepositDestination(account) {
    const last = account && account.last4 ? `•••• ${account.last4}` : "Not provisioned";
    const name = account && account.displayName ? account.displayName : "SmartRealty-linked account";
    const box = el(`
      <div class="dd-card dd-dest">
        <div class="dd-dest-mark">SR</div>
        <div>
          <strong></strong>
          <div></div>
          <small></small>
        </div>
      </div>`);
    box.querySelector("strong").textContent = name;
    box.querySelector("div div").textContent = `${name.split(" ")[0]} Account ${last}`;
    box.querySelector("small").textContent = account && account.sandbox
      ? "Sandbox destination · not a live bank account"
      : "Issued by a regulated banking partner. SmartRealty is not a bank.";
    return box;
  }

  function DepositReview({ payer, account, allocation, status }) {
    const box = el(`<dl class="dd-card dd-review"></dl>`);
    const rows = [
      ["Employer / payer", payer ? payer.name : "—"],
      ["Deposit destination", account && account.last4 ? `${account.displayName} •••• ${account.last4}` : "Sandbox destination"],
      ["Amount", allocationCopy(allocation)],
      ["Estimated activation", "Pending employer or payroll processing. Not a completed transfer."],
      ["Status", statusLabel(status || "pending")],
    ];
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      box.append(dt, dd);
    });
    return box;
  }

  function DepositSuccess() {
    return el(`
      <div class="dd-card" style="text-align:center">
        <div class="dd-success-mark" aria-hidden="true">✓</div>
        <h2 class="dd-title" style="font-size:1.6rem">Direct Deposit Setup Submitted</h2>
        <p class="dd-sub">Your employer or payroll provider may take one or more pay cycles to process this. SmartRealty has not moved any money.</p>
      </div>`);
  }

  function DirectDepositStatus(status) {
    const pill = el(`<span class="dd-status"></span>`);
    pill.dataset.s = status || "not_configured";
    pill.textContent = statusLabel(status);
    return pill;
  }

  function DirectDepositDashboard({ dash, onAction }) {
    const wrap = el(`<div></div>`);
    const status = dash.status || "not_configured";
    const sw = dash.switch;
    const dest = dash.destination;
    const card = el(`<section class="dd-card" style="margin-top:1rem"></section>`);
    card.append(DirectDepositStatus(status));
    const meta = el(`<dl class="dd-review"></dl>`);
    const rows = [
      ["Payer", sw && sw.payer ? sw.payer.name : "Not set"],
      ["Destination", dest && dest.last4 ? `${dest.displayName} •••• ${dest.last4}${dest.sandbox ? " (sandbox)" : ""}` : "Not provisioned"],
      ["Amount", allocationCopy(sw)],
      ["Setup date", sw && sw.createdAt ? new Date(sw.createdAt).toLocaleDateString() : "—"],
      ["Most recent detected deposit", sw && sw.lastDetectedDeposit ? sw.lastDetectedDeposit : "None detected"],
      ["Next action", dash.nextAction || "—"],
    ];
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      meta.append(dt, dd);
    });
    card.append(meta);
    wrap.append(card);
    const actions = el(`<div class="dd-actions"></div>`);
    const buttons = [
      ["setup", status === "not_configured" || status === "disabled" || status === "failed" ? "Set up Direct Deposit" : "Manage"],
      ["amount", "Change Amount"],
      ["employer", "Switch Employer"],
      ["account", "View Account Details"],
      ["disable", "Disable Direct Deposit"],
    ];
    buttons.forEach(([id, label], i) => {
      const b = el(`<button type="button" class="${i === 0 ? "dd-cta" : "dd-ghost"}"></button>`);
      b.textContent = label;
      if ((id === "amount" || id === "disable") && !sw) b.disabled = true;
      b.addEventListener("click", () => onAction(id));
      actions.append(b);
    });
    wrap.append(actions);
    wrap.append(el(`<p class="dd-legal">Direct Deposit Switching is not SmartRealty Payouts. Production transfers are disabled.</p>`));
    return wrap;
  }

  function SensitiveAccountDetails({ account, onReveal, onCopy, revealed }) {
    const wrap = el(`<div></div>`);
    wrap.append(el(`<p class="dd-kicker">Banking partner</p>`));
    wrap.append(el(`<h1 class="dd-title">Your Direct Deposit Details</h1>`));
    wrap.append(el(`<p class="dd-sub">SmartRealty is not a bank. These values come only from a regulated partner — when one has issued them.</p>`));
    const dl = el(`<dl class="dd-card dd-sensitive"></dl>`);
    const rows = [
      ["Bank name", account && account.bankName ? account.bankName : "Not provisioned"],
      ["Account holder name", account && account.holderName ? account.holderName : "—"],
      ["Routing number", account && account.routingNumber ? account.routingNumber : "—"],
      ["Account number", account && account.accountNumber ? account.accountNumber : "—"],
      ["Account type", account && account.accountType ? account.accountType : "checking"],
    ];
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      const span = document.createElement("span");
      span.textContent = v;
      dd.append(span);
      if (/routing|account number/i.test(k) && account && account.provisioned) {
        const copy = el(`<button type="button" class="dd-ghost" style="width:auto;padding:0 0.8rem">Copy</button>`);
        copy.addEventListener("click", () => onCopy(k, v));
        dd.append(copy);
      }
      dl.append(dt, dd);
    });
    wrap.append(dl);
    const row = el(`<div class="dd-row-btns" style="margin-top:1rem"></div>`);
    const reveal = el(`<button type="button" class="dd-cta" style="width:auto;padding:0 1.2rem">Reveal</button>`);
    reveal.disabled = !(account && account.provisioned) || !!revealed;
    reveal.addEventListener("click", onReveal);
    row.append(reveal);
    wrap.append(row);
    if (!account || !account.provisioned) {
      wrap.append(el(`<p class="dd-legal">Sandbox / unprovisioned: a banking partner has not issued live routing or account numbers. Nothing shown here is a real SmartRealty account.</p>`));
    } else if (account.sandbox) {
      wrap.append(el(`<p class="dd-legal">Sandbox fixture only. Do not send a real paycheck here.</p>`));
    }
    return wrap;
  }

  function DirectDepositPage(node) {
    return node;
  }

  global.SRU_DD = global.SRU_DD || {};
  global.SRU_DD.ui = {
    el,
    monogram,
    statusLabel,
    allocationCopy,
    PayerCard,
    PayerGrid,
    PayerTabs,
    PayerSearch,
    ConnectionModal,
    DepositAllocation,
    DepositDestination,
    DepositReview,
    DepositSuccess,
    DirectDepositDashboard,
    DirectDepositStatus,
    SensitiveAccountDetails,
    DirectDepositPage,
  };
})(window);
