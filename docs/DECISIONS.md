# Decisions

Format: date — decision — why — alternatives considered.

### 2026-11-25 — Grow the Sales Academy repo into JD FOODS OS
- **Decision:** build JD FOODS OS in this repository; the Academy becomes the Training/Academy module.
- **Why:** owner's choice. Same stack (Next.js + Supabase + Vercel), already has auth, RLS, audit triggers, AI usage logging and DB tests, and isn't deployed yet, so we can still refactor roles and schema freely.
- **Alternatives:** a new empty repository with the Academy migrated in later (cleaner start, but duplicates auth/users and needs a data migration).

### 2026-11-25 — Custom build, not Odoo/ERPNext
- **Decision:** custom build per docs/PROMPTS.md assumptions.
- **Why:** stated assumption; keeps one codebase with the Academy.
- **Alternatives:** Odoo/ERPNext for procurement + accounting (Phases 4–5 would become integrations). Revisit before Phase 4 if accounting scope or BIR CAS registration looks too heavy.

### 2026-11-25 — Single-tenant; 2026-11-26 — single legal entity
- **Decision:** one deployment for JD Foods only. One legal entity (one TIN) owns all brands; brand is a product attribute, not an entity. We keep a single `entities` row and an `entity_id` column on key tables (cheap now, avoids a painful migration if a second company is ever added), but the UI hides the entity switcher while there is only one.
- **Why:** owner confirmed one company, one TIN, no inter-company sales.

### 2026-11-26 — Billing invoices + official sales invoice monitoring
- **Decision:** JD FOODS OS will not be BIR-registered. It issues **billing invoices** (internal numbering) and tracks the **official sales invoice (SI) number** issued from the current BIR-registered source against each billing invoice. Registered SI series/booklets are recorded (series, range, location/person holding it); the system flags orders delivered without an SI number after N days, duplicate SI numbers, numbers outside a registered range, gaps and voided SIs, and shows a booklet usage report.
- **Why:** owner wants to monitor official invoice issuance without registering the system (CAS).
- **Alternatives:** BIR CAS / e-invoicing registration (revisit if the volume makes manual SI issuance painful).

### 2026-11-26 — Courier-only delivery
- **Decision:** no own-fleet features. Couriers are booked manually from two pickup locations and the client pays shipping. Delivery = courier booking record (courier, pickup location, booking/tracking number, shipping fee charged to the customer as a pass-through line), status updates, and proof of delivery uploaded from the courier (screenshot/photo) or confirmed by the customer. No driver role or driver app in Phase 3b; Phase 10 drops vehicles, trip sheets, route optimisation and fleet maintenance.
- **Why:** third-party couriers only, about 20 deliveries a day.

### 2026-11-26 — Approval chains centred on the CEO
- **Decision:** seed policies: petty cash → operations manager up to ₱50,000, above that → CEO; all other approvals (purchases, discounts above threshold, credit holds, adjustments, expenses, payments) → CEO. The tiered limits (₱5k / ₱25k / ₱100k) stay in the engine as editable, inactive templates for when department heads are added. Escalation ladder: owner → +24h supervisor → +48h CEO risk feed.
- **Why:** the CEO approves most transactions today; adding layers nobody fills would just slow things down.

### 2026-11-25 — Keep PGlite DB tests
- **Decision:** keep the existing in-memory Postgres (PGlite) test harness for RLS and DB rules; add Playwright against a Supabase project for E2E.
- **Why:** fast, no Docker on the developer's Windows machine. pg_cron/Realtime/Storage are covered in E2E instead.

### 2026-11-26 — Price lists
- **Decision:** seed price lists: retail (also Shopify), wholesale/regular, corporate, distributor, reseller (separate from distributor), plus customer-specific price overrides that win over the customer's list. Quantity breaks optional; MOQ default 1.
- **Why:** owner confirmed distributors and resellers have different arrangements and some customers have special prices.

