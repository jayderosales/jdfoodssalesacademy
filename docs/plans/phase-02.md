# Phase 2 — Products, Inventory & Warehouse

Status: **built** (2026-11-26; migrations applied, catalog loaded). Not yet done: Playwright E2E for inventory. Detailed rules: docs/specs/inventory.md. Answers: pickup point = hand-over only (not stock); production store separate from FG warehouse; sold by piece (each size = SKU); adjustments ≤ ₱5,000 ops manager, above CEO; catalog from the May 2026 SRP list (393 SKUs).
Covers PROMPTS.md Phase 2. Builds on Phase 1 (approvals for adjustments and counts, numbering, attachments, import tool, DataTable, Scanner, notifications).

## 1. Goal

One trustworthy answer to "how much do we have, where, which batch, what's it worth, and what expires soon", for every product line. Every unit of stock moves only through an immutable ledger, so the numbers always add up and every change can be traced.

## 2. Scope (build order)

1. **Product master**
   - SKU, name, brand (ThyChef / Arkadia / JD Foods / other), category, item type (finished good, raw material, packaging, merchandise, service, bundle).
   - Base unit plus conversions (pack ↔ case ↔ kg ↔ g, per product). Barcodes (several per product, each tied to a unit, so scanning a case barcode means 12 packs).
   - Shelf life (days), storage condition (ambient / chilled / frozen), FDA CPR number and expiry, photos and spec files (attachments), sellable channels, active/archived.
   - **Bundles/kits** (e.g. Business Package) list their components. Selling a bundle issues the components; bundles themselves hold no stock.
   - The Academy's placeholder products are linked to the new master so training content keeps working.
2. **Warehouses and bins.** Locations that hold inventory get **zones → racks → bins** (optional; a warehouse can run with just "default bin").
3. **Batches/lots.**
   - Each batch has a lot no., manufacturing and expiry dates, supplier lot, and QA status (quarantine, released, on hold, rejected, expired).
   - A nightly job expires batches past their date and notifies the warehouse.
   - Only QA personnel (or admins) can change QA status in this phase; full QA comes in Phase 8.
4. **Stock ledger** (CLAUDE.md §7.7).
   - Append-only `stock_movements` with the movement types from PROMPTS.md.
   - `stock_balances` per product / location / bin / batch, updated in the same transaction by one posting function.
   - **Negative stock is blocked** in the database.
   - Corrections are new movements (reversals), never edits.
5. **Costing.** Moving weighted average per product (one company). Every movement stores its unit cost, and the value on hand is always quantity × average. FIFO is recorded as a possible later option.
6. **Reservations + FEFO.**
   - Reserving stock for an order picks released batches with the earliest expiry first.
   - Available-to-sell = released on-hand − reserved, and excludes quarantined, on-hold, rejected and expired stock (enforced in the database).
7. **Screens** (all on the shared DataTable):
   - Products list and record.
   - **Stock on hand** by product, location or batch, with value.
   - **Stock card** (ledger per product).
   - **Batches** with an expiry heat-map.
   - **Manual receipt** (purchase-order receipt comes in Phase 4).
   - **Two-step transfer** (dispatch → in transit → receive).
   - **Adjustment request** (approval required).
   - **Cycle count**: count sheets by zone or ABC class → count on phone → variances → approval → post.
   - **Damage / quarantine / disposal** with photos.
8. **Reorder management.** Min / max / safety stock / lead time per product per location, and a reorder suggestions list (Phase 4 turns these into purchase requests).
9. **Phone screens (scanner-first, PWA):**
   - Item lookup, receive, put-away, pick, count and transfer.
   - An **offline queue** that saves scans without signal and syncs later. Conflicts (e.g. stock already moved) are shown for review, never silently applied.
10. **Inventory health dashboard.**
   - Total value; slow-moving value (no outbound movement in N days, configurable).
   - % healthy / slow / near-expiry / critical; low-stock SKUs; expiring in 30/60/90 days.
   - Every tile opens the filtered list behind it.
11. **Notifications:**
   - Reorder level reached → procurement (operations manager for now).
   - Near expiry → warehouse + sales.
   - Batch expired → warehouse.
   - Adjustment or count waiting for approval → approver (via the approval engine).
12. **Import templates:** products, unit conversions, barcodes, and **opening stock by batch / location / bin with cost** (all-or-nothing, like 1b).

## 3. Approvals (reuse the 1b engine)
- **Stock adjustments and count variances** go through approval policies by value. Proposed default, editable: up to ₱5,000 → operations manager; above → CEO.
- **Disposal/write-off** always needs approval (same policy).

## 4. Out of scope
Purchase orders and receiving against POs (Phase 4), sales orders and picking for orders (Phase 3b; the FEFO reservation function is built here and used there), QA inspections (Phase 8), accounting entries for stock movements (Phase 5; movements emit events now), production issue/output screens (Phase 8; the movement types exist now).

## 5. Tests (acceptance from PROMPTS.md)
- Unit: UoM conversion (incl. rounding to 4 decimals), weighted-average cost after receipts/issues/returns, FEFO allocation, ABC classification, slow-moving rules, offline-queue merge.
- DB (PGlite):
  - The ledger can't be edited or deleted, and balances always equal the sum of movements.
  - Negative stock is blocked.
  - **Quarantined / rejected / expired batches can't be reserved, picked or transferred to sellable stock.**
  - A **count variance posts only after approval** and appears on the stock card and in the audit log.
  - The nightly expiry job works.
  - Only QA can release a batch.
  - RLS: warehouse personnel scoped to one location see and move only that location's stock.
- E2E: receive with batch → transfer (dispatch/receive) → adjustment needs approval → count with variance → approve → stock card shows every step.
- **Demo data**: realistic stock for every product line (placeholder SKUs, marked demo, purged at go-live).

## 6. Rough size
About 3–4 working sessions: products + UoM + batches → ledger + costing + FEFO (most tests) → receipt/transfer/adjustment/count screens → phone screens + offline queue → dashboard, reorder, notifications → imports + demo data + E2E.

## 7. Questions before coding
- **Q1. The two courier pickup locations.** Do both hold stock (each gets its own inventory and transfers between them), or is one only a hand-over point? Their names? (Also open since Phase 0.)
- **Q2. Plant vs warehouse.** Is the plant's raw-material store separate from the finished-goods warehouse (two inventory locations), or one building and one stock pool?
- **Q3. Units.** What's a typical product's packing (e.g. 1 case = 12 packs of 1 kg)? Are any products sold by weight (kg) rather than by piece?
- **Q4. Adjustment approval.** OK with up to ₱5,000 → operations manager, above → CEO for stock adjustments and write-offs?
- **Q5. Your current stock list.** Is it in Excel? If you can share the product list (even rough), I'll build the import template around your actual columns. Otherwise I'll use placeholder demo products.
