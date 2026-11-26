import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { stockTableDef } from "@/lib/tables/registry";
import { runTable } from "@/lib/tables/run";
import { listSavedViews } from "../../saved-view-actions";
import { catalogOptions } from "../options";

export const metadata = { title: "Stock on hand" };

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requirePermission("inventory.view");
  const access = await getAccess();
  const opts = await catalogOptions();
  const def = stockTableDef(opts.locations, opts.brands);
  if (!can(access, "inventory.view_cost")) def.columns = def.columns.filter((c) => c.key !== "value" && c.key !== "avg_cost");
  const sp = await searchParams;
  const { params, rows, count } = await runTable(def, sp);
  const views = await listSavedViews(def.key, me.id);
  let total: string | null = null;
  if (can(access, "inventory.view_cost")) {
    const supabase = await createClient();
    let q = supabase.from("stock_on_hand").select("value");
    if (params.filters.location) q = q.eq("location_id", params.filters.location);
    const { data } = await q.limit(20000);
    total = ((data as { value: string | null }[] | null) ?? []).reduce((s, r) => s + Number(r.value ?? 0), 0).toFixed(2);
  }
  return (
    <>
      <PageHeader title="Stock on hand" description={`By product, location and batch.${total ? ` Total value: ${formatMoney(total)}.` : ""}`} />
      <DataTable def={def} params={params} rows={rows} count={count} savedViews={views} empty="No stock yet. Receive stock or import opening stock." />
    </>
  );
}
