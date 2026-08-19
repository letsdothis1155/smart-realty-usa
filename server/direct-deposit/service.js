"use strict";

const bcrypt = require("bcryptjs");
const { publicAccountView } = require("../lib/mask");
const {
  ALLOCATION_TYPES,
  SWITCH_STATUS,
  CONNECTION_STATUS,
  userError,
} = require("./constants");
const { assertSmartSplitInactive } = require("./smartsplit");

function createDirectDepositService({ store, provider, banking, users, audit }) {
  const idempotency = new Map();
  function dashboardStatus(switches) {
    if (!switches.length) return SWITCH_STATUS.NOT_CONFIGURED;
    const current = switches[0];
    return current.status || SWITCH_STATUS.NOT_CONFIGURED;
  }

  function publicSwitch(row, connection) {
    if (!row) return null;
    return {
      id: row.id,
      payer: connection
        ? { id: connection.payer_id, name: connection.payer_name, type: connection.payer_type }
        : null,
      destinationAccountId: row.destination_account_id,
      allocationType: row.allocation_type,
      allocationValue: row.allocation_value,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastDetectedDeposit: row.last_detected_deposit,
      sandbox: true,
      fundsMoved: false,
    };
  }

  async function getDashboard(userId, user) {
    const switches = store.listSwitches(userId);
    const connections = store.listConnections(userId);
    const current = switches[0] || null;
    const connection = current
      ? connections.find((c) => c.id === current.connection_id) || store.getConnection(current.connection_id)
      : null;
    const account = await banking.getDirectDepositAccount(userId, user);
    return {
      product: "direct_deposit_switching",
      payoutsProduct: "separate_not_implemented",
      mode: provider.sandbox ? "mock" : "provider",
      sandbox: true,
      productionFinancialActivity: false,
      status: dashboardStatus(switches),
      switch: publicSwitch(current, connection),
      destination: publicAccountView(account),
      nextAction: nextAction(dashboardStatus(switches)),
    };
  }

  function nextAction(status) {
    switch (status) {
      case SWITCH_STATUS.NOT_CONFIGURED:
        return "Set up Direct Deposit";
      case SWITCH_STATUS.SETUP_STARTED:
        return "Finish connecting who pays you";
      case SWITCH_STATUS.PENDING:
        return "Wait for employer or payroll processing";
      case SWITCH_STATUS.ACTIVE:
        return "Manage amount or destination";
      case SWITCH_STATUS.ACTION_REQUIRED:
        return "Complete the required step";
      case SWITCH_STATUS.FAILED:
        return "Review and try again";
      case SWITCH_STATUS.DISABLED:
        return "Set up Direct Deposit again";
      default:
        return "View status";
    }
  }

  async function searchPayers(query, type) {
    try {
      return await provider.getPayers(query, type);
    } catch (err) {
      if (err.expose) throw err;
      throw userError("PROVIDER_UNAVAILABLE");
    }
  }

  async function createSession(userId) {
    const partner = await provider.createConnectionSession(userId);
    const session = store.createSession({
      id: partner.id,
      userId,
      provider: provider.name,
      status: CONNECTION_STATUS.STARTED,
      expiresAt: partner.expiresAt,
    });
    audit.log("dd.session.created", { userId, sandbox: true });
    return {
      sessionId: session.id,
      provider: provider.name,
      sandbox: true,
      credentialCapture: "provider_hosted",
      expiresAt: session.expiresAt,
      notice: "SmartRealty never collects your employer or payroll password.",
    };
  }

  async function connectSession(userId, sessionId, payerId) {
    const session = store.getSession(sessionId);
    if (!session || session.userId !== userId) throw userError("SESSION_EXPIRED");
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      store.updateSession(sessionId, { status: CONNECTION_STATUS.EXPIRED });
      throw userError("SESSION_EXPIRED");
    }
    const partnerConn = await provider.completeConnection({ sessionId, userId, payerId });
    const connection = store.createConnection({
      userId,
      provider: provider.name,
      providerConnectionId: partnerConn.id,
      payerId: partnerConn.payerId,
      payerName: partnerConn.payerName,
      payerType: partnerConn.payerType,
      status: CONNECTION_STATUS.CONNECTED,
    });
    store.updateSession(sessionId, { status: "connected", connectionId: connection.id });
    audit.log("dd.connection.created", {
      userId,
      connectionId: connection.id,
      payerType: connection.payer_type,
      sandbox: true,
    });
    return {
      connectionId: connection.id,
      payer: {
        id: connection.payer_id,
        name: connection.payer_name,
        type: connection.payer_type,
      },
      status: connection.status,
      sandbox: true,
    };
  }

  function validateAllocation(type, value) {
    if (!ALLOCATION_TYPES.includes(type)) throw userError("INVALID_ALLOCATION");
    if (type === "entire") return { allocationType: "entire", allocationValue: 100 };
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw userError("INVALID_ALLOCATION");
    if (type === "percent") {
      if (n > 100) throw userError("INVALID_ALLOCATION");
      return { allocationType: "percent", allocationValue: Math.round(n * 100) / 100 };
    }
    if (n > 1_000_000) throw userError("INVALID_ALLOCATION");
    return { allocationType: "fixed", allocationValue: Math.round(n * 100) / 100 };
  }

  async function createSwitch(userId, user, input) {
    assertSmartSplitInactive(input);
    const idemKey = input.idempotencyKey ? `${userId}:${input.idempotencyKey}` : null;
    if (idemKey && idempotency.has(idemKey)) {
      return idempotency.get(idemKey);
    }
    const allocation = validateAllocation(input.allocationType, input.allocationValue);
    const connection = store.getConnection(input.connectionId);
    if (!connection || connection.user_id !== userId) throw userError("CONNECTION_FAILED");
    if (store.findOpenSwitch(userId, connection.payer_id)) throw userError("DUPLICATE_SWITCH");

    const account = await banking.getDirectDepositAccount(userId, user);
    if (!account || !account.id) throw userError("ACCOUNT_UNAVAILABLE");
    if (input.destinationAccountId && input.destinationAccountId !== account.id) {
      throw userError("ACCOUNT_UNAVAILABLE");
    }

    const partnerSwitch = await provider.createSwitch({
      userId,
      providerConnectionId: connection.provider_connection_id,
      allocationType: allocation.allocationType,
      allocationValue: allocation.allocationValue,
      destinationAccountId: account.id,
    });

    const row = store.createSwitch({
      userId,
      connectionId: connection.id,
      destinationAccountId: account.id,
      allocationType: allocation.allocationType,
      allocationValue: allocation.allocationValue,
      providerSwitchId: partnerSwitch.id,
      status: SWITCH_STATUS.PENDING,
    });
    store.addEvent({
      userId,
      switchId: row.id,
      eventType: "switch.created",
      providerEventId: `local_${row.id}_created`,
      metadata: { sandbox: true, fundsMoved: false },
    });
    audit.log("dd.switch.created", { userId, switchId: row.id, status: row.status, sandbox: true });
    const result = {
      ...publicSwitch(row, connection),
      destination: publicAccountView(account),
      estimatedActivation: "Employer or payroll processing may take one or more pay cycles. This is not a completed transfer.",
    };
    if (idemKey) idempotency.set(idemKey, result);
    return result;
  }

  function getSwitch(userId, switchId) {
    try {
      const row = store.getSwitchForUser(switchId, userId);
      if (!row) return null;
      return publicSwitch(row, store.getConnection(row.connection_id));
    } catch (err) {
      if (err.code === "FORBIDDEN") throw userError("FORBIDDEN");
      throw err;
    }
  }

  async function cancelSwitch(userId, switchId) {
    const row = store.getSwitchForUser(switchId, userId);
    if (!row) return null;
    if (row.provider_switch_id) {
      await provider.cancelSwitch(row.provider_switch_id, userId);
    }
    const updated = store.updateSwitch(row.id, { status: SWITCH_STATUS.DISABLED });
    store.addEvent({
      userId,
      switchId: row.id,
      eventType: "switch.cancelled",
      providerEventId: `local_${row.id}_cancelled_${Date.now()}`,
      metadata: { sandbox: true },
    });
    audit.log("dd.switch.cancelled", { userId, switchId: row.id, status: SWITCH_STATUS.DISABLED });
    return publicSwitch(updated, store.getConnection(row.connection_id));
  }

  async function getAccount(userId, user) {
    const account = await banking.getDirectDepositAccount(userId, user);
    return publicAccountView(account, { revealed: false });
  }

  async function revealAccount(userId, user, password) {
    if (userId === "demo" || (user && user.role === "demo")) {
      throw userError("REAUTH_REQUIRED");
    }
    const row = users && users.findById ? users.findById(userId) : null;
    if (!row || !row.passwordHash) throw userError("REAUTH_REQUIRED");
    const match = await bcrypt.compare(String(password || ""), row.passwordHash);
    if (!match) throw userError("REAUTH_REQUIRED");
    const account = await banking.getDirectDepositAccount(userId, user);
    if (!account.provisioned) throw userError("NOT_PROVISIONED");
    audit.log("dd.account.revealed", { userId, sandbox: true });
    return publicAccountView(account, { revealed: true });
  }

  return {
    getDashboard,
    searchPayers,
    createSession,
    connectSession,
    createSwitch,
    getSwitch,
    cancelSwitch,
    getAccount,
    revealAccount,
    validateAllocation,
  };
}

module.exports = { createDirectDepositService };
