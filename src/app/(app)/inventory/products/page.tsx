import Link from "next/link";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader, buttonVariants } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { productsTableDef } from "@/lib/tables/registry";
import { runTable } from "@/lib/tables/run";
import { listSavedViews } from "../../saved-view-actions";
import { catalogOptions } from "../options";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requirePermission("inventory.view");
  const access = await getAccess();
  const opts = await catalogOptions();
  const def = productsTableDef(opts.brands, opts.categories);
  const { params, rows, count } = await runTable(def, await searchParams);
  const views = await listSavedViews(def.key, me.id);
  return (
    <>
      <PageHeader
        title="Products"
        description="Each size is its own product (SKU), sold by the piece."
        actions={
          <>
            {can(access, ["inventory.cost.manage", "inventory.products.manage"]) && (
              <Link href="/inventory/prices" className={buttonVariants({ variant: "outline" })}>Edit costs & prices</Link>
            )}
            {can(access, "inventory.products.manage") && <Link href="/inventory/products/new" className={buttonVariants()}>Add product</Link>}
          </>
        }
      />
      <DataTable def={def} params={params} rows={rows} count={count} savedViews={views} empty="No products yet. Import them under Administration → Import data." />
    </>
  );
}
