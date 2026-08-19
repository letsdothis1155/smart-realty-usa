"use strict";

/**
 * Mock banking-as-a-service partner.
 * SmartRealty is not a bank. This returns a destination handle only.
 * Full routing/account numbers stay unprovisioned unless an explicit
 * sandbox flag is set — and even then they are labeled SANDBOX, not live.
 */
function createMockBankingProvider({ sandboxAccountDetails = false } = {}) {
  return {
    name: "mock-baas",
    sandbox: true,

    async getDirectDepositAccount(userId, user = {}) {
      const account = {
        id: `dest_sandbox_${userId}`,
        displayName: "SmartRealty-linked account",
        bankName: "Sandbox partner bank (not live)",
        holderName: user.name || "SmartRealty member",
        accountType: "checking",
        last4: "4821",
        provisioned: false,
        sandbox: true,
        routingNumber: null,
        accountNumber: null,
        partner: "unprovisioned",
        disclaimer:
          "SmartRealty is not a bank. Deposit details are issued only by a regulated banking partner.",
      };

      if (sandboxAccountDetails) {
        account.provisioned = true;
        account.sandbox = true;
        account.partner = "sandbox-fixture";
        account.bankName = "Sandbox partner bank (not live)";
        // Well-known Federal Reserve routing used in public ACH test docs.
        // Not a SmartRealty account. Never treat as production.
        account.routingNumber = "110000000";
        account.accountNumber = "0000000004821";
        account.last4 = "4821";
      }

      return account;
    },
  };
}

module.exports = { createMockBankingProvider };
