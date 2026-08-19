# Smart Realty USA — D‑U‑N‑S® Number & company setup

**Goal:** Establish a real, verifiable U.S. business identity for Smart Realty USA.

> **Important:** A **D‑U‑N‑S Number is not a license**.  
> It is a free **9-digit business identifier** issued by **Dun & Bradstreet (D&B)**.  
> Real-estate **brokerage licenses** are separate and regulated by each U.S. state.

Official contact email (demo): **ai@smartrealty.us**  
Account requests: **andrewiredale@smartrealty.us**

**Filed facts (do not invent a second LLC):**  
SMART REALTY.US LLC · Kentucky member-managed LLC · filed 3 Aug 2026 · SOS **1614978.06** · owner **Andrew Iredale Jr** (100%) · registered agent on Articles **Andrew Iredale** · **2611 Harmony Rd, Louisville, KY 40299**. D‑U‑N‑S is **not issued yet**. Do not put the EIN on this site.

---

## Why you want a D‑U‑N‑S Number

| Use | Why it helps |
|-----|----------------|
| Business credit profile | Starts your D&B credit file |
| Banks / vendors / net-30 accounts | Many require D‑U‑N‑S to onboard |
| Apple Developer / some B2B platforms | Business verification |
| Government / SAM.gov (if ever needed) | Often linked with UEI / entity registration |
| Professional image | Shows the company is a real operating entity |

**Cost:** Requesting a D‑U‑N‑S Number is **free**.  
D&B may upsell credit-monitoring or “builder” packages — **optional**, not required for the number.

**Time:** Application takes minutes. Issuance can be **a few days to ~30 days** (varies). Paid expedite options are optional.

---

## Step 0 — Form the company (if not done)

Before D‑U‑N‑S, have a real legal entity:

1. **Choose structure** — LLC is common for startups (talk to a CPA/attorney for your state)
2. **File with your state** — Articles of Organization / Incorporation
3. **Get an EIN (free)** — IRS online:  
   https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online
4. **Open a business bank account** — same legal name as formation docs
5. **Register domain + email** — e.g. `smartrealty.us` / `ai@smartrealty.us`

Keep one **canonical** legal name and address. Use it everywhere.

---

## Step 1 — Lookup first (you may already have one)

D&B sometimes creates numbers when others inquire about your company.

1. Open: https://www.dnb.com/en-us/smb/duns/duns-lookup.html  
   (or search “DUNS lookup Dun Bradstreet”)
2. Search by **exact legal name** and city/state
3. If found → **claim / manage** the record (D‑U‑N‑S Manager / Company Update)
4. If not found → go to Step 2

---

## Step 2 — Request a free D‑U‑N‑S Number

1. Go to: https://www.dnb.com/en-us/smb/duns/get-a-duns.html
2. Choose **U.S.-based business** (if applicable)
3. Fill the form carefully — match formation docs **exactly**

### Information to have ready

- [x] Legal business name — **SMART REALTY.US LLC**
- [x] Trade name / DBA — **Smart Realty USA**
- [x] Physical street address — **2611 Harmony Rd, Louisville, KY 40299** (no P.O. box)
- [x] Mailing address — same
- [x] Phone + business email — **1-800-762-7879** / **502-539-1090** · **ai@smartrealty.us**
- [x] Owner / officer — **Andrew Iredale Jr**, Owner / Managing Member
- [x] Business structure — Kentucky member-managed LLC
- [x] Year started — **2026** (filed 3 Aug 2026, SOS 1614978.06)
- [x] Employees — **1**
- [x] Line of business — Software and digital technology; public real-estate demo; **not** a licensed brokerage
- [ ] EIN — retrieve from IRS if already assigned; do not apply twice; do not publish
- [x] Website URL — https://smartrealty.us

### Avoid common mistakes

- Typos in legal name vs state filing  
- Using a nickname instead of the registered entity name  
- Paying for a “DUNS package” thinking it’s required — **the number itself is free**  
- Submitting a residential address you can’t verify later  

---

## Step 3 — After you receive the number

1. Save the **9-digit D‑U‑N‑S** in your password manager  
2. Add it to company records and contracts  
3. Put it in project config when ready:

```js
// domain-config.js
window.SRU_CONFIG = {
  // ...
  legalName: "SMART REALTY.US LLC",
  dunsNumber: "XXXXXXXXX",           // 9 digits, no spaces
  // ein stays empty on the public site
};
```

4. Optionally create a D&B online account to **update** company details (revenue, contacts)  
5. Use the same identity for bank, Stripe/commerce, app stores, vendors  

---

## Step 4 — Related credentials (recommended stack)

| Credential | Who | Cost | Notes |
|------------|-----|------|--------|
| **EIN** | IRS | Free | Tax ID for banking & payroll |
| **D‑U‑N‑S** | Dun & Bradstreet | Free | Business ID / credit file |
| **State entity** | Secretary of State | Filing fee | LLC/Corp formation |
| **Business license** | City/county | Varies | Local operating license |
| **Real estate license** | State RE commission | Varies | **Required to broker real estate deals** — separate from DUNS |
| **Domain + professional email** | GoDaddy / etc. | Varies | Brand trust |
| **UEI / SAM.gov** | Federal | Free | Only if you bid on federal work |

---

## Real estate “license” vs D‑U‑N‑S (don’t confuse them)

| | D‑U‑N‑S | Real estate broker/agent license |
|--|---------|----------------------------------|
| Issued by | Dun & Bradstreet | Your **state** real estate commission |
| Purpose | Business identity / credit | Legal authority to broker property |
| Required to show a demo website? | No | No (demo only) |
| Required to close real deals for clients? | No | **Yes** (in regulated states) |

If Smart Realty USA will operate as a brokerage, consult a **real-estate attorney** and complete state licensing — DUNS alone is not enough.

---

## Suggested 7-day plan

| Day | Action |
|-----|--------|
| 1 | Confirm legal name, address, EIN (or apply for EIN) |
| 1 | D‑U‑N‑S lookup → request if missing |
| 2 | Business bank account application |
| 2–3 | Domain email (ai@…) + website on hosting |
| 3 | Draft privacy policy / terms for public site |
| 4–7 | Track D&B email; complete any verification call |
| When issued | Store DUNS; update `domain-config.js` + internal docs |

---

## Official links (bookmark these)

- Get a D‑U‑N‑S: https://www.dnb.com/en-us/smb/duns/get-a-duns.html  
- Lookup D‑U‑N‑S: https://www.dnb.com/en-us/smb/duns/duns-lookup.html  
- D&B DUNS overview: https://www.dnb.com/en-us/smb/duns.html  
- Free EIN (IRS): https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online  

Phone assistance is sometimes available through D&B (numbers change). Prefer starting on the website so you don’t accept paid products by accident.

---

## Demo site hooks

- Marketing strip on the homepage: **#business**  
- In-app checklist modal: **Open setup checklist**  
- Full deploy walkthrough: `CUSTOM-DOMAIN-WALKTHROUGH.md`  

---

## Status tracker (fill in)

| Field | Value |
|-------|--------|
| Legal name | _______________________________ |
| State of formation | _____________ |
| EIN | _____________ |
| D‑U‑N‑S | _____________ |
| Physical address | _______________________________ |
| Application date | _____________ |
| Number received date | _____________ |
| D&B account email | _____________ |

---

© 2026 Smart Realty USA · Demo materials · All Rights Reserved  
Contact: ai@smartrealty.us
