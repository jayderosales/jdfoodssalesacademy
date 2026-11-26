# Phase 2 demo: products, inventory & warehouse

Sign in as a Super administrator (or give yourself the Operations manager, Warehouse and QA roles in Administration → Users).

## 1. Products, costs and prices
1. Sidebar **Inventory → Products**. 393 products from the May 2026 SRP list. Filter by brand (e.g. ThyChef) and category.
2. Open **P1-1L** (Premium Sweet Barbecue 1 liter). Check SRP ₱256.
3. In the **Cost** card, type `120` and press **Save cost**. The margin appears. (No stock yet, so no reason is asked.)
4. Tab **Costs & prices**: change a few SRP and cost cells, see the changed cells highlighted and the margin column update. Press **Save N changes**.

## 2. Receive stock
1. **Inventory → Receipts**. Location: Plaridel FG warehouse. Supplier: "Production". Press **Start receipt**.
2. Add a line: P1-1L, 48 bottles, unit cost 120, lot `L2611-01`, expiry six months out. **Post receipt**.
3. **Batches**: the lot is in **Quarantine**. As QA, press **Release**.
4. **Stock on hand**: 48 bottles, value ₱5,760. Open the **stock card** to see the movement.

## 3. Revalue (cost change with stock on hand)
1. Back on P1-1L, set cost to `125`. The page now asks for a reason (revaluation). Enter "Supplier price increase" and press **Revalue**.
2. The cost history shows +₱240 value change (48 × ₱5).

## 4. Transfer
1. Create a second stock location if needed (Administration → Organization → Locations, "Holds inventory").
2. **Transfers**: **Start transfer** from Plaridel FG warehouse, add P1-1L lot L2611-01, 12, then **Dispatch**. It shows **in transit**.
3. Open it at the destination and press **Confirm received** with 11 received. The operations manager gets a "transfer arrived short" notification.

## 5. Adjustment with approval
1. **Adjustments → New**: reason Damage, add P1-1L −2, press **Send for approval**. Value under ₱5,000, so it goes to the Operations manager.
2. Sign in as the operations manager → **Approvals** → approve. The adjustment posts and stock drops by 2.

## 6. Cycle count (phone)
1. **Counts → Create count sheet** for Plaridel FG warehouse (blind).
2. On a phone, open the count, enter a quantity that differs by 1. Turn off Wi-Fi: the banner says counts are saved on the phone. Turn it back on and **Save counts**, then **Submit count**. The variance goes for approval and posts when approved.

## 7. Reorder, scan, health
1. **Reorder**: set P1-1L minimum 40 / maximum 100. It appears under "To reorder" with a suggested quantity.
2. **Scan**: type `P1-1L` (or scan a barcode added on the product page) to see stock by location, lot and expiry.
3. **Inventory** overview: total value, near-expiry, slow-moving and quarantine tiles; each opens the list behind it.
