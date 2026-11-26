# Changelog

## 2026-11-26 — Speed, whole-app simulation, Scan a document moved
- **Server moved to Singapore** (Vercel region sin1, next to the database). It ran in Washington, USA, so every database call crossed the Pacific twice (~200 ms each, several per page).
- **Reports 80–130× faster at volume.** Row-level security checked permissions once per row; now broad checks run once per query (same access rules, all role tests pass). With a year of data: CEO snapshot 18.9 s → 0.17 s, trial balance 7.7 s → 0.06 s, sales breakdowns 3.3 s → 0.04 s.
- **Faster page shell**: the top-bar approvals count and other layout data load in one parallel round trip; the "last active" update runs after the page is sent.
- **Whole-app simulation** (supabase/tests/simulation.test.ts): one business day through every module (buy, receive, QA, bill, pay supplier, sell, pay, pack, release, deliver, petty cash, production, transmittal, CEO reports) with the books checked, plus a year of volume with every report timed (fails if any report takes over 1 s).
- **Scan a document** moved from the main sidebar to a tab in Inventory and in Accounting (each showing only its own document types). The barcode scanner tab is now "Scan barcode".
- 325 tests. Migration 20261210000001 applied to Supabase.

## 2026-11-26 — Phase 6: CEO reports (Command Center)
- New **CEO reports** section (CEO only). **Overview**: sales today, month to date and year to date (vs last month), gross profit and margin, sales vs target with the month's pace, a 30-day daily sales chart, cash and bank, customers overdue, supplier bills due in 7 days, payments to confirm, inventory value, out of stock / below minimum, near-expiry, today's production, orders waiting for stock, approvals waiting for you, escalated items, unposted accounting events. Every number links to its details.
- **Sales**: daily, month to date, year to date, any date range, by channel, brand, rep, top customers and top products, vs monthly and year-to-date targets.
- **Production**: the daily manufacturing production report (by day, with lots and the supervisor's report) and a 7-day grid by product.
- **Incomplete orders**: the daily incomplete-fulfilment report (paid orders waiting for stock, missing items, days waiting) and the products still to make or buy.
- **Receivables** and **Payables** reports: aging summary, by customer / supplier, bills due within 7 days, payments waiting for approval or release. Uses the same figures as Accounting.
- **Training**: each rep's skill score, level, at-risk flag, quizzes passed, roleplays in the last 30 days, last training, next to sales this month vs their target.
- **Targets**: monthly company targets for the year and per-rep targets. Reps can see their own target.
- **Morning summary** at 7:00 Manila: yesterday's sales, month and year to date vs target, collections, overdue customers, bills due, approvals, production and stock alerts. Shows in the notification bell now and arrives by email once email (Resend) is switched on.
- 323 tests (3 new CEO-report DB tests). Migration 20261209000001 applied to Supabase.

## 2026-11-26 — Fulfilment: incomplete orders; Accounting: disbursements
- **Fulfilment → Incomplete — waiting for stock** (new first column): paid or credit-approved orders that still miss items (usually pre-orders, or stock that ran out) move out of To pack / Packing. Each card shows "SKU short N (available now: M)". The normal button appears as soon as available stock covers the shortage, and stock is reserved automatically at Ready for pickup.
- **Products short** card under the board: what all incomplete orders still need per product, what's available, and what's still to make or buy.
- **Accounting → Disbursements** (new tab): all money out for a period (default this month) in one list: paid supplier payments, petty cash released, and company-paid expenses. Shows totals by type and by account paid from, status (expense journals waiting for the CEO are flagged), and links to the payment, request or journal (plus the receipt photo).
- Record a company-paid expense from Disbursements: **Scan a receipt** (the AI reads it), or **Record an expense** by typing it. Both create a draft journal (expense + input VAT / cash) for the CEO.
- 320 tests (3 new shortage unit tests). No database change.

## 2026-11-26 — Manufacturing: daily production report
- New **Manufacturing** tab (sidebar) for the production supervisor: start the day's report (date, plant, shift/line), add what was made (finished good, quantity and unit, lot no., mfg date, expiry), then **Submit**, which locks it. No approval step.
- Expiry defaults to mfg date + the product's shelf life. Only finished goods can be reported, and the same product + lot can't be reported twice. Photos can be attached.
- The overview shows output by product for today and any date range (default: last 7 days), plus your reports not yet submitted.
- Record only for now (owner's choice): inventory isn't changed. Finished goods still go into stock through Inventory → Receipts.
- Who sees it: Manufacturing personnel, Operations manager and COO can report; QA can view. The CEO and auditors see everything.
- 317 tests (3 new production DB tests). Migration 20261208000001 applied to Supabase.

## 2026-11-26 — Scan a document (photo encoding)
- **Take a photo, check, save.** New **Scan a document** page (sidebar, and buttons on Receipts, Transfers, Supplier invoices, Payments and petty cash). The AI reads the photo or PDF into a form next to the picture. Every field can be corrected, names are matched to products, suppliers, customers and locations, and nothing is saved until a person confirms. A scan never posts, approves or moves stock by itself.
- **Inventory:** a *supplier delivery slip* becomes a receipt against its PO (quantities, lots and expiry prefilled; lots go to QA quarantine) or a draft stock receipt when there's no PO. *Goods sent between sites* becomes a draft transfer that picks released stock earliest-expiry first (or the lot on the slip).
- **Accounting:** a *supplier bill* becomes a draft supplier invoice (with its PO, or as an expense bill that goes to the CEO). An *expense receipt* liquidates a released petty cash request, or becomes a draft journal (expense + input VAT / cash) when paid from a company account. A *customer payment slip* becomes a pending payment for finance to confirm.
- **Document transmittals** (new): list the invoices, ORs, cheques and other papers sent to accounting (scan or type). Accounting ticks each one off when it arrives. The sender can't receive their own transmittal.
- **Petty cash liquidation:** released requests show their receipts against the amount and what's left to liquidate or return. The same official receipt (store + OR no.) can't be claimed twice.
- Records made from a scan show the **scanned original**. Everyone signed in can now see the names of expense accounts (for liquidations), but no balances.
- Reading photos needs `ANTHROPIC_API_KEY` in Vercel. Without it, the scan is saved and the form opens empty to type in.
- 313 unit/DB tests (5 new scan/transmittal/expense DB tests, 4 matching unit tests). Migration 20261207000001 applied to Supabase.

## 2026-11-26 — Phase 5a: accounting core
- **The books post themselves.** Sales post at *Ready for pickup* (receivables, sales by brand and channel, output VAT). Confirmed customer payments, stock movements (cost of goods sold, losses, samples, gains) and cost revaluations post too. So do matched supplier invoices (goods received not invoiced, price variance, input VAT, payables), paid supplier payments and released petty cash. Returns and voids reverse the original entry.
- **Parallel run:** every entry is marked *test* until the finance head starts the official books (Periods & setup). Starting deletes the test entries and opening balances are pasted from the Excel trial balance.
- **Chart of accounts:** a starting Philippine chart (57 accounts, accountant to review), payment method → bank account mapping. Accounts used by automatic postings can't be repurposed, and no account can be deleted.
- **Journals and ledger:** manual entries go to the CEO and post on approval, posted entries are locked (reversal only), and journals must balance (DB). The ledger has running balances and every line links to its journal and source document.
- **Periods:** close, reopen, lock. Nothing posts into a closed or locked month. A month can't close while events are unposted or manual journals are pending. **Unposted queue** with the reason and Retry.
- **Receivables and payables aging** (not yet due, 1–30, 31–60, 61–90, 90+), drill to each order or invoice.
- **Supplier payments:** pick a supplier and every ready invoice is added. Withholding tax is calculated at the supplier's rate on the net-of-VAT amount. The CEO approves, then finance marks it paid with the bank reference and attaches proof. Can't pay more than is open.
- **Banks:** balances, statement import (paste CSV), auto-match (same amount within 3 days), manual match/unmatch, lists of what's unmatched on each side. **Petty cash release** posts the expense.
- **Reports:** profit and loss, balance sheet, trial balance (all with "official only" switch), monthly VAT (output − input), withholding tax for BIR 2307. Every number links to the ledger.
- 304 unit/DB tests (16 accounting DB tests, aging unit tests). Migrations 20261206000001–02 applied to Supabase.

## 2026-11-26 — Phase 4: procurement
- **Suppliers**: accreditation (pending → approved → blocked with a reason), contacts, documents (BIR 2303, FDA LTO, quotes), payment terms, VAT status, and **bank details visible to finance only** (every view logged). Supplier price list per item and unit, with MOQ, lead time and last price paid.
- **Purchase requests**: any staff member asks for items; the buyer orders them or declines with a reason. Inventory → Reorder has a "Create purchase request" button for everything below its minimum.
- **Purchase orders**: from requests or from scratch, VAT-inclusive or exclusive pricing, discounts, totals split into net and VAT. **Every PO goes to the CEO.** Approved POs are locked (Revise = back to draft and a new approval). Print / Save as PDF for the supplier, then mark it sent. Cancel or close with a reason.
- **Receiving against a PO**: the PO page has a Receive section (qty, lot, expiry). Lots go to QA quarantine as before, cost is the PO price without VAT, over-receipt beyond 5% is blocked (setting), and the PO moves to partly received or received.
- **Supplier invoices with 3-way match**: prefilled with what was received and not yet billed. Matching checks price (1% tolerance, setting) and quantity received; duplicate supplier invoice numbers are blocked. A match means "ready to pay"; variances (including charges not on the PO) go to the CEO.
- **Procurement overview**: requests to order, POs waiting for the CEO, late deliveries, variances, spend this month by supplier, and supplier performance (on time, fill rate, QA rejects).
- VAT rate (12%) is a setting marked "needs verification" until the accountant confirms it.
- 285 unit/DB tests (9 new procurement DB tests). Migration 20261205000001 applied to Supabase.

## 2026-11-26 — Phase 3: sales, CRM and online shop
- **Public landing page** at `/` and **online shop** at `/shop`: catalog by brand and category with search, product pages, cart, one-page checkout with no account needed, order page with payment instructions and reference entry, and order tracking by order number + mobile. Guests pay SRP; signed-in customers see their price list.
- **Customers** with price lists (Retail = SRP, Regular, Corporate, Distributor, Reseller), customer-specific prices, contacts, addresses, credit terms and limit, on-hold flag, opening balance, and a 360 page (owes, overdue, orders, payments, activity).
- **CRM**: leads pipeline board (new → won/lost, lost needs a reason), convert lead to customer, calls/messages/tasks, and **field visits with GPS check-in**.
- **Sales orders** from every channel in one pipeline. Stock is **reserved (FEFO) when placed** and **deducted only at "Ready for pickup"**, which the database allows only when the order is paid or credit-approved. Discounts need permission. Credit orders over the limit, overdue or on hold go to the CEO.
- **Payments**: bank transfer, GCash, Maya, cash or cheque. Customers can send their reference from the order page. Finance confirms, and whoever recorded a payment can't confirm it. PayMongo checkout and webhook are built and switched off until the keys are set.
- **Fulfilment board** (to pack → packing → waiting for courier → with courier), pick list by lot and bin, courier and tracking number (the customer pays the courier), delivered, and returns into a non-sellable RETURNS bin.
- **Billing invoices** issued at release, plus an **official SI register** (booklets) with duplicate blocking and alerts for skipped numbers, numbers outside any booklet, and invoices without an SI.
- Unpaid shop orders auto-cancel after 48 hours (setting) and free their stock. **Settings → Online shop** holds the payment instructions. Products get a shop description and photo link.
- 271 unit/DB tests (20 new sales DB tests, 13 new unit tests). Migrations 20261204000001–02 applied to Supabase.

## 2026-11-26 — Phase 2: products, inventory & warehouse
- **Product master**: 393 SKUs loaded from the May 2026 SRP list (5 brands, 34 categories, 18 pre-order). Units and conversions, barcodes, bundles, shelf life, FDA CPR fields. The Academy's training "products" table is now `academy_products`.
- **Product cost and price editing**: cost card on each product page and a bulk **Costs & prices** sheet (SRP + cost, margin, changed cells highlighted). Changing cost while stock is on hand is a revaluation: reason required, logged with the value difference.
- **Stock ledger**: append-only movements, balances by location/bin/batch, moving weighted-average cost, no negative stock, QA gate (only released batches can leave), FEFO reservations.
- **Documents**: receipts, two-step transfers (in transit, short receipts alert the ops manager), adjustments and cycle counts through approvals (≤ ₱5,000 operations manager, above CEO), blind counts with offline save on the phone.
- **Batches & expiry**: QA release/hold/reject, near-expiry alerts and automatic expiry each night (pg_cron), heat-map.
- **Reorder** levels and suggestions, **Scan** page (camera or SKU), inventory health overview (value, near-expiry, slow-moving, quarantine).
- Import templates for products and opening stock.
- 239 unit/DB tests. Migrations 20261203000001…06 applied to Supabase (06 tightens function grants flagged by the security advisor).

## 2026-11-26 — Phase 1b: shared engines
- **Document numbering** (gapless, per year), **attachments** on any record (private, 5-minute links, phone camera), **event outbox** with automatic retry and a Background jobs screen.
- **Notifications**: rules + personal preferences, live bell (Realtime), Notifications page, mark read. Email built but switched off until Resend is set up.
- **Escalation** in working hours (Mon–Sat 8:00–17:00 Manila, PH holidays): 24h → supervisor, 48h → CEO + executive risk feed on the dashboard. pg_cron runs it every 15 minutes.
- **Approval engine**: amount-based policies, inbox (desktop + phone) with count in the top bar, approve / reject / return with comment, no self-approval, delegation, cancel, full audit.
- **Petty cash requests** (reference document): up to ₱50,000 → Operations manager, above → CEO; receipts as attachments.
- **Shared components**: DataTable (search, filters, date range, sort, column chooser, saved views, Excel export, phone cards), RecordPage, KpiCard, StatusBadge, MoneyInput, QtyWithUoM, DateRangePicker, Scanner.
- **Import tool**: upload Excel/CSV → match columns → row-level errors → import all-or-nothing; templates for employees and locations.
- **Settings**: approval policies, working hours & holidays, notifications & escalation, document numbering, background jobs.
- 211 unit/DB tests. Migrations 20261202000001…04 applied to Supabase.

## 2026-11-26 — Public address
- Vercel project now answers on **app.jdfoods.ph** (jdfoods.vercel.app was taken by another account). `NEXT_PUBLIC_SITE_URL` updated for production. Waiting on the DNS record and Supabase redirect URLs (docs/SETUP_ACCOUNTS.md).

## 2026-11-26 — Phase 1a: Foundation (platform)
- **Organization:** entities (one: JD Foods), locations (type, holds inventory, pickup point), departments (head), positions, employees (supervisor line, loop-proof). Academy branches became locations. Screens under Administration → Organization.
- **RBAC:** permission catalog, 21 built-in roles (20 from PROMPTS.md + Operations manager), custom roles, role grants scoped to a location/department with optional end date. `has_permission*` SQL helpers; a role manager can only grant roles whose permissions they hold, never to themselves; at least one Super administrator always remains. Academy owner/manager/rep moved onto RBAC (owner → Super administrator + CEO, manager → Sales head, rep → Sales representative); `profiles.role` is now a read-only cache of the Academy level.
- **MFA enforced in the database** for staff (aal2 required for any data except one's own profile); TOTP enrol/verify page; admin "reset two-step sign-in". Switch in Settings for rollout.
- **Sign-in security:** login history incl. failed attempts, remembered devices + new-device email, idle sign-out (browser timer + server check), configurable timeouts.
- **External self-registration** (customer/distributor/supplier) → pending → admin approval → portal role; portal placeholder page.
- **Audit v2:** field-level diffs, restricted flag, append-only audit log, every table audited or explicitly exempt (DB test), restricted-read log, History panel on user/employee/role pages, audit search with filters.
- **App shell:** permission-driven sidebar with sections, top bar (Ctrl+K search, notifications, user menu), Settings (company profile, sign-in security, branding, training settings, privacy), "coming soon" module pages for admins.
- **Tooling:** ESLint, Prettier config, Playwright (smoke + Phase 1a flow), GitHub Actions CI, PWA manifest + service worker + offline page.
- **Tests:** 176 unit/DB tests (37 RBAC matrix/rules, 11 audit/registration/sign-in, existing 33 Academy RLS tests kept passing) + 3 Playwright smoke tests.
- Migrations `20261201000001…05` applied to the Supabase project (via the Supabase connector); starter Kamuning office and 9 departments added.

## 2026-11-26 — Follow-up answers recorded
- Shopify Advanced, petty cash ₱50k (ops manager), Supabase data resettable, SI booklets, manual courier booking from 2 pickup locations with client-paid shipping, separate distributor/reseller lists + customer-specific prices. Docs updated; 2 questions still open.

## 2026-11-26 — Kickoff answers recorded
- Recorded the 10 kickoff answers in OPEN_QUESTIONS.md and their design effects in DECISIONS.md (single entity, SI monitoring, courier-only delivery, CEO-centred approvals).
- Updated CLAUDE.md (business facts, approval seeds, escalation ladder), the phase plan (1a, 3b, 10) and COMPANY_FACTS.md. Added 6 follow-up questions.
- Checked the uncommitted Academy work: typecheck passes, 111/111 tests pass.

## 2026-11-25 — JD FOODS OS kickoff (Prompt 0)
- Decided to grow the Sales Academy repo into JD FOODS OS (see DECISIONS.md).
- Added draft CLAUDE.md, docs skeleton (MODULES, OPEN_QUESTIONS, DECISIONS, CHANGELOG, COMPANY_FACTS), adjusted phase plan (docs/plans/phase-plan.md), accounts list (docs/SETUP_ACCOUNTS.md) and extended .env.example.
- No application code changed.

## Before 2026-11-25 — JD Foods Sales Academy
- Phases 1–3 (auth, roles, teams, schema + RLS, content, learning paths, quizzes, AI roleplay, manager review), Reports page, team sign-up links. See git history and README.md.
