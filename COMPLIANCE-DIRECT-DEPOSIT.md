# SmartRealty Direct Deposit — compliance dependencies

This document is **not** a legal opinion. The software working in sandbox does **not** mean the product is compliant.

SmartRealty (`SMART REALTY.US LLC`) is **not a bank**. Direct Deposit Switching (system A) only prepares a request for an approved payroll-switch partner and a regulated banking partner. SmartRealty Payouts (system B) is a separate product and is not implemented.

## Production financial activity

**DISABLED** in code. `DIRECT_DEPOSIT_MODE=provider` does not send live payroll or ACH instructions until:

1. A payroll-switch partner (designed adapter: Pinwheel; alternatives: Atomic, Argyle) is contracted
2. A banking / BaaS partner has provisioned receiving accounts
3. The items below are reviewed by qualified counsel and the partners

`DIRECT_DEPOSIT_PRODUCTION` is ignored. `productionApproved` is hard-coded `false`.

## Unresolved before live deposits

- ACH / NACHA originator obligations and partner allocation of those duties
- KYC / KYB for members and for SMART REALTY.US LLC
- AML program, if applicable to the final role
- OFAC screening, if applicable
- Consumer disclosures and electronic authorization (ESIGN / UETA)
- Privacy notice; GLBA if SmartRealty is a financial institution under that statute
- Record-retention schedule for deposit-switch authorizations
- Banking-partner contract, data-security addendum, and complaint process
- State / federal money-transmission analysis for Kentucky and any other user states
- Payroll authorization rules and partner coverage letters
- Identity-verification flow before revealing account/routing numbers in production
- Error-resolution and Reg E analysis (likely the banking partner’s, not SmartRealty’s — confirm)
- Marketing claims: never say “bank,” “FDIC insured by SmartRealty,” or “deposit completed” unless the partner confirms it

## What this repo does today

- Mock / sandbox UX and APIs
- Provider interfaces so SmartRealty is not hard-wired to one vendor
- SQL migration ready for Neon later (not live-wired)
- Webhook signature + replay + idempotency
- No payroll password collection or storage
- No fabricated production balances or ACH

Have counsel review this file against the final partner contracts before flipping any live flag.
