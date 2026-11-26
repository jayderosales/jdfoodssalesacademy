import Link from "next/link";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { manilaMonthStart, manilaDayStart } from "@/lib/utils";
import { CHANNEL_LABEL } from "./parts";

export const metadata = { title: "Sales" };

const RELEASED = ["ready_for_pickup", "dispatched", "delivered"];

/** Sales today and this month, work queues, and sales by channel and product. Every tile opens the list behind it. */
export default async function SalesOverview() {
  await requirePermission(["sales.view", "sales.fulfil", "sales.payments.confirm"]);
  const supabase = await createClient();
  const month = manilaMonthStart().toISOString();
  const today = manilaDayStart().toISOString();
  const [{ data: mo }, { count: unpaid }, { count: topack }, { count: ready }, { count: credit }, { count: payCheck }, { data: lines }] = await Promise.all([
    supabase.from("sales_orders").select("id, total, channel, ready_at, status").in("status", RELEASED).gte("ready_at", month).limit(10000),
    supabase.from("sales_orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_payment"),
    supabase.from("sales_orders").select("id", { count: "exact", head: true }).in("status", ["confirmed", "packing"]),
    supabase.from("sales_orders").select("id", { count: "exact", head: true }).eq("status", "ready_for_pickup"),
    supabase.from("sales_orders").select("id", { count: "exact", head: true }).eq("status", "credit_review"),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("sales_order_lines").select("qty, line_total, products(sku, name), sales_orders!inner(status, ready_at)").in("sales_orders.status", RELEASED).gte("sales_orders.ready_at", month).limit(20000),
  ]);
  const orders = (mo as { id: string; total: string; channel: string; ready_at: string }[] | null) ?? [];
  const monthTotal = orders.reduce((s, o) => s + Number(o.total), 0);
  const todays = orders.filter((o) => o.ready_at >= today);
  const todayTotal = todays.reduce((s, o) => s + Number(o.total), 0);
  const byChannel = new Map<string, number>();
  for (const o of orders) byChannel.set(o.channel, (byChannel.get(o.channel) ?? 0) + Number(o.total));
  const byProduct = new Map<string, { name: string; qty: number; value: number }>();
  for (const l of (lines as unknown as { qty: string; line_total: string; products: { sku: string; name: string } }[] | null) ?? []) {
    const cur = byProduct.get(l.products.sku) ?? { name: l.products.name, qty: 0, value: 0 };
    cur.qty += Number(l.qty);
    cur.value += Number(l.line_total);
    byProduct.set(l.products.sku, cur);
  }
  const top = [...byProduct.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 10);
  const m = (n: number) => formatMoney(n.toFixed(2));

  return (
    <>
      <PageHeader title="Sales" description="Sales count when an order is released (ready for pickup). Amounts are VAT-inclusive billing amounts." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sales today" value={m(todayTotal)} hint={`${todays.length} orders released`} href="/sales/orders?f=all" />
        <KpiCard label="Sales this month" value={m(monthTotal)} hint={`${orders.length} orders`} href="/sales/orders?f=all" />
        <KpiCard label="Waiting for payment" value={unpaid ?? 0} tone={unpaid ? "warning" : "default"} href="/sales/orders?f=unpaid" />
        <KpiCard label="Payments to confirm" value={payCheck ?? 0} tone={payCheck ? "warning" : "default"} href="/sales/payments" />
        <KpiCard label="To pack" value={topack ?? 0} tone={topack ? "warning" : "default"} href="/sales/fulfilment" />
        <KpiCard label="Waiting for courier" value={ready ?? 0} href="/sales/fulfilment" />
        <KpiCard label="Credit approvals" value={credit ?? 0} tone={credit ? "danger" : "default"} href="/approvals" />
        <KpiCard label="Online shop" value="Open" hint="See what customers see" href="/shop" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>This month by channel</CardTitle>
          {byChannel.size === 0 ? <p className="text-sm text-muted-foreground">No released orders yet this month.</p> : (
            <ul className="space-y-2 text-sm">
              {[...byChannel.entries()].sort((a, b) => b[1] - a[1]).map(([ch, v]) => (
                <li key={ch}>
                  <div className="flex justify-between"><Link href={`/sales/orders?f=all&channel=${ch}`} className="underline">{CHANNEL_LABEL[ch] ?? ch}</Link><span className="tabular-nums">{m(v)}</span></div>
                  <div className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded bg-brand" style={{ width: `${Math.round((v / monthTotal) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>Top products this month</CardTitle>
          <Table>
            <thead><tr><Th>Product</Th><Th className="text-right">Qty</Th><Th className="text-right">Sales</Th></tr></thead>
            <tbody>
              {top.map(([sku, v]) => (
                <tr key={sku}><Td>{sku}<div className="text-xs text-muted-foreground">{v.name}</div></Td><Td className="text-right tabular-nums">{v.qty.toLocaleString("en-PH")}</Td><Td className="text-right tabular-nums">{m(v.value)}</Td></tr>
              ))}
            </tbody>
          </Table>
          {top.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
        </Card>
      </div>
    </>
  );
}
