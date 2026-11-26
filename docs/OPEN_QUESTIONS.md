# Open questions

Answer inline under each question (or in chat). Answered questions move to the bottom with the answer and date.

## Still open

2. **Booklets in use at once.** How many official sales invoice booklets are in use at the same time, and who holds them (one per location, per person, or one for the whole company)?

- **Which brands do you make vs resell?** The catalog assumes JD Foods and ThyChef items are produced (finished goods) and McKeith, Arkadia and Catcher Gourmet are bought and resold (merchandise). Correct?
- **Costs.** The price list has SRPs only. Opening stock needs a cost per item (what it cost to make or buy). Can accounting provide a cost list, even approximate?
- **Price tiers.** The SRP is the retail price. Distributor, reseller, corporate and wholesale prices come in Phase 3; if there's a discount sheet, share it then.
- **Gemilai Espresso Machine + Koryaiko Grinder** show one price (₱75,000) together. Sold only as a set?
- **ThyChef Complete Sample Pack** lists sample sizes (20 g, 50 g, 30 g) that aren't separate SKUs. Are those packed from bulk at the time of sale, or kept as their own stock items?
- **Location names.** I named them "Plaridel FG warehouse" and "Plaridel production store" after the price-list address. Rename if needed (Organization → Locations).

## Phase 3 (sales and shop): needed before the shop goes live

