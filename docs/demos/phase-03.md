# Phase 3 demo: sales, CRM and the online shop

You need stock to sell: receive and release a few products first (see docs/demos/phase-02.md, steps 2–3). Use two staff accounts for payments, because whoever records a payment can't confirm it.

## 1. Set up the shop
1. **Administration → Settings → Online shop**: replace the placeholder with your real bank / GCash / Maya details. Keep "Shop is open" ticked.
2. **Inventory → Products** → open a product → add a **Shop description** and a **Photo link** → Save.

## 2. Customer buys online (no account)
1. Sign out (or use a private window) and open the site's home page. You'll see the landing page.
2. **Shop now** → pick a product that is in stock → **Add to cart** → **Cart**.
3. Fill in name, mobile (09…), address and courier → **Place order**. You land on the order page with the order number (SO-…).
4. On the order page, choose GCash, enter a reference and the amount → **I've paid: send reference**. The page shows "being checked".
5. **Track order** (top menu) finds the order again with the order number + mobile.

Stock check: **Inventory → Stock on hand** still shows the same on-hand quantity (it's reserved, not deducted).

## 3. Finance confirms the payment
1. Sign in as finance (accounting officer). The bell shows "Payment to confirm".
2. **Sales → Payments** → **Confirm**. The order moves to **Paid / released** and the warehouse gets "Paid: SO-…".

## 4. Warehouse packs and releases (this is when stock is deducted)
1. **Sales → Fulfilment** → **Start packing**. Open the order to see the **pick list** (lot, bin, expiry, earliest expiry first).
2. **Ready for pickup** → confirm. **Inventory → Stock on hand** now shows the quantity deducted; the order shows billing invoice BI-….
3. On the order: **Handed to courier** (courier, tracking no., fee for information only) → later **Mark delivered**.
4. The customer's order page shows the courier and tracking number.

## 5. Staff order on credit
1. **Sales → Customers** → **Add customer** (type Corporate). As sales head or finance, set **Credit**: 30 days, limit ₱1,000.
2. **Sales → Orders** → **New order** → that customer, **On credit terms** → **Start order** → add products worth more than ₱1,000 → **Place order**. It goes to **Credit review**.
3. Sign in as the CEO → **Approvals** → approve. The order becomes **Paid / released** without payment, and the warehouse can release it. The customer page shows what they owe and the due date.

## 6. Price lists and special prices
1. **Sales → Price lists** → Distributors → type prices into the sheet → **Save**. Blank cells fall back to SRP.
2. Add a quantity break (e.g. from 12 pieces at a lower price).
3. On a customer page → **Special prices** → give one product a special price. New orders for that customer use it automatically.

## 7. CRM and field visits
1. **Sales → Leads** → **New lead** → it appears on the board. Open it, set a next step and date, change the stage.
2. On a phone: **Sales → Calls & visits** → type **Field visit** → **Check in here** (allow location) → Save. The visit list shows a 📍 map link.
3. On the lead → **Convert to customer**.

## 8. Official SI monitoring
1. **Sales → Invoices & SI** → **Register booklet** (e.g. series A, 1001–1050).
2. **Record SI** for a billing invoice (A 1001). Record A 1003 for another one. The alert list shows **Skipped number A1002**. Recording A 1001 again is blocked as a duplicate.

## 9. Things that should NOT work
- A sales rep giving a discount, or a price below the price list → blocked.
- Marking an unpaid prepaid order ready for pickup → blocked.
- The person who recorded a payment confirming it → blocked.
- A guest typing a distributor's mobile number in the shop → still pays SRP.
