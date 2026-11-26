import Link from "next/link";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader, buttonVariants } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { pettyCashTable } from "@/lib/tables/registry";
import { runTable } from "@/lib/tables/run";
import { listSavedViews } from "../../saved-view-actions";

export const metadata = { title: "Petty cash requests" };

export default async function PettyCashListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requirePermission(["petty_cash.request", "petty_cash.view_all", "readonly.all"]);
  const access = await getAccess();
  const sp = await searchParams;
  const seeAll = can(access, ["petty_cash.view_all", "readonly.all"]);
  const scope = seeAll && sp.scope === "all" ? "all" : "mine";
  const { params, rows, count } = await runTable(pettyCashTable, sp, scope === "mine" ? ((q: { eq: (c: string, v: string) => unknown }) => q.eq("requested_by", me.id)) as never : undefined);
  const views = await listSavedViews(pettyCashTable.key, me.id);

  return (
    <>
      <PageHeader
        title="Petty cash requests"
        description="Up to ₱50,000 is approved by the Operations manager; above that by the CEO. Once approved, accounting releases the cash; then add your receipts to liquidate it."
        actions={can(access, "petty_cash.request") ? <Link href="/requests/petty-cash/new" className={buttonVariants()}>New request</Link> : undefined}
      />
      {seeAll && (
        <div className="mb-3 flex gap-2 text-sm">
          <Link href="?scope=mine" className={scope === "mine" ? "font-semibold text-brand" : "text-muted-foreground underline"}>My requests</Link>
          <span className="text-muted-foreground">·</span>
          <Link href="?scope=all" className={scope === "all" ? "font-semibold text-brand" : "text-muted-foreground underline"}>Everyone&apos;s</Link>
        </div>
      )}
      <DataTable def={pettyCashTable} params={params} rows={rows} count={count} savedViews={views} empty="No petty cash requests yet." />
    </>
  );
}
