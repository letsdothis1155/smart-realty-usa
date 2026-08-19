"use strict";

const { id } = require("../../lib/ids");
const { findPayer, searchPayers, publicPayer } = require("../payers");
const { userError, CONNECTION_STATUS, SWITCH_STATUS } = require("../constants");

/**
 * Mock payroll-switch partner.
 * Does not collect or store employer/payroll passwords.
 * Does not send ACH or payroll instructions.
 */
function createMockDirectDepositProvider() {
  const connections = new Map();
  const switches = new Map();
  const sessions = new Map();

  return {
    name: "mock",
    sandbox: true,

    async createConnectionSession(userId) {
      const session = {
        id: id("psess"),
        userId,
        provider: "mock",
        sandbox: true,
        /** Partner-hosted auth. SmartRealty never collects payroll passwords. */
        credentialCapture: "provider_hosted",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        status: "open",
      };
      sessions.set(session.id, session);
      return session;
    },

    async getPayers(query, type) {
      return searchPayers(query, type);
    },

    async getPayer(payerId) {
      const payer = findPayer(payerId);
      return payer ? publicPayer(payer) : null;
    },

    async completeConnection({ sessionId, userId, payerId }) {
      const session = sessions.get(sessionId);
      if (!session || session.userId !== userId) {
        throw userError("SESSION_EXPIRED");
      }
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        throw userError("SESSION_EXPIRED");
      }
      const payer = findPayer(payerId);
      if (!payer) throw userError("EMPLOYER_NOT_FOUND");
      if (payer.unsupported) throw userError("UNSUPPORTED_PAYROLL");
      if (payer.simulate === "connection_failed") throw userError("CONNECTION_FAILED");
      if (payer.simulate === "identity_required") throw userError("IDENTITY_REQUIRED");

      const connection = {
        id: id("pconn"),
        userId,
        payerId: payer.id,
        payerName: payer.name,
        payerType: payer.type,
        status: CONNECTION_STATUS.CONNECTED,
        sandbox: true,
        createdAt: new Date().toISOString(),
      };
      connections.set(connection.id, connection);
      session.status = "used";
      return connection;
    },

    async getConnection(connectionId) {
      return connections.get(connectionId) || null;
    },

    async createSwitch(input) {
      const connection = connections.get(input.providerConnectionId);
      if (!connection || connection.userId !== input.userId) {
        throw userError("CONNECTION_FAILED");
      }
      if (input.reject) {
        throw userError("SWITCH_REJECTED");
      }
      const item = {
        id: id("psw"),
        userId: input.userId,
        connectionId: connection.id,
        allocationType: input.allocationType,
        allocationValue: input.allocationValue,
        status: SWITCH_STATUS.PENDING,
        sandbox: true,
        fundsMoved: false,
        createdAt: new Date().toISOString(),
      };
      switches.set(item.id, item);
      return item;
    },

    async getSwitchStatus(switchId) {
      const item = switches.get(switchId);
      if (!item) return null;
      return {
        id: item.id,
        status: item.status,
        sandbox: true,
        fundsMoved: false,
      };
    },

    async cancelSwitch(switchId, userId) {
      const item = switches.get(switchId);
      if (!item || item.userId !== userId) return null;
      item.status = SWITCH_STATUS.DISABLED;
      item.cancelledAt = new Date().toISOString();
      return item;
    },
  };
}

module.exports = { createMockDirectDepositProvider };