### 2026-11-26 — Keep profiles.role as a read-only Academy cache (deviation from the 1a plan)
- **Decision:** instead of dropping `profiles.role`, keep it as a cache of the user's Academy level (owner/manager/rep/null), maintained by triggers from their roles' permissions. Direct writes are blocked. RLS never uses it; it uses `has_permission()`.
- **Why:** ~170 places in the Academy code filter or label by it (e.g. "list reps"). Keeping the column avoided a risky rewrite of working screens while still making RBAC the single source of truth.
- **Alternative:** a view or RPC for "academy level" and rewriting those queries; can be done gradually.

### 2026-11-26 — Organization menu vs directory access
- **Decision:** every staff role gets `org.view` (needed later to pick locations/departments in forms), but the Organization menu item only shows for people who maintain it or audit it (`admin.org.manage`, `employees.manage`, `admin.users.view`, `readonly.all`).

### 2026-11-26 — Prettier for new code only
- **Decision:** Prettier config added; the existing Academy files were not mass-reformatted (would bury real changes in a 100-file diff). CI runs lint, typecheck, tests and build, not a format check. A one-off formatting commit can be done any time.

### 2026-11-26 — MFA enforcement in the database
- **Decision:** `has_permission()` requires an `aal2` session for internal users, so a stolen password alone reads nothing. External portal users don't need MFA. A settings switch (`require_mfa_internal`) exists for rollout; it's audited.

### 2026-11-26 — Two-step sign-in switched off (owner's choice)
- **Decision:** `app_settings.require_mfa_internal` set to false on the live project. The feature stays in the code and can be switched back on in Settings → Sign-in security. New environments still start with it on.
- **Why:** owner asked to remove it.
- **Risk accepted:** a stolen staff password alone gives access. Revisit before Phase 5 (accounting) and Phase 9 (payroll) go live, or at least require it for admins.

