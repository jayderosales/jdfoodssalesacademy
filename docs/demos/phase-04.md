# Phase 4 demo: procurement

Use three accounts: the operations manager (buyer), the CEO (approver) and an accounting officer (supplier invoices). Any staff member can make a purchase request.

## 1. Add and approve a supplier
1. **Procurement → Suppliers → New supplier**: name, category, TIN, VAT-registered, 30-day terms → **Add supplier**. It starts as **Pending**.
2. On the supplier page → **Details → Status: Approved** → Save.
3. **Supplier prices**: add an item (e.g. a raw material) with unit, price, MOQ and lead time.
4. As the accounting officer, open the same supplier: **Bank details** appear only for finance. The operations manager can't see them.

## 2. Ask for items (any staff)
1. **Procurement → Requests → Start request** → add items and quantities → **Submit request**. The buyer gets a notification.
2. Shortcut: **Inventory → Reorder → Create purchase request** turns everything below its minimum into one request.

## 3. Buyer creates the PO
1. As the operations manager: **Procurement → Requests → Requests to order** → open the request → tick items, choose the (approved) supplier → **Create purchase order**. Prices come from the supplier price list.
2. On the PO, check prices and the expected date → **Submit for CEO approval**.

## 4. CEO approves
1. As the CEO: **Approvals** → open the PO → **Approve**. (Try editing the PO afterwards: it's locked. **Revise** sends it back to draft for a new approval.)
2. Back as the buyer: **Print / PDF** → save and send it to the supplier → **Mark as sent to supplier**.

## 5. Receive the delivery
1. As warehouse or the buyer: open the PO → **Receive items**: enter the quantity, lot and expiry, the supplier's DR number → **Post receipt**.
2. Try receiving much more than ordered: it's blocked (over 5%).
3. **Inventory → Batches**: the new lot is in **Quarantine** until QA releases it. The PO shows **Partly received** or **Received**.

## 6. Supplier invoice and 3-way match
1. As the accounting officer: on the PO → **Record supplier invoice** (their invoice number and date). Lines are prefilled with what was received.
2. **Match to PO and receipts** → **Matched: ready to pay**.
3. Try a second invoice with the same number → blocked as a duplicate.
4. Record another invoice with a higher price → **Doesn't match** with the reason shown → **Send variance to CEO** → the CEO approves → **Variance approved: ready to pay**.

## 7. Overview
**Procurement → Overview**: requests to order, POs waiting for the CEO, late deliveries, variances, spend this month by supplier, and supplier performance (on time, fill rate, QA rejects).
