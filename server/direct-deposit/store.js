"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { id } = require("../lib/ids");

function emptyDb() {
  return {
    connections: [],
    switches: [],
    events: [],
    webhookReceipts: [],
    sessions: [],
    updatedAt: new Date().toISOString(),
  };
}

function createStore({ dataDir, memory = false } = {}) {
  const file = dataDir ? path.join(dataDir, "direct-deposit.json") : null;
  let cache = emptyDb();

  function ensure() {
    if (memory || !file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(emptyDb(), null, 2));
    }
  }

  function read() {
    if (memory || !file) return cache;
    ensure();
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      cache = {
        connections: data.connections || [],
        switches: data.switches || [],
        events: data.events || [],
        webhookReceipts: data.webhookReceipts || [],
        sessions: data.sessions || [],
        updatedAt: data.updatedAt,
      };
      return cache;
    } catch {
      cache = emptyDb();
      return cache;
    }
  }

  function write(next) {
    next.updatedAt = new Date().toISOString();
    cache = next;
    if (memory || !file) return;
    ensure();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, file);
  }

  function mutate(fn) {
    const db = read();
    const result = fn(db);
    write(db);
    return result;
  }

  return {
    read,
    createSession(row) {
      const session = {
        id: row.id || id("sess"),
        userId: row.userId,
        provider: row.provider,
        status: row.status || "started",
        createdAt: now(),
        expiresAt: row.expiresAt,
        sandbox: true,
      };
      return mutate((db) => {
        db.sessions.push(session);
        return session;
      });
    },
    getSession(sessionId) {
      return read().sessions.find((s) => s.id === sessionId) || null;
    },
    updateSession(sessionId, patch) {
      return mutate((db) => {
        const row = db.sessions.find((s) => s.id === sessionId);
        if (!row) return null;
        Object.assign(row, patch, { updatedAt: now() });
        return row;
      });
    },
    createConnection(row) {
      const connection = {
        id: row.id || id("conn"),
        user_id: row.userId,
        provider: row.provider,
        provider_connection_id: row.providerConnectionId || null,
        payer_id: row.payerId || null,
        payer_name: row.payerName || null,
        payer_type: row.payerType || null,
        status: row.status,
        created_at: now(),
        updated_at: now(),
      };
      return mutate((db) => {
        db.connections.push(connection);
        return connection;
      });
    },
    getConnection(idValue) {
      return read().connections.find((c) => c.id === idValue) || null;
    },
    listConnections(userId) {
      return read().connections.filter((c) => c.user_id === userId);
    },
    updateConnection(idValue, patch) {
      return mutate((db) => {
        const row = db.connections.find((c) => c.id === idValue);
        if (!row) return null;
        if (patch.userId) row.user_id = patch.userId;
        if (patch.providerConnectionId !== undefined) row.provider_connection_id = patch.providerConnectionId;
        if (patch.payerId !== undefined) row.payer_id = patch.payerId;
        if (patch.payerName !== undefined) row.payer_name = patch.payerName;
        if (patch.payerType !== undefined) row.payer_type = patch.payerType;
        if (patch.status !== undefined) row.status = patch.status;
        row.updated_at = now();
        return row;
      });
    },
    findConnectionByProviderId(providerConnectionId) {
      return read().connections.find((c) => c.provider_connection_id === providerConnectionId) || null;
    },
    createSwitch(row) {
      const item = {
        id: row.id || id("sw"),
        user_id: row.userId,
        connection_id: row.connectionId,
        destination_account_id: row.destinationAccountId || null,
        allocation_type: row.allocationType,
        allocation_value: row.allocationValue == null ? null : row.allocationValue,
        provider_switch_id: row.providerSwitchId || null,
        status: row.status,
        created_at: now(),
        updated_at: now(),
        last_detected_deposit: null,
      };
      return mutate((db) => {
        db.switches.push(item);
        return item;
      });
    },
    getSwitch(idValue) {
      return read().switches.find((s) => s.id === idValue) || null;
    },
    getSwitchForUser(idValue, userId) {
      const row = read().switches.find((s) => s.id === idValue) || null;
      if (!row) return null;
      if (row.user_id !== userId) {
        const err = new Error("forbidden");
        err.code = "FORBIDDEN";
        throw err;
      }
      return row;
    },
    listSwitches(userId) {
      return read()
        .switches.filter((s) => s.user_id === userId)
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    },
    findOpenSwitch(userId, payerId) {
      const db = read();
      const open = new Set(["pending", "setup_started", "active", "action_required"]);
      return (
        db.switches.find((s) => {
          if (s.user_id !== userId) return false;
          if (!open.has(s.status)) return false;
          const conn = db.connections.find((c) => c.id === s.connection_id);
          return conn && conn.payer_id === payerId;
        }) || null
      );
    },
    findSwitchByProviderId(providerSwitchId) {
      return read().switches.find((s) => s.provider_switch_id === providerSwitchId) || null;
    },
    updateSwitch(idValue, patch) {
      return mutate((db) => {
        const row = db.switches.find((s) => s.id === idValue);
        if (!row) return null;
        if (patch.status !== undefined) row.status = patch.status;
        if (patch.providerSwitchId !== undefined) row.provider_switch_id = patch.providerSwitchId;
        if (patch.lastDetectedDeposit !== undefined) row.last_detected_deposit = patch.lastDetectedDeposit;
        row.updated_at = now();
        return row;
      });
    },
    addEvent(row) {
      const event = {
        id: row.id || id("evt"),
        user_id: row.userId,
        switch_id: row.switchId || null,
        event_type: row.eventType,
        provider_event_id: row.providerEventId || null,
        metadata: sanitizeMetadata(row.metadata),
        created_at: now(),
      };
      return mutate((db) => {
        db.events.push(event);
        return event;
      });
    },
    listEvents(switchId) {
      return read().events.filter((e) => e.switch_id === switchId);
    },
    hasWebhookReceipt(providerEventId) {
      if (!providerEventId) return false;
      return read().webhookReceipts.some((r) => r.provider_event_id === providerEventId);
    },
    addWebhookReceipt(providerEventId, eventType) {
      return mutate((db) => {
        if (db.webhookReceipts.some((r) => r.provider_event_id === providerEventId)) {
          return { duplicate: true };
        }
        db.webhookReceipts.push({
          provider_event_id: providerEventId,
          event_type: eventType,
          received_at: now(),
        });
        return { duplicate: false };
      });
    },
  };
}

function now() {
  return new Date().toISOString();
}

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (/password|secret|token|account_number|routing|ssn|credential/i.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

module.exports = { createStore, emptyDb };
