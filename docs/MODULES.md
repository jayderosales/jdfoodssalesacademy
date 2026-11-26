# Modules

Status: **not started** / **in progress** / **done**. Phase numbers follow the adjusted plan in docs/plans/phase-plan.md (1a/1b, 3a/3b are splits of the original Phases 1 and 3).

| # | Module | Status | Phase | Notes |
|---|---|---|---|---|
| 1 | Core infrastructure | in progress | 1a, 1b | **Done (1a + 1b):** org model, RBAC + RLS, MFA switch, sign-in security, audit, app shell, CI, PWA, numbering, attachments, outbox, import framework, shared components. **Scan a document** (AI photo encoding into drafts, 2026-11-26). |
| 2 | Executive dashboard | not started | 6 | |
| 3 | Accounting | in progress | 5a | **Built (5a), parallel run:** chart of accounts, automatic postings from sales, payments, stock and purchases, manual journals (CEO approval), reversals, periods (close/lock), AR and AP aging, supplier payments with EWT (CEO approval), petty cash release, bank statement import and reconciliation, P&L, balance sheet, trial balance, VAT and 2307 reports, go-live (start books + opening balances). Document transmittals, petty cash liquidation with expense receipts. Waiting for accountant review. |
| 4 | Finance | not started | 5b | Budgets, cash forecast, debt, ratios, scenarios, credit, capex |
| 5 | HRIS | in progress | 1a, 9 | Basic employee profile + reporting line done (1a); full HRIS in Phase 9 |
| 6 | Payroll | not started | 9 | |
| 7 | Sales & CRM | built (Phase 3) | 3 | Customers, price lists, customer prices, leads, activities + GPS visits, orders, credit check, payments, fulfilment, invoices + SI register. Targets and commissions later |
| 8 | Client portal | not started | 7 | Incl. Business Growth Center |
| 9 | Inventory | built (Phase 2) | 2 | Products, costs/prices, ledger, batches/QA, receipts, transfers, adjustments, counts, reorder, scan |
| 10 | Procurement | built (Phase 4) | 4 | Suppliers, prices, requests, POs (CEO approval), receiving against PO, supplier invoices + 3-way match, performance. Local suppliers only; no landed cost yet |
| 11 | Manufacturing | not started | 8 | |
| 12 | Quality & FDA | not started | 8 | Simple QA release in 2/4 |
| 13 | Logistics | not started | 3b, 10 | Courier-only (no own fleet). Courier booking + POD in 3b; courier API connectors and delivery costing in 10 |
| 14 | Marketing | not started | 11a | |
| 15 | Creatives | not started | 11a | |
| 16 | Training / Academy | in progress | existing, 11b | Sales Academy Phases 1–3 done (paths, lessons, quizzes, AI roleplay, reviews); Phase 4 reports partly built. Customer/distributor/public courses, certificates, competency matrix in 11b. |
| 17 | Contracts | not started | 11c | Simple supplier contracts in 4 |
| 18 | Distributor portal | not started | 7 | |
| 19 | E-commerce | built (Phase 3) | 3 | Own shop + landing page with guest checkout, manual payment confirmation, PayMongo ready. Shopify sync and marketplace imports later |
| 20 | Document encoding (AI) | not started | 12 | |
| 21 | Project management | not started | 11d | Incl. OKRs, meetings |
| 22 | SOP management | not started | 11c | |
| 23 | Asset management | not started | 11d | Fixed-asset accounting in 5 |
| 24 | Customer service | not started | 10 | |
| 25 | Approvals | done | 1b | Engine, inbox, delegation, escalation; petty cash is the first document |
| 26 | Notifications | in progress | 1b | In-app engine, live bell, escalation done; email waits for Resend |
| 27 | Reporting | in progress | 1b, 6 | Academy reports page with CSV/PDF export exists; scheduled reports in 6 |
| 28 | AI intelligence | in progress | 12 | Academy uses Claude for roleplay and grading with usage/cost logging; assistant + forecasting in 12 |
