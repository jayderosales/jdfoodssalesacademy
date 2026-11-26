import Link from "next/link";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getAccess, getSettings, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Inventory" };

interface Line {
  product_id: string;
  location_id: string;
  sku: string;
  product_name: string;
  qa_status: string;
  on_hand: string;
  value: string | null;
  days_to_expiry: number | null;
  expiry_date: string | null;
  lot_no: string;
  location_name: string;
}

/** Inventory health: value, slow-moving, near-expiry, low stock. Every tile opens the list behind it. */
export default async function InventoryOverview() {
  await requirePermission("inventory.view");
  const access = await getAccess();
  const seeCost = can(access, "inventory.view_cost");
  const s = (await getSettings()) as unknown as { near_expiry_days: number; critical_expiry_days: number; slow_moving_days: number } | null;
  const near = s?.near_expiry_days ?? 60;
  const critical = s?.critical_expiry_days ?? 30;
  const slowDays = s?.slow_moving_days ?? 90;
  const supabase = await createClient();
  const [{ data: lines }, { data: lastOut }, { count: lowStock }, { count: quarantine }] = await Promise.all([
    supabase.from("stock_on_hand").select("product_id, location_id, sku, product_name, qa_status, on_hand, value, days_to_expiry, expiry_date, lot_no, location_name").limit(20000),
    supabase.from("stock_last_outbound").select("product_id, location_id, last_out").limit(20000),
    supabase.from("reorder_suggestions").select("product_id", { count: "exact", head: true }),
    supabase.from("stock_on_hand").select("product_id", { count: "exact", head: true }).eq("qa_status", "quarantine"),
  ]);
  const rows = (lines as Line[] | null) ?? [];
  const last = new Map(((lastOut as { product_id: string; location_id: string; last_out: string }[] | null) ?? []).map((r) => [`${r.product_id}:${r.location_id}`, new Date(r.last_out).getTime()]));
  const slowCutoff = Date.now() - slowDays * 86400000;

  let total = 0, slow = 0, nearV = 0, crit = 0, healthy = 0;
  const exp = { d30: 0, d60: 0, d90: 0 };
  for (const r of rows) {
    const v = Number(r.value ?? 0);
    total += v;
    const d = r.days_to_expiry;
    const isCritical = r.qa_status === "expired" || (d != null && d <= critical);
    const isNear = !isCritical && d != null && d <= near;
    const isSlow = !isCritical && !isNear && (last.get(`${r.product_id}:${r.location_id}`) ?? 0) < slowCutoff;
    if (isCritical) crit += v;
    else if (isNear) nearV += v;
    else if (isSlow) slow += v;
    else healthy += v;
    if (d != null && d >= 0) {
      if (d <= 30) exp.d30 += v;
      if (d <= 60) exp.d60 += v;
      if (d <= 90) exp.d90 += v;
    }
  }
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");
  const money = (n: number) => (seeCost ? formatMoney(n.toFixed(2)) : "—");
  const expiring = rows.filter((r) => r.days_to_expiry != null && r.days_to_expiry <= near && r.qa_status !== "expired").sort((a, b) => (a.days_to_expiry ?? 0) - (b.days_to_expiry ?? 0)).slice(0, 10);
  const skus = new Set(rows.map((r) => r.product_id)).size;

  return (
    <>
      <PageHeader title="Inventory" description={`Health of stock across all locations. Slow-moving = no sales or use in ${slowDays} days.`} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total stock value" value={money(total)} hint={`${skus} products in stock`} href="/inventory/stock" />
        <KpiCard label="Healthy" value={pct(healthy)} hint={money(healthy)} tone="success" href="/inventory/stock?qa=released" />
        <KpiCard label={`Near expiry (≤ ${near} days)`} value={pct(nearV)} hint={money(nearV)} tone="warning" href="/inventory/batches?expiring=1" />
        <KpiCard label={`Critical (≤ ${critical} days or expired)`} value={pct(crit)} hint={money(crit)} tone="danger" href="/inventory/batches?expiring=1" />
        <KpiCard label="Slow-moving" value={pct(slow)} hint={money(slow)} tone="warning" href="/inventory/stock?sort=value&dir=desc" />
        <KpiCard label="Below reorder level" value={lowStock ?? 0} hint="products to reorder" tone={lowStock ? "danger" : "default"} href="/inventory/reorder" />
        <KpiCard label="In QA quarantine" value={quarantine ?? 0} hint="stock lines waiting for release" tone={quarantine ? "warning" : "default"} href="/inventory/batches?status=quarantine" />
        <KpiCard label="Expiring 30 / 60 / 90 days" value={seeCost ? `${formatMoney(exp.d30.toFixed(0))}` : "—"} hint={seeCost ? `${formatMoney(exp.d60.toFixed(0))} / ${formatMoney(exp.d90.toFixed(0))}` : undefined} href="/inventory/batches?expiring=1" />
      </div>
      <Card>
        <CardTitle>Expiring soonest</CardTitle>
        {expiring.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing expires within {near} days.</p>
        ) : (
          <Table>
            <thead><tr><Th>Product</Th><Th>Lot</Th><Th>Location</Th><Th>Expiry</Th><Th className="text-right">On hand</Th>{seeCost && <Th className="text-right">Value</Th>}</tr></thead>
            <tbody>
              {expiring.map((r, i) => (
                <tr key={i}>
                  <Td><Link href={`/inventory/products/${r.product_id}?tab=stock`} className="text-brand underline">{r.sku}</Link><div className="text-xs text-muted-foreground">{r.product_name}</div></Td>
                  <Td className="font-mono text-xs">{r.lot_no}</Td>
                  <Td>{r.location_name}</Td>
                  <Td className={(r.days_to_expiry ?? 99) <= critical ? "font-semibold text-danger" : "text-amber-700"}>{formatDate(r.expiry_date)} ({r.days_to_expiry}d)</Td>
                  <Td className="text-right tabular-nums">{Number(r.on_hand).toLocaleString("en-PH")}</Td>
                  {seeCost && <Td className="text-right tabular-nums">{formatMoney(r.value)}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
