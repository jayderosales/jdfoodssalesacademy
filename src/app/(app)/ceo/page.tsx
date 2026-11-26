import Link from "next/link";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { RiskFeed } from "../dashboard/risk-feed";
import { loadSnapshot } from "./data";
import { addDays, DailyBars, Delta, peso, pesoShort, TargetBar, TestBooksNote, Tile } from "./parts";

export const metadata = { title: "CEO reports" };

export default async function CeoOverview() {
  await requirePermission("ceo.reports.view");
  const supabase = await createClient();
  const s = await loadSnapshot();
  const n = (v: string | number | null | undefined) => Number(v ?? 0);
  const { data: daily } = await supabase.rpc("ceo_sales_daily", { p_from: addDays(s.today, -29), p_to: s.today });
  const days = ((daily as { day: string; orders: number; sales: string; collected: string }[] | null) ?? []).map((d) => ({ day: d.day, value: n(d.sales), sub: `${d.orders} orders · collected ${peso(d.collected)}` }));
  const revenue = n(s.ledger.revenue);
  const gp = revenue - n(s.ledger.cost_of_sales);
  const pace = (s.target.day_of_month / s.target.days_in_month) * 100;

  return (
    <>
      <PageHeader title="CEO reports" description={`Company at a glance, ${formatDate(s.today)}. Click any number to see what's behind it. A summary is sent to you every morning at 7:00.`} />
      <TestBooksNote live={s.ledger.books_live} />

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sales and profit</h2>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Sales today" value={peso(s.sales.today)} sub={`${s.sales.orders_today} orders · yesterday ${pesoShort(n(s.sales.yesterday))}`} href="/ceo/sales" />
        <Tile label="Sales this month" value={peso(s.sales.mtd)} sub={<Delta now={n(s.sales.mtd)} before={n(s.sales.last_month_same_days)} label="same days last month" />} href="/ceo/sales" />
        <Tile label="Sales this year" value={peso(s.sales.ytd)} sub={`${s.sales.orders_ytd} orders`} href="/ceo/sales?range=ytd" />
        <Tile label="Gross profit this month" value={peso(gp)} sub={revenue ? `${Math.round((gp / revenue) * 100)}% margin on ${pesoShort(revenue)} net sales` : "From the accounting books"} href="/accounting/reports?r=pl" />
      </div>
      <Card className="mb-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <CardTitle>Daily sales, last 30 days</CardTitle>
            <DailyBars days={days} title="Daily sales, last 30 days" />
          </div>
          <div className="space-y-4">
            <div><CardTitle>This month vs target</CardTitle><TargetBar actual={n(s.sales.mtd)} target={s.target.month ? n(s.target.month) : null} pace={pace} /></div>
            <div><CardTitle>Year to date vs target</CardTitle><TargetBar actual={n(s.sales.ytd)} target={s.target.ytd ? n(s.target.ytd) : null} /></div>
            <Link href="/ceo/targets" className="text-xs text-brand underline">Set or change targets</Link>
          </div>
        </div>
      </Card>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cash and collections</h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Cash and bank" value={peso(s.ledger.cash)} href="/accounting/banks" />
        <Tile label="Customers overdue" value={peso(s.receivables.overdue)} tone={n(s.receivables.overdue) > 0 ? "bad" : "good"} sub={`${s.receivables.overdue_customers} customers · ${pesoShort(n(s.receivables.owed))} owed in total`} href="/ceo/receivables" />
        <Tile label="Supplier bills due in 7 days" value={peso(s.payables.due_7_days)} tone={n(s.payables.overdue) > 0 ? "warn" : "default"} sub={n(s.payables.overdue) > 0 ? `${peso(s.payables.overdue)} already overdue` : `${pesoShort(n(s.payables.owed))} owed in total`} href="/ceo/payables" />
        <Tile label="Payments to confirm" value={s.payments_pending.count} sub={peso(s.payments_pending.amount)} tone={s.payments_pending.count ? "warn" : "default"} href="/sales/payments" />
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Stock and production</h2>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Inventory value (cost)" value={pesoShort(n(s.inventory.value))} href="/inventory" />
        <Tile label="Out of stock / below minimum" value={`${s.reorder.out_of_stock} / ${s.reorder.below_min}`} tone={s.reorder.out_of_stock ? "bad" : s.reorder.below_min ? "warn" : "good"} href="/inventory/reorder" />
        <Tile label="Expiring within 60 days" value={`${s.near_expiry.lots} lots`} sub={peso(s.near_expiry.value)} tone={s.near_expiry.lots ? "warn" : "default"} href="/inventory/batches" />
        <Tile label="Production today" value={`${s.production_today.lots} lots`} sub={`${s.production_today.products} products`} href="/ceo/production" />
        <Tile label="Orders waiting for stock" value={s.incomplete_orders.count} tone={s.incomplete_orders.count ? "warn" : "good"} href="/ceo/fulfilment" />
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Approvals and risks</h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Waiting for your approval" value={s.approvals.count} sub={peso(s.approvals.amount)} tone={s.approvals.count ? "warn" : "good"} href="/approvals" />
        <Tile label="Escalated overdue items" value={s.risks.count} tone={s.risks.count ? "bad" : "good"} />
        <Tile label="Accounting events not posted" value={s.unposted.count} tone={s.unposted.count ? "bad" : "good"} href="/accounting" />
      </div>
      <RiskFeed />
    </>
  );
}
