import Link from "next/link";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaMonthStart, manilaToday } from "@/lib/utils";

export const metadata = { title: "Procurement" };

/** Requests to order, POs waiting, late deliveries, invoices to match, spend this month. Every tile opens its list. */
export default async function ProcurementOverview() {
  await requirePermission(["procurement.view", "procurement.po.create"]);
  const supabase = await createClient();
  const today = manilaToday();
  const month = manilaMonthStart().toISOString().slice(0, 10);
  const [{ count: reqs }, { count: waiting }, { data: late }, { count: toMatch }, { count: variance }, { data: spend }, { data: perf }] = await Promise.all([
    supabase.from("purchase_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("purchase_orders").select("id, number, expected_date, total, suppliers(name)").in("status", ["sent", "partly_received", "approved"]).lt("expected_date", today).order("expected_date").limit(20),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).in("status", ["received", "partly_received"]),
    supabase.from("supplier_invoices").select("id", { count: "exact", head: true }).in("status", ["variance", "submitted"]),
    supabase.from("purchase_orders").select("total, suppliers(name)").in("status", ["approved", "sent", "partly_received", "received", "closed"]).gte("order_date", month).limit(5000),
    supabase.from("supplier_performance").select("*").gt("po_count", 0).order("po_value", { ascending: false }).limit(10),
  ]);
  const lateRows = (late as unknown as { id: string; number: string; expected_date: string; total: string; suppliers: { name: string } | null }[] | null) ?? [];
  const spendRows = (spend as unknown as { total: string; suppliers: { name: string } | null }[] | null) ?? [];
  const spendTotal = spendRows.reduce((s, r) => s + Number(r.total), 0);
  const bySupplier = new Map<string, number>();
  for (const r of spendRows) bySupplier.set(r.suppliers?.name ?? "?", (bySupplier.get(r.suppliers?.name ?? "?") ?? 0) + Number(r.total));
  const pr = (perf as { supplier_id: string; name: string; po_count: number; po_value: string; on_time_pct: string | null; fill_pct: string | null; reject_pct: string | null }[] | null) ?? [];
  const pct = (v: string | null) => (v == null ? "—" : `${Number(v)}%`);

  return (
    <>
      <PageHeader title="Procurement" description="Requests → purchase order (CEO approval) → receive against the PO → match the supplier's invoice." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Requests to order" value={reqs ?? 0} tone={reqs ? "warning" : "default"} href="/procurement/requests" />
        <KpiCard label="POs waiting for CEO" value={waiting ?? 0} href="/procurement/orders?f=submitted" />
        <KpiCard label="Late deliveries" value={lateRows.length} tone={lateRows.length ? "danger" : "default"} href="/procurement/orders?f=open" />
        <KpiCard label="Invoices with variance" value={variance ?? 0} tone={variance ? "warning" : "default"} href="/procurement/invoices" hint={`${toMatch ?? 0} received POs to bill`} />
        <KpiCard label="Ordered this month" value={formatMoney(spendTotal.toFixed(2))} hint={`${spendRows.length} POs`} href="/procurement/orders?f=all" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Late deliveries</CardTitle>
          {lateRows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing late.</p> : (
            <ul className="divide-y text-sm">
              {lateRows.map((r) => (
                <li key={r.id} className="flex justify-between py-2">
                  <span><Link href={`/procurement/orders/${r.id}`} className="text-brand underline">{r.number}</Link> · {r.suppliers?.name}</span>
                  <span className="font-semibold text-danger">due {formatDate(r.expected_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>Ordered this month by supplier</CardTitle>
          {bySupplier.size === 0 ? <p className="text-sm text-muted-foreground">No approved POs this month.</p> : (
            <ul className="space-y-1 text-sm">
              {[...bySupplier.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => <li key={n} className="flex justify-between"><span>{n}</span><span className="tabular-nums">{formatMoney(v.toFixed(2))}</span></li>)}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>Supplier performance</CardTitle>
          <Table>
            <thead><tr><Th>Supplier</Th><Th className="text-right">POs</Th><Th className="text-right">Value</Th><Th className="text-right">On time</Th><Th className="text-right">Fill rate</Th><Th className="text-right">QA rejects</Th></tr></thead>
            <tbody>
              {pr.map((s) => (
                <tr key={s.supplier_id}>
                  <Td><Link href={`/procurement/suppliers/${s.supplier_id}`} className="text-brand underline">{s.name}</Link></Td>
                  <Td className="text-right">{s.po_count}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(s.po_value)}</Td>
                  <Td className="text-right">{pct(s.on_time_pct)}</Td>
                  <Td className="text-right">{pct(s.fill_pct)}</Td>
                  <Td className="text-right">{pct(s.reject_pct)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {pr.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No purchase orders yet.</p>}
        </Card>
      </div>
    </>
  );
}
