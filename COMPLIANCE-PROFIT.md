# SmartRealty billing & marketplace — compliance dependencies

This document is **not** a legal opinion. Catalog pages and sandbox checkout do **not** mean SmartRealty may charge customers or take referral fees.

SMART REALTY.US LLC is **not a bank**. Live charging is **disabled** in code (`billing.productionApproved` is hard-coded `false`). `BILLING_PRODUCTION=1` is ignored, same pattern as Direct Deposit.

## Unresolved before live charging

- Payment-processor contract (designed adapter: Stripe Checkout + Customer Portal; cards never stored in SmartRealty)
- PCI scope review (Checkout / Elements so PAN never hits SmartRealty servers)
- Subscription terms, refund policy, and cancellation copy
- Sales tax / marketplace facilitator analysis where applicable
- Consumer trial and auto-renewal rules (no deceptive trials)
- Kentucky and other-state money-transmission analysis remains on the banking product, not on SaaS billing — confirm with counsel
- Chargeback and support process

## Unresolved before paid agent / marketplace revenue

- Real-estate licensing for any brokerage activity
- RESPA and state referral-fee rules before paid mortgage / settlement-service referrals
- Advertising disclosure for sponsored / featured listings
- Lead-sharing consent records (already required in software; matching stays off)
- Insurance / lender partner licenses
- Affiliate-tax reporting before cash commissions

## Unresolved before rent collection

Rent collection and custody of user funds are **not implemented**. Do not enable them without payment infrastructure, money-transmission analysis, and partner contracts.

## Financial-partner economics

The ledger can record partner, interchange-like, or deposit-adjacent revenue **only if an actual agreement exists**. Software does **not** assume interchange, interest spread, ACH fees, or card revenue.

## Production flags

| Flag | Value |
|------|--------|
| Live charging | disabled |
| Live money movement | disabled |
| Paid lead matching | disabled pending legal review |
| Production compliance review | required |

Have counsel review this file against processor and partner contracts before flipping any live flag.
