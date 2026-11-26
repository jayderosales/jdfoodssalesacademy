import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { catalogOptions } from "../options";
import { PriceSheet, type SheetRow } from "./price-sheet";

export const metadata = { title: "Costs & prices" };

export default async function PricesPage({ searchParams }: { searchParams: Promise<{ q?: string; brand?: string; category?: string }> }) {
  await requirePermission(["inventory.cost.manage", "inventory.products.manage"]);
  const access = await getAccess();
  const { q, brand, category } = await searchParams;
  const opts = await catalogOptions();
  const supabase = await createClient();
  let query = supabase.from("products").select("id, sku, name, base_unit, srp, item_type").eq("active", true).order("sku").limit(500);
  if (brand) query = query.eq("brand_id", brand);
  if (category) query = query.eq("category_id", category);
  if (q) {
    const s = q.replace(/[%,()*]/g, "").slice(0, 60);
    query = query.or(`sku.ilike.%${s}%,name.ilike.%${s}%`);
  }
  const { data } = await query;
  const products = (data as { id: string; sku: string; name: string; base_unit: string; srp: string | null; item_type: string }[] | null) ?? [];
  const ids = products.map((p) => p.id);
  const seeCost = can(access, "inventory.view_cost");
  const [{ data: costs }, { data: stock }] = await Promise.all([
    seeCost && ids.length ? supabase.from("product_costs").select("product_id, avg_cost").in("product_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("stock_balances").select("product_id, on_hand").in("product_id", ids).gt("on_hand", 0) : Promise.resolve({ data: [] }),
  ]);
  const costBy = new Map(((costs as { product_id: string; avg_cost: string }[] | null) ?? []).map((c) => [c.product_id, c.avg_cost]));
  const stockBy = new Map<string, number>();
  for (const s of (stock as { product_id: string; on_hand: string }[] | null) ?? []) stockBy.set(s.product_id, (stockBy.get(s.product_id) ?? 0) + Number(s.on_hand));

  const rows: SheetRow[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.base_unit,
    srp: p.srp,
    cost: costBy.get(p.id) ?? null,
    onHand: stockBy.get(p.id) ?? 0,
    stocked: !["service", "bundle"].includes(p.item_type),
  }));

  return (
    <>
      <PageHeader title="Costs & prices" description="Edit SRPs and costs for many products at once. Only the cells you change are saved, and every change is recorded." />
      <Card className="mb-4">
        <form className="flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q} placeholder="Search SKU or name" aria-label="Search" className="w-56" />
          <Select name="brand" defaultValue={brand ?? ""} aria-label="Brand" className="w-44">
            <option value="">All brands</option>
            {opts.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select name="category" defaultValue={category ?? ""} aria-label="Category" className="w-56">
            <option value="">All categories</option>
            {opts.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button type="submit" variant="outline">Show</Button>
          <span className="text-xs text-muted-foreground">{rows.length} products{rows.length === 500 ? " (first 500; filter to see more)" : ""}</span>
        </form>
      </Card>
      <PriceSheet rows={rows} canPrice={can(access, "inventory.products.manage")} canCost={can(access, "inventory.cost.manage")} seeCost={seeCost} />
    </>
  );
}
