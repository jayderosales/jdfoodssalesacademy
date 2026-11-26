# Phase 3 — Sales: customers, orders, online shop

Status: **built** (2026-11-26). The owner said "continue" and asked for CRM too, so leads, activities and GPS field visits were added back in. Not yet done: Shopify sync, marketplace imports, sales targets and commissions, Playwright E2E for the shop. Design questions answered the same day (section 9). Requested: "sales, with landing page and shop for customers; sales are deducted from inventory once payment is confirmed and the product is prepared for delivery."

This merges the core of the planned 3a (customers, pricing) and 3b (orders, fulfilment, courier, invoices) with the customer shop that was planned for Phase 7. Leads/pipeline, field visits (GPS), targets, commissions, Shopify sync and marketplace imports move to **Phase 3c** so this phase stays reviewable.

## 1. Goal

A customer can find JD Foods, browse the catalog, order and pay. Staff can take orders by phone/Messenger/field too. Every order flows through one pipeline, and stock only leaves the books when the order is **paid (or approved on credit) and packed for the courier**.

## 2. Scope (build order)

1. **Customers**: customer master (retail, regular, corporate, distributor, reseller), contacts, delivery addresses, credit terms and limit, customer 360 page (orders, balance, notes). Import template for customers and opening balances (AR).
2. **Pricing**: price lists (Retail = SRP, Regular, Corporate, Distributor, Reseller), effective-dated price-list lines, customer-specific prices. One pure function `resolvePrice(customer, product, qty, date)` with unit tests. Bulk price-sheet editor like Costs & prices.
3. **Public landing page** at `/` (signed-out visitors): hero, brands (JD Foods, ThyChef, Arkadia…), featured products, how ordering and delivery work, contact. Signed-in staff keep going to the dashboard.
4. **Shop** at `/shop`: catalog by brand/category with search, product pages, cart, checkout (name, mobile, email, delivery address, courier preference, notes; guest or signed in; a note that the customer pays the courier), order confirmation page and email, "track my order" by order number + mobile. Mobile-first. Retail (SRP) prices for guests; signed-in portal customers see their price list.
5. **Sales orders** (staff, `/sales/orders`): create for a customer (phone, Messenger, field, walk-in, shop), lines priced by the price engine, discounts within limits; no shipping line (the customer pays the courier directly). Lifecycle below.
6. **Payments**: record payment against an order (cash, bank transfer, GCash/Maya, cheque, online) with reference and proof photo; finance confirms. Online card/e-wallet payment through **PayMongo** once its keys are set (webhook marks the order paid automatically).
7. **Credit check**: orders on terms check credit limit and overdue balance; over-limit or overdue → approval (CEO) before release.
8. **Fulfilment**: pick list (FEFO lots chosen by the system), pack, mark **Ready for pickup** → this posts the stock deduction. Courier booking record (courier, tracking number, fee for information only), dispatched, delivered with proof (photo/screenshot), returns.
9. **Billing invoice + official SI monitoring**: billing invoice generated from the order; record the official sales invoice number from the booklet; SI register (booklets, ranges, holder) with missing / duplicate / out-of-range / gap alerts.
10. **Sales overview**: today's orders, awaiting payment, to pack, ready for pickup, sales by channel/brand, top products. Every tile drills down.

## 3. Order lifecycle and the inventory rule

```
draft → placed ─┬─ (cash/online)  awaiting_payment → paid ─┐
                └─ (on terms)     credit check → approved ─┤
                                                           ▼
                           packing (stock reserved, FEFO) → ready_for_pickup → dispatched → delivered
                                                              ▲ stock deducted here
cancelled (any time before ready_for_pickup: reservations released)
```

- **Reserve** when the order is placed (so the shop never sells stock that is already promised). Unpaid shop orders auto-cancel after a set time (setting, default 48 hours) and release the reservation.
- **Deduct** (a `sale_dispatch` movement per lot, at moving average cost) only when staff mark the order **Ready for pickup**, and only if it is **paid** or **approved on credit**. Enforced in the database: the status can't move to ready_for_pickup otherwise.
- Pickup points are hand-over points, not stock locations (Phase 2 decision), so stock leaves the FG warehouse at ready_for_pickup.
- Cancel after ready_for_pickup = a **return** document (stock back into a quarantine batch status, QA decides).

## 4. Data model (new tables)

customers, customer_contacts, customer_addresses · price_lists, price_list_items, customer_prices · sales_orders, sales_order_lines (with reserved lots) · payments, payment_allocations · shipments (courier, tracking, fee, POD attachment) · billing_invoices · si_booklets, si_issuances · sales_returns. Shop carts stay in the browser; an order is created only at checkout (anonymous insert through a security-definer `place_shop_order` function with rate limiting and validation).

RLS: customers and orders scoped by `sales.*` permissions (reps see their own customers unless they have `sales.view_all`); shop customers see only their own orders; guests can't read anything except the public catalog view (active products, name, size, SRP, photo, in-stock flag — never cost or stock quantity).

## 5. Permissions (new)

sales.view, sales.view_all, sales.customers.manage, sales.orders.create, sales.orders.discount, sales.pricing.manage, sales.payments.record, sales.payments.confirm, sales.fulfil, sales.invoices.manage, sales.si.manage. Approvals: credit release → CEO; discount above limit → CEO.

## 6. Screens

Public: `/` landing, `/shop`, `/shop/[sku]`, `/shop/cart`, `/shop/checkout`, `/shop/order/[number]`.
Staff: Sales overview, Customers (+360), Price lists, Orders (+record page with timeline), Payments to confirm, Fulfilment board (To pack → Ready for pickup → Dispatched), Invoices & SI register.

## 7. Tests

Unit: price resolution, order totals/discounts/rounding, credit check. DB (PGlite): guest can place an order but read nothing else; reservation on placement; deduction only at ready_for_pickup and only when paid/approved; cancel releases stock; auto-cancel of unpaid orders; RLS per role; SI gap/duplicate detection. Playwright: guest buys → staff confirms payment → packs → stock drops.

## 8. Risks

- **Two shops.** jdfoods.ph runs on Shopify today. A second shop splits orders and stock unless one replaces the other or they sync (question 2).
- **Payment confirmation by hand** is slow for ~20 orders a day; PayMongo removes it but needs a business account and fees.
- **Courier arranged by the customer**: the order page must make clear who books and pays the courier, or customers will expect delivery to be included.
- Product photos don't exist in the system yet; the shop looks bare until they're uploaded (bulk upload included).

## 9. Answers (2026-11-26)

1. **Payment: both.** Bank transfer / GCash / Maya with proof upload, confirmed by finance, from day one. PayMongo (card, GCash, Maya, auto-confirmed by webhook) is built behind a switch and turned on once the PayMongo account and keys exist.
2. **Shopify: run alongside.** The new shop is built now; Shopify stays live. Shopify order import and two-way stock sync come in Phase 3c, so for now Shopify stock is still updated by hand.
3. **Shipping: the customer pays the courier directly.** Orders carry no shipping fee. The shipment record still keeps courier, tracking number and proof of delivery; any fee is information only, never in the order total or revenue.
4. **Guest checkout allowed.** Name, mobile and address are enough; an account is optional (needed for special prices and order history). Guest orders create or match a customer by mobile number.