- **Payment details for the shop.** Bank account, GCash and Maya numbers and account names. Enter them in Settings → Online shop (the current text is a placeholder).
- **Price lists.** Regular, corporate, distributor and reseller prices are empty, so everyone pays SRP until they're filled in (Sales → Price lists). Share the discount sheet if there is one.
- **Product photos.** Add a photo link per product (Inventory → Products), or send the photos and I'll bulk-load them.
- **PayMongo.** For online card/GCash/Maya payment: create a PayMongo business account, set PAYMONGO_SECRET_KEY and PAYMONGO_WEBHOOK_SECRET in Vercel yourself (I can't enter keys), then tick the box in Settings → Online shop.
- **Customer logins in the shop.** A business customer who registers sees their prices only after an admin links their login to their customer record. The screen for that comes with the portal phase.
- **Local development.** This PC's network intercepts HTTPS, so the local dev server can't reach Supabase ("unable to verify the first certificate"). Test on the Vercel site, or run Node with --use-system-ca.

## Phase 4 (procurement)

- **VAT rate and treatment.** Purchase orders use 12% VAT for VAT-registered suppliers (setting app_settings.vat_rate, marked needs verification). The accountant should confirm the rate and that input VAT is excluded from stock cost.
- **Supplier list.** Send the current supplier list (name, TIN, VAT status, terms, items they supply, prices) and I'll prepare an import.
- **Who is the buyer?** The operations manager and COO can create POs. Tell me if someone else (e.g. a purchasing officer) should.

## Phase 5 (accounting): needed before the accounting cut-off

- **Accountant review** of the seeded chart of accounts, VAT treatment (zero-rated/exempt items, invoice wording) and EWT rates (BIR 2307).
- **Cut-off date** for opening balances, after the parallel run (a month start, ideally January 1).
- **Opening balances** from the Excel books on that date: trial balance, customer balances (AR), supplier balances (AP), inventory count and value, bank balances.
- **Bank and e-wallet accounts** in use (bank name, last 4 digits only, purpose).
- **Withholding tax rates per supplier** (e.g. 1% goods, 2% services, needs verification). Every supplier starts at 0%, so nothing is withheld until a rate is set on the supplier.
- **Supplier opening balances** show in AP aging but can't be paid through a supplier payment yet (payments settle invoices). Until then, enter old unpaid bills as supplier invoices without a PO, or pay them with a manual journal.
- **VAT on sales:** prices are treated as VAT-inclusive (setting). Confirm, and say whether any items are VAT-exempt or zero-rated (all are taxed at 12% today).

## Scan a document
- **AI key in Vercel:** reading photos needs `ANTHROPIC_API_KEY` set in Vercel (Production). Until then scans open an empty form to type in.
- **Transmittal forms:** send a photo of the current transmittal / delivery slip formats so the reading can be checked against real examples.
- **Petty cash returns:** unspent petty cash returned in cash isn't recorded yet (liquidation shows the balance left). Confirm how returns are handled today.

## Manufacturing
- **Lot number format:** how are lots numbered today (e.g. date + line + batch)? The report accepts any text for now and can suggest the format once known.
- **Next step:** when should production reports start moving stock (finished goods in, materials out)? That needs the recipe/BOM per product.

## CEO reports
- **Morning email:** switch on email (Resend key + Settings → email) so the 7:00 summary arrives by email, not just in the bell.
- **Targets:** enter this year's monthly sales targets (CEO reports → Targets), and per-rep targets if wanted.

## Other open items (not blocking Phase 1)

- **Supabase Auth settings to turn on** (dashboard → Authentication): leaked-password protection (advisor warning); session inactivity timeout / time-box (Pro plan). TOTP MFA is on by default.
- **Test Supabase project for E2E.** `e2e/phase-1a.spec.ts` creates and deletes users, so it should run against a separate test project, not the live one. Create one (free tier is fine) and add its keys as GitHub secrets, or tell me to skip it.
- **Resend** isn't configured yet, so new-device emails are skipped (logged) until RESEND_API_KEY and EMAIL_FROM are set.

- Paste or save the original build prompts as `docs/PROMPTS.md` so future sessions can refer to them.
- If an original CLAUDE.md exists, provide it (the current one is a draft).
- All tax rates, statutory tables, BIR forms and the chart of accounts need accountant sign-off before Phase 5 / 9 go-live.
- Privacy notice text (Data Privacy Act) and DPO contact — still a placeholder from the Academy.

## Answered

**2026-11-26 — Phase 5 (accounting) questions**

1. JD Foods is **VAT-registered**.
2. Books are kept in **Excel / manually** today, so JD Foods OS becomes the book of record.
3. Go-live (opening-balance cut-off) **later, after a parallel test run**.
4. The **CEO approves all supplier payments**.

**2026-11-26 — Phase 4 (procurement) questions**

1. Build procurement inside JD Foods OS (no Odoo/ERPNext).
2. The CEO approves all purchase orders.
3. Local suppliers only (no imports, no landed cost for now).
4. Purchase requests first, then POs by the buyer.

**2026-11-26 — Phase 3 (sales and shop) questions**

1. **Payment:** both: manual (bank transfer / GCash / Maya with proof, finance confirms) now, PayMongo when its account is set up.
2. **Shopify:** the new shop runs alongside Shopify; order import and stock sync in Phase 3c.
3. **Shipping:** the customer pays the courier directly; no shipping fee on orders.
4. **Accounts:** guest checkout allowed; accounts optional.

**2026-11-26 — Phase 2 questions**

1. **Pickup point:** only a hand-over point for prepared orders waiting for the courier. → It's a location flag, not a stock location; stock leaves the warehouse when an order is dispatched.
2. **Production area is separate** from the finished-goods warehouse. → Two inventory locations: a production store (raw materials, packaging) and the finished-goods warehouse.
3. **Sold by piece.** → Each size is its own SKU (e.g. P1-1L) with base unit bottle / pack / pc; cases are optional conversions for buying and counting.
4. **Stock adjustments and write-offs:** up to ₱5,000 → operations manager; above → CEO. Confirmed.
5. **Product list:** the May 2026 SRP price list (PDF) → 393 SKUs in docs/data/products-srp-2026-05.csv (generated by scripts/build-catalog.mjs).

**2026-11-26 — follow-ups**

1. **Shopify plan:** Advanced.
2. **Petty cash:** the operations manager approves up to **₱50,000**; above that goes to the CEO.
3. **Supabase data:** all test data; it can be reset. → Phase 1a can reshape the Academy schema and roles freely; no data migration needed.
4. **Official sales invoices:** pre-printed **booklets**. → SI series register tracks booklets (series, number range, holder, status).
5. **Couriers:** booked **manually**, picked up from **two locations**; the **client pays shipping**. → No courier API in 3b; shipping fee is a pass-through charge on the order/invoice, not a company expense.
6. **Pricing:** distributors and resellers have **different** pricing arrangements; **some customers have special prices**. → Separate distributor and reseller price lists plus customer-specific price overrides.

**2026-11-26 — kickoff questions**

1. **Legal entities:** one company distributes all brands (JD Foods, ThyChef, Arkadia) under **one TIN**. No inter-company. → DECISIONS: single entity.
2. **BIR:** the system will **not** be BIR-registered. It must **monitor issuance of official sales invoices** from the current source. → DECISIONS: billing invoice + official invoice tracking.
3. **Batch/expiry and bins:** yes, tracked today. → Batch required on every stock movement from day one; bin-level stock.
4. **UoM / MOQ:** no minimum order quantity; customers can order a single pack. → MOQ stays optional (default 1); pack is the main selling unit, cases are a conversion.
5. **Credit:** about 20% of sales is on credit, and orders are held today for over-limit/overdue customers. → Credit check step kept in Phase 3b; opening AR import needed in Phase 3b.
6. **Shopify:** one store, **one location**, stock updated by hand, same SKUs as wholesale. Separate pricing for regular customers, corporate accounts, distributors and resellers. → Single-location inventory push; JD FOODS OS is the product master; Shopify keeps its own retail price.
7. **Sales team:** about 6 in the office and 6 in the field; GPS check-in wanted. → Mobile field-visit screens with GPS + photo; privacy notice must mention location capture.
8. **Delivery:** no own fleet; third-party couriers only, about 20 deliveries a day. → Phase 3b delivery = courier booking + tracking number + proof of delivery from the courier; no driver app. Phase 10 fleet features dropped.
9. **Approvers:** the CEO approves most transactions; the operations manager approves petty cash. → Approval seeds: petty cash → operations manager; everything else → CEO. Escalation ladder shortened.
10. **Supabase:** reuse the existing Supabase project.
