import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { addQtyBreak } from "../actions";
import { SellableDatalist } from "../parts";
import { ListSheet } from "./list-sheet";

export const metadata = { title: "Price lists" };

/** One sheet per price list. Blank = falls back to SRP. Quantity breaks below. */
export default async function PricesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("sales.pricing.manage");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: lists } = await supabase.from("price_lists").select("id, code, name, is_retail").eq("active", true).order("is_retail", { ascending: false }).order("name");
  const ls = (lists as { id: string; code: string; name: string; is_retail: boolean }[] | null) ?? [];
  const editable = ls.filter((l) => !l.is_retail);
  const cur = editable.find((l) => l.code === sp.list) ?? editable[0];
  const q = (sp.q ?? "").trim().replace(/[%_,()]/g, "");
  let pq = supabase.from("products").select("id, sku, name, srp, product_costs(avg_cost)").eq("active", true).order("sku").limit(500);
  if (q) pq = pq.or(`sku.ilike.%${q}%,name.ilike.%${q}%`);
  const [{ data: prods }, { data: items }] = await Promise.all([
    pq,
    cur ? supabase.from("price_list_items").select("product_id, min_qty, price, valid_from, valid_to, products(sku, name)").eq("price_list_id", cur.id) : Promise.resolve({ data: [] }),
  ]);
  const its = (items as unknown as { product_id: string; min_qty: string; price: string; valid_from: string; valid_to: string | null; products: { sku: string; name: string } }[] | null) ?? [];
  const base = new Map(its.filter((i) => Number(i.min_qty) === 1 && i.valid_from === "2000-01-01").map((i) => [i.product_id, i.price]));
  const breaks = its.filter((i) => Number(i.min_qty) !== 1 || i.valid_from !== "2000-01-01");
  const rows = ((prods as unknown as { id: string; sku: string; name: string; srp: string | null; product_costs: { avg_cost: string } | null }[] | null) ?? []).map((p) => ({
    id: p.id, sku: p.sku, name: p.name, srp: p.srp, cost: p.product_costs?.avg_cost ?? null, price: base.get(p.id) ?? null,
  }));

  return (
    <>
      <PageHeader title="Price lists" description="Retail = SRP (edit it in Inventory → Costs & prices). Leave a cell blank to use SRP. Special prices for one customer are on the customer's page." />
      {!cur ? <p>No price lists.</p> : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            {editable.map((l) => (
              <Link key={l.id} href={`/sales/prices?list=${l.code}`} className={`rounded-full border px-3 py-1 ${l.id === cur.id ? "border-brand bg-brand text-white" : "hover:bg-muted"}`}>{l.name}</Link>
            ))}
            <form className="ml-auto" action="/sales/prices"><input type="hidden" name="list" value={cur.code} /><Input name="q" defaultValue={q} placeholder="Filter SKU / name" className="h-8 w-48" aria-label="Filter products" /></form>
          </div>
          <ListSheet listId={cur.id} listName={cur.name} rows={rows} />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>Quantity breaks and future prices ({cur.name})</CardTitle>
              <Table>
                <thead><tr><Th>Product</Th><Th className="text-right">From qty</Th><Th className="text-right">Price</Th><Th>Valid</Th></tr></thead>
                <tbody>
                  {breaks.map((b) => (
                    <tr key={`${b.product_id}:${b.min_qty}:${b.valid_from}`}>
                      <Td>{b.products.sku}</Td>
                      <Td className="text-right">{Number(b.min_qty)}</Td>
                      <Td className="text-right">{formatMoney(b.price)}</Td>
                      <Td>{b.valid_from === "2000-01-01" ? "now" : b.valid_from}{b.valid_to ? ` – ${b.valid_to}` : ""}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {breaks.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
            </Card>
            <Card>
              <CardTitle>Add a quantity break or future price</CardTitle>
              <SellableDatalist />
              <ActionForm action={addQtyBreak} submitLabel="Save">
                <input type="hidden" name="price_list_id" value={cur.id} />
                <Field label="Product" htmlFor="product"><Input id="product" name="product" list="sell-list" required autoComplete="off" /></Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="From qty" htmlFor="min_qty"><Input id="min_qty" name="min_qty" type="number" min={1} step="any" defaultValue={12} /></Field>
                  <Field label="Price" htmlFor="price"><Input id="price" name="price" inputMode="decimal" required /></Field>
                  <Field label="Starting" htmlFor="valid_from"><Input id="valid_from" name="valid_from" type="date" /></Field>
                </div>
              </ActionForm>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
