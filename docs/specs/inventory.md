# Inventory specification (Phase 2)

Rules the code must follow. If a rule here changes, update this file and DECISIONS.md.

## Units of measure
- Every product has one **base unit** (the smallest unit stock is counted in, usually "pack" or "g"). All ledger quantities are in the base unit, `numeric(18,4)`.
- Conversions are per product: `1 case = 12 pack`. A conversion factor is stored as "base units per unit" (case → 12). Entering 2 cases stores 24 packs.
- Weight-based units (kg ↔ g) are global conversions; product-specific ones override.
- Rounding: conversions round to 4 decimals; a movement that would leave a fractional base unit for a unit marked "whole only" (e.g. pack) is rejected.

## Batches and QA status
- Status: `quarantine` → `released` | `on_hold` | `rejected`; any → `expired` (job). Only `released` stock is sellable, reservable or transferable to a sellable location.
- New batches from receipts start in **quarantine** unless the product is set to "release on receipt" (merchandise, packaging).
- Expiry = manufacturing date + shelf life when not given. The nightly job (00:30 Manila) marks batches past expiry `expired` and notifies the warehouse.
- Changing QA status needs `inventory.qa.release` (QA personnel; admins).

## Ledger
- `stock_movements`: product, location, bin, batch, signed quantity (base unit), unit cost, movement type, source document (table + id + number), reason, created by/at. Updates and deletes are refused by trigger, even for the service role.
- Movement types and sign: receipt (+), return_in (+), production_output (+), transfer_in (+), count_variance (±), adjustment (±), production_issue (−), sale_dispatch (−), transfer_out (−), sample (−), internal_use (−), damage (−), disposal (−).
- `stock_balances(product, location, bin, batch)`: on_hand, reserved; updated only by `post_stock_movement()` in the same transaction. Check constraints: on_hand ≥ 0, reserved ≥ 0, reserved ≤ on_hand.
- Every posting emits a `stock.moved` domain event (accounting consumes it in Phase 5).

## Costing (moving weighted average)
- One average cost per product (single company).
- Incoming movements with a cost: new_avg = (old_qty × old_avg + in_qty × in_cost) / (old_qty + in_qty).
- Outgoing movements are valued at the current average; their unit cost is stored on the movement.
- Transfers move value at the current average (no change).
- Count gains are valued at the current average. If the item has no average yet, a cost must be entered.
- When on-hand goes to zero the average is kept for the next receipt.
- Precision: unit cost `numeric(18,6)`, values `numeric(18,2)`, computed in SQL.

## Reservations and FEFO
- `reserve_stock(product, location, qty, source)` takes released batches ordered by expiry (earliest first; no expiry last), then by received date. It locks balance rows, raises an error if not enough is available, and returns the allocation lines.
- Available-to-sell (product, location) = Σ(on_hand − reserved) over released, unexpired batches.
- A minimum remaining shelf life per channel (e.g. Shopify ≥ 30 days) is configurable and applied by FEFO.

## Transfers
- Two steps: **dispatch** (transfer_out at source, stock moves to a virtual "in transit" location), then **receive** (transfer_in at the destination). Short-received quantity stays in transit until resolved (as a variance with approval).
- Can't transfer non-released stock into a sellable location (quarantine stock moves only between quarantine bins).

## Adjustments, damage and disposal
- An adjustment request lists lines (product, batch, bin, qty ±, reason, photo). It's valued at average cost and goes through the approval engine (doc type `stock_adjustment`). It posts on approval.
- Damage moves stock to an on-hold "damaged" bin (no approval). Disposal of damaged stock needs approval.

## Cycle counts
- Count sheet = a frozen snapshot of the expected quantities for the chosen bins/zone/ABC class. Counters enter quantities on the phone; system quantities can be hidden ("blind count").
- Variances are valued, the sheet is submitted for approval (doc type `stock_count`), and on approval the variances post as `count_variance` movements.
- Movements that happen in the counted bins after the snapshot are shown, so the variance is computed against the right baseline.

## Reorder
- Per product per location: min, max, safety stock, lead time (days). Suggested quantity = max − (available + on order), rounded up to the purchase unit. On order comes from Phase 4 (0 until then).
- When available drops to or below min, a `stock.reorder_needed` event notifies procurement (operations manager for now) once per crossing.

## Health classification (dashboard)
- **Near expiry**: expires within the configurable window (default 60 days). **Critical**: within 30 days, or already expired and still on hand.
- **Slow-moving**: no outbound movement in N days (default 90).
- **Healthy**: everything else.
- Each tile opens the filtered list behind it.

## Permissions (new)
`inventory.view`, `inventory.products.manage`, `inventory.receive`, `inventory.transfer`, `inventory.adjust.request`, `inventory.count`, `inventory.qa.release`, `inventory.reorder.manage`, `inventory.view_cost` (value and cost columns; restricted to finance, ops, CEO). Location-scoped grants limit warehouse staff to their own location.
