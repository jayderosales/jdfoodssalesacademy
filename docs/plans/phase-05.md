# Phase 5 — Accounting, finance & treasury

Status: **5a built** (2026-11-26), running as test books until the accountant signs off and the cut-off is chosen. 5b (finance) not started. Answers in section 8. Follows PROMPTS.md Phase 5 and CLAUDE.md §7.8 (posting engine). Highest-risk phase: every tax rate, account and report format below is a **placeholder marked `needs_verification`** until the accountant signs off.

Split into two reviewable parts:
- **5a Accounting core** (book of record): chart of accounts, periods, journals, automatic posting from every module, AR, AP and supplier payments, banks and reconciliation, petty cash, financial statements, VAT and withholding reports.
- **5b Finance** (management): budgets vs actual, cash forecast, ratios, credit control dashboard. Built after 5a is signed off.

## 1. Goal

Every peso that moves (sale, collection, purchase, supplier payment, stock loss, petty cash) produces a balanced journal entry automatically, with a link back to the source document. So the trial balance, P&L and balance sheet are always up to date and every number drills down to the order, receipt or payment behind it.

## 2. Scope 5a (build order)

1. **Chart of accounts**: seeded Philippine template (assets, liabilities, equity, revenue, cost of sales, expenses), account types, normal balance, "postable vs header", dimension rules. The accountant edits it before go-live. Import template for their own chart.
2. **Fiscal periods**: monthly, Asia/Manila; open → closing → locked. Locked periods reject any posting (DB rule). Year-end close moves P&L to retained earnings.
3. **Journal entries**: manual journals (draft → approval → posted), recurring journals, reversals. Posted entries are immutable; corrections are reversals. Every entry must balance (DB constraint). Dimensions: location, department, channel, brand/product line.
4. **Posting engine** (§7.8): domain events → posting rules → journal entries, in the same transaction or via the outbox with retry; failures land in an **Unposted events** queue with the reason. Rules (each has a unit test):
   | Event | Debit | Credit |
   |---|---|---|
   | Sale released (ready for pickup) | Accounts receivable | Sales revenue (by channel/brand), Output VAT |
   | … same event, cost | Cost of goods sold | Inventory |
   | Customer payment confirmed | Cash / bank / e-wallet clearing | Accounts receivable |
   | Sales return | Sales returns, Output VAT | Accounts receivable; Inventory (returns) / COGS |
   | Receipt against PO | Inventory | Goods received not invoiced (GRNI) |
   | Receipt without PO / opening stock | Inventory | Opening balance equity / suspense (configurable) |
   | Supplier invoice matched/approved | GRNI (+ price variance), Input VAT | Accounts payable |
   | Supplier payment | Accounts payable | Bank (minus withholding tax payable) |
   | Stock adjustment / damage / disposal / sample / internal use | Inventory loss / samples / supplies expense | Inventory (or reverse for "found") |
   | Count variance, cost revaluation | Inventory gain/loss | Inventory |
   | Petty cash disbursement / replenishment | Expense accounts | Petty cash fund / bank |
5. **Accounts receivable**: open invoices per customer from billing invoices, payments applied (auto by order, manual for on-account), aging (current, 1–30, 31–60, 61–90, 90+), statement of account (PDF), credit hold list, opening AR import.
6. **Accounts payable and supplier payments**: ready-to-pay supplier invoices, payment runs (select invoices → approval → record bank transfer/check), expanded withholding tax (EWT) with BIR 2307 data, AP aging, opening AP import. Bills not from a PO (rent, utilities, services) with approval.
7. **Banks and cash**: bank and e-wallet accounts (BDO, GCash, Maya…), transfers between accounts, **bank reconciliation** from a CSV statement (auto-match by amount/date/reference, manual match, unmatched list), cash count.
8. **Petty cash**: fund per custodian; approved petty cash requests (Phase 1b) become disbursements with receipts; replenishment request.
9. **Reports**: trial balance, general ledger (drill to source), P&L (by month, location, channel, brand), balance sheet, cash flow (indirect), VAT relief / summary of sales and purchases, output vs input VAT, EWT summary, AR/AP aging. Excel export everywhere. Period close checklist (all events posted, bank reconciled, inventory valued, AR/AP tie to control accounts).

## 3. Scope 5b (later)

Budgets by account × month × dimension with approval; budget vs actual; 13-week cash forecast (AR due, AP due, payroll placeholder); key ratios (gross margin, DSO, DPO, inventory days, current ratio); credit control dashboard.

## 4. Rules enforced in the database

Balanced entries; posted entries immutable; locked periods reject posting; posting rules required for every event type that moves money or stock (missing rule = unposted queue, never silent); no self-approval on manual journals and supplier payments; account type checks (no posting to header accounts); AR/AP subledgers must equal control accounts (close check).

## 5. Permissions (new)

accounting.view, accounting.journals.create, accounting.journals.post, accounting.periods.manage, accounting.coa.manage, ap.payments.create, ap.payments.approve, ar.manage, bank.reconcile, finance.reports.view, tax.reports.view. Roles: CFO (all), accounting officer (most, not period lock/approve own), CEO (approvals, reports), auditor (read).

## 6. Tests

Unit: every posting rule (balanced, right accounts, VAT split), aging buckets, reconciliation matching, cash-flow mapping. DB: unbalanced entry rejected, posted entry can't change, locked period rejects, unposted queue on missing rule, subledger = control account after a full order-to-cash and procure-to-pay run, RLS per role. E2E: order → payment → TB balances; PO → receipt → invoice → payment → TB balances.

## 7. Risks

- **Tax treatment** (VAT registration, EWT rates, invoice requirements) must come from the accountant; wrong defaults would misstate taxes.
- **Opening balances**: go-live needs a trial balance, AR/AP lists and inventory valuation on the same cut-off date.
- **Two sets of books**: if the accountant keeps their own system, we need an export format instead of becoming the only book.

## 8. Answers (2026-11-26)

1. **VAT-registered.** Sales carry 12% output VAT; input VAT from VAT suppliers is claimable and excluded from stock cost. The rate stays a setting marked "needs verification" until the accountant confirms the details (zero-rated/exempt items, invoice wording).
2. **Books are in Excel / manual today.** JD Foods OS becomes the book of record; no sync with outside accounting software is needed. Opening balances come from the Excel books.
3. **Go-live: later, after testing.** Build 5a now, run it alongside the Excel books (parallel run), and choose the cut-off date afterwards (a month start, ideally January 1). Until then, postings are marked as **test** and can be wiped before go-live.
4. **The CEO approves every supplier payment** (same as POs).

### Consequences for the build
- Postings start immediately from today's transactions so the parallel run can be compared with Excel; a "go-live reset" wipes test journals and loads opening balances on the chosen date.
- A simple **opening balances import** (trial balance + AR list + AP list + inventory valuation as of the cut-off) is part of 5a.
- Accountant sign-off is still needed for the chart of accounts, VAT and EWT before the cut-off.
