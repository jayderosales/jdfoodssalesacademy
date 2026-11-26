import Link from "next/link";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { ageItems, type OpenItem, totals } from "@/lib/accounting/aging";
import { formatMoney, fromCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/utils";
import { AgingTable, BooksBanner, cents } from "../parts";

export const metadata = { title: "Receivables" };

/** What customers owe: delivered/ready orders not fully paid, plus opening balances, less money paid on account. */
export default async function ReceivablesPage() {
  await requirePermission(["ar.manage", "accounting.view", "finance.reports.view"]);
  const today = manilaToday();
  const supabase = await createClient();
  const [{ data: orders }, { data: openings }, { data: onAccount }] = await Promise.all([
    supabase.from("sales_orders").select("id, number, customer_id, total, paid_amount, due_date, ready_at").in("status", ["ready_for_pickup", "dispatched", "delivered"]).limit(5000),
    supabase.from("customers").select("id, opening_balance, opening_due_date, created_at").gt("opening_balance", 0),
    supabase.from("payments").select("customer_id, amount").eq("status", "confirmed").is("order_id", null).limit(5000),
  ]);
  type O = { id: string; number: string; customer_id: string; total: string; paid_amount: string; due_date: string | null; ready_at: string | null };
  const items: OpenItem[] = [];
  for (const o of (orders as O[] | null) ?? []) {
    if (Number(o.paid_amount) >= Number(o.total)) continue;
    const issued = (o.ready_at ?? today).slice(0, 10);
    items.push({ key: o.id, party: o.customer_id, label: o.number, date: issued, due: o.due_date ?? issued, amount: cents(o.total), paid: cents(o.paid_amount) });
  }
  for (const c of (openings as { id: string; opening_balance: string; opening_due_date: string | null; created_at: string }[] | null) ?? []) {
    const d = c.opening_due_date ?? c.created_at.slice(0, 10);
    items.push({ key: `opening:${c.id}`, party: c.id, label: "Opening balance", date: d, due: d, amount: cents(c.opening_balance), paid: 0n });
  }
  const rows = ageItems(items, ((onAccount as { customer_id: string; amount: string }[] | null) ?? []).map((p) => ({ party: p.customer_id, amount: cents(p.amount) })), today);
  const ids = rows.map((r) => r.party);
  const { data: custs } = ids.length ? await supabase.from("customers").select("id, name, code").in("id", ids) : { data: [] };
  const names = new Map(((custs as { id: string; name: string; code: string }[] | null) ?? []).map((c) => [c.id, `${c.name}${c.code ? ` (${c.code})` : ""}`]));
  const t = totals(rows);
  const late = t.total - t.buckets.current;
  const m = (c: bigint) => formatMoney(fromCentavos(c));

  return (
    <>
      <PageHeader title="Receivables" description="Who owes us, and how late. Open a customer to see each unpaid order. Record payments in Sales → Payments." />
      <BooksBanner />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Customers owe us" value={m(t.total)} />
        <KpiCard label="Overdue" value={m(late)} tone={late ? "danger" : "success"} hint={t.total ? `${Math.round(Number((late * 100n) / (t.total || 1n)))}% of the total` : undefined} />
        <KpiCard label="Over 90 days late" value={m(t.buckets["90+"])} tone={t.buckets["90+"] ? "danger" : "default"} />
      </div>
      <Card>
        <CardTitle>Aging as of today</CardTitle>
        {rows.length ? (
          <AgingTable rows={rows} names={names} partyHref={(p) => `/sales/customers/${p}`} itemHref={(k) => (k.startsWith("opening:") ? null : `/sales/orders/${k}`)} />
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">No one owes us anything right now.</p>
        )}
      </Card>
      <p className="mt-3 text-sm text-muted-foreground">Money a customer paid without an order is applied to their oldest unpaid items first. Follow up overdue customers from their <Link href="/sales/customers" className="underline">customer page</Link>. The ledger&apos;s receivables account should match this total; differences show in the <Link href="/accounting/ledger?account=1100" className="underline">ledger</Link>.</p>
    </>
  );
}
