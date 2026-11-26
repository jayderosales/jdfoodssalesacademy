import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Select, Table, Td, Th, Button } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { catalogOptions } from "../../options";

export const metadata = { title: "Stock card" };

const DOC_HREF: Record<string, string> = {
  stock_receipts: "/inventory/receipts/",
  stock_transfers: "/inventory/transfers/",
  stock_adjustments: "/inventory/adjustments/",
  stock_counts: "/inventory/counts/",
};
const TYPE_LABEL: Record<string, string> = {
  receipt: "Received", return_in: "Customer return", production_output: "Produced", transfer_in: "Transfer in", count_variance: "Count difference",
  adjustment: "Adjustment", production_issue: "Used in production", sale_dispatch: "Dispatched (sale)", transfer_out: "Transfer out",
  sample: "Sample", internal_use: "Internal use", damage: "Damaged", disposal: "Disposed",
};

/** Every movement of one product, newest first, with a running balance (all locations or one). */
export default async function StockCardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ location?: string }> }) {
  const { id } = await params;
  const { location } = await searchParams;
  await requirePermission("inventory.view");
  const access = await getAccess();
  const seeCost = can(access, "inventory.view_cost");
  const supabase = await createClient();
  const opts = await catalogOptions();
  const { data: product } = await supabase.from("products").select("id, sku, name, base_unit").eq("id", id).maybeSingle();
  if (!product) notFound();
  const p = product as { id: string; sku: string; name: string; base_unit: string };
  let q = supabase
    .from("stock_movements")
    .select("id, qty, movement_type, doc_table, doc_id, doc_number, reason, created_at, created_by, locations(name), batches(lot_no), stock_movement_costs(unit_cost, value, avg_cost_after)")
    .eq("product_id", id)
    .order("id", { ascending: true })
    .limit(2000);
  if (location) q = q.eq("location_id", location);
  const { data } = await q;
  type Row = { id: number; qty: string; movement_type: string; doc_table: string; doc_id: string | null; doc_number: string; reason: string; created_at: string; locations: { name: string } | null; batches: { lot_no: string } | null; stock_movement_costs: { unit_cost: string; value: string; avg_cost_after: string } | null };
  let running = 0;
  const rows = ((data as unknown as Row[] | null) ?? []).map((r) => ({ ...r, balance: (running += Number(r.qty)) })).reverse();

  return (
    <>
      <PageHeader
        title={`Stock card · ${p.sku}`}
        description={`${p.name}. Every movement, newest first. Balance in ${p.base_unit}.`}
        actions={<Link href={`/inventory/products/${p.id}`} className="text-sm text-brand underline">Product</Link>}
      />
      <Card>
        <form className="mb-3 flex gap-2">
          <Select name="location" defaultValue={location ?? ""} aria-label="Location" className="w-60">
            <option value="">All locations</option>
            {opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
          <Button type="submit" variant="outline">Show</Button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>When</Th><Th>What</Th><Th>Document</Th><Th>Location</Th><Th>Lot</Th><Th className="text-right">In / out</Th><Th className="text-right">Balance</Th>
              {seeCost && <Th className="text-right">Unit cost</Th>}
              {seeCost && <Th className="text-right">Avg after</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDate(r.created_at, true)}</Td>
                <Td>{TYPE_LABEL[r.movement_type] ?? r.movement_type}<div className="text-xs text-muted-foreground">{r.reason}</div></Td>
                <Td>{r.doc_id && DOC_HREF[r.doc_table] ? <Link href={DOC_HREF[r.doc_table] + r.doc_id} className="text-brand underline">{r.doc_number}</Link> : r.doc_number || "—"}</Td>
                <Td>{r.locations?.name}</Td>
                <Td className="font-mono text-xs">{r.batches?.lot_no}</Td>
                <Td className={`text-right tabular-nums ${Number(r.qty) < 0 ? "text-danger" : "text-success"}`}>{Number(r.qty) > 0 ? "+" : ""}{Number(r.qty).toLocaleString("en-PH")}</Td>
                <Td className="text-right tabular-nums font-medium">{r.balance.toLocaleString("en-PH")}</Td>
                {seeCost && <Td className="text-right tabular-nums">{r.stock_movement_costs ? formatMoney(Number(r.stock_movement_costs.unit_cost).toFixed(2)) : "—"}</Td>}
                {seeCost && <Td className="text-right tabular-nums">{r.stock_movement_costs ? formatMoney(Number(r.stock_movement_costs.avg_cost_after).toFixed(2)) : "—"}</Td>}
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No movements yet.</p>}
      </Card>
    </>
  );
}
