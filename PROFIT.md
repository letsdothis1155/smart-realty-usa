# SMARTREALTY PROFIT ENGINE

Company: SMART REALTY.US LLC. SmartRealty is **not a bank**. Revenue **$0**. Live charging **disabled**.

Optimize around: what valuable problem can SmartRealty solve repeatedly that somebody is willing to pay for?

PAYCHECK → SMARTREALTY → PROPERTY GOALS → SMART TOOLS → PREMIUM VALUE → REAL-ESTATE SERVICES → BUSINESS ECOSYSTEM → RECURRING REVENUE → PROFIT

## Flywheel

```
FREE SMARTREALTY TOOLS
        ↓
     USERS
        ↓
DIRECT DEPOSIT + GOALS
        ↓
 HIGHER ENGAGEMENT
        ↓
 SMARTREALTY PLUS
        ↓
REAL-ESTATE MARKETPLACE
        ↓
  PARTNER SERVICES
        ↓
 AGENT / BUSINESS TOOLS
        ↓
 RECURRING REVENUE
        ↓
 BETTER SMARTREALTY PRODUCT
        ↓
     MORE USERS
```

Direct deposit is a retention engine, not the paid product. A $2,000 paycheck is **not** $2,000 of company revenue.

## Status (19 August 2026)

| Area | Status |
|------|--------|
| Subscriptions | complete (infrastructure; live charging off) |
| Free Tier | complete |
| Plus | complete (catalog + surfaces; not live billed) |
| Pro | complete (catalog + surfaces; not live billed) |
| Business | complete (catalog + surfaces; not live billed) |
| Agent Platform | complete (architecture + pages; matching off) |
| Marketplace | complete (architecture + pages; live matching off) |
| Partner Revenue | complete (event schema; no invented partner $) |
| Entitlements | complete (`canUse` / `checkLimit`) |
| Billing | complete (mock + Stripe adapter gated) |
| Revenue Ledger | complete |
| Cost Tracking | complete |
| MRR / ARR | complete (production = $0) |
| CAC | complete (null until marketing spend + payers) |
| LTV | complete (null until churn can be computed) |
| Contribution Margin | complete |
| Profitability Dashboard | complete |
| Break-Even Calculator | complete |
| Founder Dashboard | complete |
| Live Money Movement | disabled |
| Production Compliance Review | required |

## Surfaces

Public: `/pricing/`, `/plus/`, `/pro/`, `/professionals/`, `/agents/`, `/marketplace/`, `/business/`, `/workplace/`, `/property-intelligence/`, `/property-owner/`

Admin: `/admin/founder/`, `/admin/revenue/`, `/admin/profitability/`, `/admin/economics/`

API (Node, live charging off): `/api/billing/catalog`, `/api/billing/me`, `/api/billing/checkout`, `/api/billing/cancel`, `/api/admin/profit`

PHP (GoDaddy): `/api/profit-catalog.php`, `/api/profit-stats.php`

## Default catalog (admin-configurable, not live billed)

| Plan | Default monthly | Default annual |
|------|-----------------|----------------|
| Free | $0 | $0 |
| Plus | $9.99 | $99.90 (16.7% less than 12× monthly) |
| Pro | $29.99 | $299.90 |
| Business | $79 | $790 |
| Agent Starter | $49 | $490 |
| Agent Pro | $99 | $990 |
| Brokerage | $299 | $2,990 |
| Enterprise | contract | contract |

Admin changes prices via `POST /api/admin/profit/config`. Do not hard-code prices in product checks — use entitlements.

## Monetization order (followed)

1. Subscription infrastructure, Free/Plus, entitlements, revenue + cost analytics — **this ship**
2. Plus product depth, Property Intelligence, annual plans — catalog ready, charging off
3. Agents, professionals, B2B, marketplace — pages + APIs, matching off
4. Partnerships, referral revenue, Business — schema ready
5. Enterprise, Workplace, advanced marketplace economics — contract-shaped, not live

## Ethics (enforced in code)

Banned: selling payroll/bank/account data, undisclosed fees, deceptive trials, cancellation friction, fake products, fabricated returns, silent paid enrollment, treating deposits as revenue.

Cancellation is one POST. Upgrade prompts run **after** a user gets value (first property goal), not at signup.

## Tests

`cd server && npm test` — includes profit-engine tests (no live Stripe, no card storage, founder dashboard stays $0 with sandbox subs).