### 2026-11-26 — Phase 1b choices
- **Escalation counts working hours** (Mon–Sat 8:00–17:00 Manila, skipping holidays), editable in Settings. Owner accepted the recommendation.
- **Email deferred**: notifications are queued per preference but marked "skipped" until app_settings.email_enabled is turned on with a Resend account; the sender will be a Supabase Edge Function (the Vercel domain is behind deployment protection, which blocks calls from the database).
- **Notifications are delivered immediately** by a trigger on the event outbox (in a sub-transaction), with pg_cron retrying failures every minute; a broken handler never blocks the business change.
- **All document numbers are gapless** (row-locked counter inside the document's transaction). Fine at JD Foods' volume.
- **Delegates** must be active staff accounts; they don't need the delegator's role. Both names are recorded on every decision.
- **Petty cash** is approval-only for now; cash release and liquidation arrive with Phase 5 (finance).

### 2026-11-26 — Product catalog and locations (Phase 2)
- **One SKU per size**, sold by the piece. SKU = price-list code + size (P1-GAL, P1-1L, P1-500ML, P1-350ML). Items without a code in the price list get a generated code by series (AR-SYR-…, MK-…, EQ-…, MAT-…).
- **Brands**: JD Foods, ThyChef, McKeith, Arkadia, Catcher Gourmet (+ other). JD Foods/ThyChef = finished goods (produced); McKeith/Arkadia/Catcher = merchandise (resold) until confirmed.
- **Equipment and materials** are stocked merchandise; **marketing layouts/designs** are services (no stock).
- **Pre-order items** (ThyChef 25 kg boxes) are normal SKUs flagged pre-order with a lead time; they can be sold without stock on hand.
- **Locations**: Plaridel FG warehouse (sellable stock) and Plaridel production store (raw materials/packaging, not sellable). The courier pickup point is a flag on a location, not a stock location.
- **SRP** is stored on the product for now (retail reference price); full price lists come in Phase 3.

## 2026-11-26 — Phase 3: sales, shop and when stock is deducted
- **Decision:** One order pipeline for every channel (shop, phone, Messenger, field, walk-in). Stock is **reserved** (FEFO) when an order is placed and **deducted** (`sale_dispatch`) only when staff mark it *Ready for pickup*, which the database allows only if the order is paid or approved on credit. Unpaid shop orders auto-cancel after 48 hours (setting).
- **Why:** The owner asked that sales hit inventory once payment is confirmed and the goods are prepared. Reserving at placement stops the shop from selling stock already promised.
- **Also:** Customers pay the courier directly (no shipping line on orders). Guest checkout is allowed. Manual payment confirmation now, PayMongo behind a switch. The new shop runs alongside Shopify until Phase 3c sync.
- **Alternatives:** Deduct at payment (stock leaves the books before it's packed); deduct at delivery (stock looks available while it sits at the pickup point).

## 2026-11-26 — Phase 4: procurement built in-house, CEO approves POs
- **Decision:** Procurement is built inside JD Foods OS. Every PO needs CEO approval. Purchase requests (no approval) → PO (approval) → receipt against the PO through the stock ledger → supplier invoice with 3-way match. Pesos only; no landed cost yet.
- **Why:** Reuses the stock ledger, QA gate, costing and approval engine; avoids syncing products and stock with a second system. The owner confirmed CEO approval and local-only suppliers.
- **Alternatives:** Odoo/ERPNext (duplicate master data and stock); tiered PO limits (kept as an inactive template).

## 2026-11-26 — Phase 5: JD Foods OS becomes the book of record, parallel run first
- **Decision:** Build accounting (5a) as the official books: chart of accounts, automatic postings from every module, AR, AP with CEO-approved supplier payments, banks, petty cash, reports. JD Foods is VAT-registered (12%, setting needs verification). Run it in parallel with the Excel books and pick the opening-balance cut-off afterwards; test postings are wiped at go-live.
- **Why:** The books are in Excel today, so there's no other system to sync with. A parallel run lets the owner and accountant compare before relying on it.
- **Alternatives:** Export to outside accounting software (not used today); go live on a fixed date now (risky without a test run).

## 2026-11-26 — Phase 5a: how the posting engine and the books behave
- **Decision:** Postings happen in the same transaction as the business event (trigger on the event outbox). If a posting fails (e.g. a missing account), the business action still goes through and the event waits in an **unposted queue** with the reason, to be fixed and retried; a month can't be closed while anything up to it is unposted. Sales post at *Ready for pickup* (AR / sales by brand / output VAT), stock movements post at moving-average cost, supplier invoices post when matched or approved (GRNI + price variance + input VAT / AP), supplier payments when marked paid (AP / bank / EWT payable). Manual journals and supplier payments go to the CEO. Accounts the engine uses can be renamed but not repurposed or deactivated (DB guard), and no account can be deleted.
- **Why:** The ledger can never drift from the documents, and an accounting setup problem never stops a sale or a delivery.
- **Alternatives:** A nightly batch posting (books lag behind the documents); blocking the business action when posting fails (a missing account would stop sales).

## 2026-11-26 — Photo encoding: AI reads, a person saves
- **Decision:** One shared "Scan a document" flow for six paper documents (supplier delivery slip, goods sent between sites, documents sent to accounting, supplier bill, expense receipt, customer payment slip). Claude reads the photo into a structured draft (every field optional, "" when unreadable). The server matches names to master data, and a person reviews it next to the photo and creates the same draft record they'd make by hand, through the same database rules. The photo stays on the scan, and each record links back to it.
- **Why:** CLAUDE.md §5.12 (AI proposes, humans approve). Reusing the normal drafts means approvals, QA quarantine, 3-way match and payment confirmation all still apply.
- **Also:** Expense receipts either liquidate released petty cash (already posted at release, so no second entry) or become a draft manual journal for the CEO. Duplicate receipts (same store + OR no.) are blocked in the database. Document transmittals must be received by someone other than the sender.
- **Alternatives:** Auto-saving what the AI reads (no human check, against §5.12); a separate OCR service (another vendor; Claude already approved and reads handwriting/Taglish).
