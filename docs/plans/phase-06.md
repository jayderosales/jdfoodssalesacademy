# Phase 6 — CEO Command Center (CEO reports)

Status: **built** (2026-11-26). Added on request: production, incomplete fulfilment, payables and receivables reports, sales year to date and vs target (new monthly targets), training status. Owner answers in section 7.

## 1. Goal
One place where the CEO sees how the company is doing today and this month, and what needs attention. Every number clicks through to the list behind it and then to the source record (CLAUDE.md §5.9). A short summary is emailed every morning.

## 2. Screens (`/ceo`, sidebar item **CEO reports**, CEO only)
- **Overview**: headline tiles in four areas, each linking to the details:
  - *Sales and profit*: sales today / month to date vs the same days last month, orders, gross profit and margin (from the ledger).
  - *Cash and collections*: cash and bank balance, customers overdue, supplier bills due in 7 days, customer payments waiting to confirm.
  - *Stock and production*: inventory value at cost, items out of stock / below minimum, lots expiring within 60 days, today's production output, orders waiting for stock.
  - *Approvals and risks*: items waiting for the CEO's approval, escalated overdue items (the existing risk feed), unposted accounting events.
  - A 30-day daily sales chart.
- **Sales**: date range; sales by channel, brand, rep, top 10 customers and products; daily trend; month vs last month.
- **Cash**: balances per cash/bank account, receivables aging summary, payables due, payments pending, cash in/out this month.
- **Operations**: stock value by location, below-minimum and out-of-stock list, near-expiry lots, production output by product, incomplete orders.
- **People (training vs sales)**: per sales rep: Academy skill score and at-risk flag (latest skill snapshot) next to their sales for the last 30 / 90 days.

## 3. Data layer
- Aggregations run in Postgres (no row limits, no N+1): `ceo_snapshot()` (one jsonb with every headline number), `ceo_sales_daily(from, to)`, `ceo_sales_breakdown(from, to, dimension)`, `ceo_rep_performance(days)`. They check `ceo.reports.view` and return only aggregates.
- Sales are counted when the order is released (*Ready for pickup*), the same moment the ledger records the sale. Amounts include VAT, as invoiced. Gross profit comes from the ledger (net of VAT). Test (parallel-run) entries are included until the books start, and the screen says so.

## 4. Daily email
- pg_cron at 7:00 Manila calls `send_ceo_daily_digest()`, which builds yesterday's summary and sends it to CEO users through the notification engine (event `ceo.daily_digest`, in-app + email). The email goes out once email is switched on (Settings + Resend). Until then the summary still appears in the notification bell.

## 5. Permissions
- New `ceo.reports.view`, granted to the CEO role only (super administrators hold every permission). Auditors don't get it (owner's choice: CEO only).

## 6. Tests
- DB: only the CEO can call the report functions; numbers match a small seeded scenario (sales by channel, AR overdue, stock below minimum); the digest notifies CEO users only.
- Unit: period comparison and formatting helpers.

## 7. Answers (2026-11-26)
1. First screen: all four areas (sales and profit; cash and collections; stock and production; approvals and risks, plus training vs sales).
2. Schedule: daily email summary.
3. Access: CEO only.

## 8. Later (not in this step)
- Budgets vs actual and forecasts (Phase 5b). Saved/scheduled custom reports for other managers. PDF export of the Command Center.
