# Phase 5a demo: accounting core

Use the accounting officer (day-to-day), the CFO / finance head (periods, chart of accounts) and the CEO (approvals). Everything posts as **test** entries until the books are started, so it's safe to try.

## 1. Look around
1. **Accounting → Overview**: cash and bank, receivables, payables, this month's sales, gross profit, net income, VAT. The amber banner says the books are in the parallel run.
2. **Chart of accounts**: the starting chart (accounts marked "to review" need the accountant). Under **Where customer payments go**, check that GCash posts to 1040 GCash, bank transfers to 1030, and so on.
3. Try to deactivate 5010 Cost of goods sold: it's refused because automatic postings use it.

## 2. A sale posts itself
1. In **Sales**, place an order, record and confirm the payment, then mark it **Ready for pickup** (Phase 3 flow).
2. **Accounting → Journals**: three new entries appear. *Customer payment* (bank / receivables), *Sale* (receivables / sales by brand / output VAT) and *Sale dispatch* (cost of goods sold / inventory).
3. Open the *Sale* entry → **Open the source document** goes back to the order. Click an account code to see its ledger with running balance.

## 3. A supplier invoice and payment
1. In **Procurement**, receive a PO and match its supplier invoice (Phase 4 flow). Journals shows *Supplier invoice* (GRNI, input VAT / payables).
2. On the supplier record, set a withholding tax rate (e.g. 1%).
3. **Accounting → Payables**: the invoice is in the aging. Under **Pay a supplier**, choose the supplier, pay from 1030, then **Prepare payment**. The invoice is added in full, and tax withheld and amount to pay out are worked out. Lower the amount to pay part of it.
4. **Send to CEO for approval** → as the CEO, approve in **Approvals**.
5. Back as accounting: **Mark as paid** with the bank reference, then attach the transfer slip. The entry *Supplier payment* posts (payables / bank / EWT payable). **Reports → Withholding tax (2307)** lists it.

## 4. Petty cash
1. Approve a petty cash request (Phase 1b flow).
2. **Accounting → Banks → Petty cash to release**: choose the expense account → **Release**. It posts expense / petty cash fund.

## 5. Bank reconciliation
1. **Banks** → open 1030 Cash in bank.
2. Paste two statement lines, one matching the supplier payment (negative amount, same date) and one bank charge, e.g. `2026-12-02, Bank charge, BC1, -25.00` → **Import and match**. The payment matches automatically. The bank charge stays unmatched ("No book entry with this amount").
3. **Journals → New manual journal entry**: debit 6080 Bank and payment fees ₱25, credit 1030 → **Send to CEO** → CEO approves → it posts. Back on the bank page, the charge now has a **Match** option.

## 6. Manual journal rules
1. Create a journal with only a debit line: **Send to CEO** is refused until debits equal credits.
2. Open a posted entry → **Reverse this entry** with a reason. An opposite entry is created and both stay in the ledger.

## 7. Reports and period close
1. **Reports**: Profit and loss (gross profit %), Balance sheet (assets = liabilities + equity), Trial balance (totals equal), VAT by month. Click any number to see the ledger.
2. As the finance head: **Periods & setup → Close** the month. Try posting into it (e.g. a manual journal dated in that month) and see it refused. **Reopen** to fix, **Lock** when final.
3. If a posting ever fails, it shows under **Events that didn't post** with the reason. Fix it and click **Retry**.

## 8. Go-live (only when the accountant is happy)
1. **Periods & setup → Start the official books**: pick the first day of a month, type START. Test entries are deleted and the banner turns green.
2. **Opening balances**: paste the Excel trial balance as of the day before (code, debit, credit) → **Post opening balances**. Set customer and supplier opening balances on their records for the aging.

## Known gaps (5a)
- The chart of accounts, VAT treatment and withholding rates are placeholders until the accountant reviews them.
- Supplier opening balances appear in AP aging but can't be settled through a supplier payment yet. Use a non-PO supplier invoice or a manual journal.
- No customer statement print yet (the aging drills to each order). No year-end closing entry (profit shows as "not yet closed to retained earnings").
- Shipping fees, landed cost, depreciation and payroll postings come with later phases. Budgets, cash forecast and ratios are Phase 5b.
- Verified by tests and build, and the migrations are applied live. The screens haven't been clicked through on the live site yet, because they ship with the next deploy.

## Add-on: Scan a document (photo encoding)
Needs `ANTHROPIC_API_KEY` in Vercel for the reading step. Without it, the form opens empty to type in.
1. **Supplier delivery slip:** as the warehouse/ops user, **Inventory → Receipts → Scan a delivery slip**. Photograph a DR that came with a PO delivery. On the review page the PO is picked from the number on the slip and quantities, lots and expiry are filled in. Correct anything, then **Receive against this PO**. The receipt opens, and the lots are in QA quarantine.
2. **Goods sent between sites:** **Inventory → Transfers → Scan a transmittal slip**. Check from/to and quantities (in base units), then **Create transfer (draft)** and dispatch it as usual.
3. **Supplier bill:** as accounting, **Procurement → Supplier invoices → Scan a supplier bill**. Choose the PO if it has one (lines come from what was received), or enter the lines for an expense bill (rent, utilities). Then **Match** on the invoice page. The photo shows as *Scanned original*.
4. **Expense receipt:** as an employee with released petty cash, open the request → **Scan a receipt**. Check the store, OR no., amount and what it's for, then save. The request shows receipts against the amount. Scanning the same OR again is refused. As accounting, choose a company cash/bank account instead: a draft journal (expense + input VAT / cash) opens to send to the CEO.
5. **Customer payment slip:** **Sales → Payments → Scan a payment slip**. The customer and order are found from the order number or payer name. Save it as pending, then another finance user confirms it.
6. **Documents sent to accounting:** any staff member, **Transmittals → Scan a transmittal** (or type one). As a different accounting user, open it, tick the documents that arrived, then **Mark received**. Missing ones stay "Partly received".
