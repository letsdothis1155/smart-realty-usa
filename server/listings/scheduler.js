"use strict";

const { SYNC_DEFAULTS } = require("./constants");

function startPropertySyncScheduler(job, options = {}) {
  const intervalMs = Number(options.intervalMs) || SYNC_DEFAULTS.intervalMs;
  const runOnStart = options.runOnStart !== false;
  const log = options.log || ((msg, extra) => console.log(JSON.stringify({ message: msg, ...extra })));
  let timer = null;
  let startupTimer = null;

  async function fire(trigger) {
    try {
      const result = await job.run({ trigger });
      log("property-sync", {
        trigger,
        skipped: !!result.skipped,
        status: result.status,
        added: result.propertiesAdded,
        updated: result.propertiesUpdated,
        deactivated: result.propertiesDeactivated,
      });
      return result;
    } catch (error) {
      log("property-sync-error", { trigger, error: error.message });
      return { status: "error", error: error.message };
    }
  }

  if (runOnStart) {
    startupTimer = setTimeout(() => fire("startup"), options.startupDelayMs || 2500);
    startupTimer.unref?.();
  }
  timer = setInterval(() => fire("hourly"), intervalMs);
  timer.unref?.();

  return {
    intervalMs,
    stop() {
      if (startupTimer) clearTimeout(startupTimer);
      if (timer) clearInterval(timer);
      startupTimer = null;
      timer = null;
    },
    fire,
  };
}

module.exports = { startPropertySyncScheduler };
