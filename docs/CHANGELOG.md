# Changelog

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
