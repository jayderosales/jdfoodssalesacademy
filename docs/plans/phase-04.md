# Phase 4 — Procurement & suppliers

Status: **built** (2026-11-26). Not yet done: emailing the PO to the supplier from the system (print / PDF for now), Playwright E2E. Answers in section 9. Follows PROMPTS.md Phase 4. Builds on Phase 2 (stock ledger, receipts, QA quarantine, reorder suggestions) and Phase 1b (approvals, numbering, attachments, notifications).

## 1. Goal

Every peso spent on stock and supplies starts as an approved purchase order, arrives through a receipt matched to that PO, and is billed by a supplier invoice that is checked against both (3-way match), so AP in Phase 5 starts from clean, approved numbers.

## 2. Build or buy (the decision point in the phase plan)

**Recommendation: build it here.** The stock ledger, QA gate, weighted-average cost, approvals and audit already exist; Odoo/ERPNext would duplicate products, stock and approvals and need a sync. Revisit only if Phase 5 accounting turns out to need a full off-the-shelf GL.

## 3. Scope (build order)

1. **Suppliers**: supplier master (code, TIN, VAT status, terms, currency, contacts, bank details as a restricted field, documents such as BIR 2303 / FDA LTO as attachments with expiry), accreditation status (pending → approved → blocked), supplier 360 (POs, receipts, invoices, on-time %, quality %).
2. **Supplier price list**: per supplier + product: their item code, unit, price, MOQ, lead time; "last price paid" kept automatically.
3. **Purchase requests** (optional, see questions): anyone asks for items; buyer converts into POs. Reorder suggestions (Phase 2) turn into a request or PO in one click.
4. **Purchase orders**: lines in the supplier's unit, expected date, ship-to location, VAT, discounts, freight; approval by amount; send PDF/email to supplier; statuses draft → submitted → approved → sent → partly received → received → closed / cancelled. Change after approval = revision (re-approval).
5. **Receiving against PO**: the existing Receipt screen gains "Receive PO": lines prefilled with what's still open, lot/expiry, over-receipt tolerance (setting), short/over flagged. Posts through the ledger (quarantine → QA release, as today). Unit cost = PO price (landed cost adds to it later).
6. **Supplier invoices + 3-way match**: record the invoice (number, date, lines, VAT); system matches PO price × received qty × invoiced qty, flags differences beyond tolerance; mismatches need approval. Matched invoices become "ready to pay" for Phase 5 AP.
7. **Landed cost** (if importing): freight, duty, brokerage, insurance allocated to receipt lines by value/qty/weight → revalues the batch cost through the ledger.
8. **Supplier performance**: on-time delivery, fill rate, QA reject rate, price variance; shown on supplier page and a procurement overview.
9. **Procurement overview**: open POs, late deliveries, invoices waiting for match, spend by supplier/category this month. Every number drills down.

## 4. Data model (new)

suppliers, supplier_contacts, supplier_products (supplier prices), purchase_requests + lines, purchase_orders + lines (+ revisions), po_receipt link on stock_receipt_lines (po_line_id), supplier_invoices + lines, invoice_matches, landed_cost_vouchers + allocations. Numbering: SUP, PR, PO, SINV, LC.

## 5. Rules (enforced in the database)

- A PO can't be sent or received until approved; editing an approved PO creates a revision that needs approval again.
- No self-approval (existing engine). Approvals by amount (question 2).
- Receipts against a PO can't exceed the open quantity + tolerance; receiving updates PO status.
- A supplier invoice can't be marked ready to pay unless matched within tolerance or the variance is approved.
- Blocked or unaccredited suppliers can't get new POs.
- Supplier bank details are restricted (permission + read log).

## 6. Permissions (new)

procurement.view, procurement.suppliers.manage, procurement.request, procurement.po.create, procurement.po.send, procurement.invoices.manage, procurement.landed_cost, procurement.view_bank (restricted).

## 7. Screens

Procurement overview · Suppliers (+360) · Supplier prices · Requests · Purchase orders (+PO page with approval timeline, receipts, invoices) · Receive PO (phone-friendly) · Supplier invoices (match screen) · Landed cost.

## 8. Tests

Unit: PO totals with VAT/discounts, tolerance and 3-way match math, landed-cost allocation. DB: approval gates, self-approval blocked, over-receipt blocked, receipt updates PO status and stock/cost, invoice match states, blocked supplier, bank-detail access. E2E: PO → approve → receive → QA release → invoice match.

## 9. Answers (2026-11-26)

1. **Build here.** No Odoo/ERPNext.
2. **The CEO approves every purchase order** (any amount). The tiered template stays available in Settings → Approval policies.
3. **Local suppliers only.** Pesos only; landed cost and foreign currency are dropped from this phase (freight can be a PO line).
4. **Requests first.** Staff submit purchase requests; the buyer (operations manager) turns them into POs. Requests don't need approval; the PO does.
