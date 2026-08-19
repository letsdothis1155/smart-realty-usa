"use strict";

/**
 * Non-sensitive audit logger. Never log passwords, tokens, full account
 * numbers, routing numbers, or raw webhook bodies that may contain them.
 */
function createAuditLogger({ sink } = {}) {
  const write = typeof sink === "function" ? sink : (line) => console.log(line);

  function log(event, fields = {}) {
    const safe = {
      ts: new Date().toISOString(),
      event,
      userId: fields.userId || undefined,
      switchId: fields.switchId || undefined,
      connectionId: fields.connectionId || undefined,
      payerType: fields.payerType || undefined,
      status: fields.status || undefined,
      code: fields.code || undefined,
      sandbox: fields.sandbox === true,
      productionMoneyMovement: false,
    };
    write(JSON.stringify(safe));
  }

  return { log };
}

module.exports = { createAuditLogger };
