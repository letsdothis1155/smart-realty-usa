"use strict";

function last4(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

function maskAccountNumber(value) {
  const four = last4(value);
  if (!four) return "••••";
  return `•••• ${four}`;
}

function maskRoutingNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "•••••••••";
  return `•••••${digits.slice(-4)}`;
}

function publicAccountView(account, { revealed = false } = {}) {
  if (!account) return null;
  const provisioned = account.provisioned === true && !!account.routingNumber && !!account.accountNumber;
  const view = {
    id: account.id,
    displayName: account.displayName,
    bankName: account.bankName || null,
    holderName: account.holderName || null,
    accountType: account.accountType || "checking",
    last4: account.last4 || last4(account.accountNumber),
    provisioned,
    sandbox: account.sandbox === true,
    routingNumber: provisioned ? maskRoutingNumber(account.routingNumber) : null,
    accountNumber: provisioned ? maskAccountNumber(account.accountNumber) : null,
    revealed: false,
  };
  if (revealed && provisioned) {
    view.routingNumber = String(account.routingNumber);
    view.accountNumber = String(account.accountNumber);
    view.revealed = true;
  }
  return view;
}

module.exports = { last4, maskAccountNumber, maskRoutingNumber, publicAccountView };
