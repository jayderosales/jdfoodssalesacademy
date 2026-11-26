import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { RecordPage } from "@/components/shared/record-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, Card, Input, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { recordCounts, submitCount } from "../../actions";
import { qtyFmt } from "../../doc-parts";
import { OfflineCountHint } from "./offline-hint";

export const metadata = { title: "Cycle count" };

export default async function CountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "count" } = await searchParams;
  await requirePermission("inventory.view");
  const access = await getAccess();
  const supabase = await createClient();
  const [{ data }, { data: lines }] = await Promise.all([
    supabase.from("stock_counts").select("*, locations(name)").eq("id", id).maybeSingle(),
    supabase.from("stock_count_lines").select("id, expected_qty, counted_qty, unit_cost, products(sku, name, base_unit), batches(lot_no, expiry_date), bins(code)").eq("count_id", id),
  ]);
  if (!data) notFound();
  const c = data as { id: string; number: string; status: string; scope_label: string; blind: boolean; snapshot_at: string; total_variance_value: string; locations: { name: string } | null };
  type L = { id: string; expected_qty: string; counted_qty: string | null; unit_cost: string; products: { sku: string; name: string; base_unit: string } | null; batches: { lot_no: string; expiry_date: string | null } | null; bins: { code: string } | null };
  const rows = ((lines as unknown as L[] | null) ?? []).sort((a, b) => (a.bins?.code ?? "").localeCompare(b.bins?.code ?? "") || (a.products?.sku ?? "").localeCompare(b.products?.sku ?? ""));
  const counting = ["counting", "returned"].includes(c.status) && can(access, "inventory.count");
  const showExpected = !c.blind || !counting;
  const done = rows.filter((l) => l.counted_qty != null).length;
  const seeCost = can(access, "inventory.view_cost");
  const { count: moved } = await supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("location_id", (data as { location_id: string }).location_id).gt("created_at", c.snapshot_at).neq("doc_id", c.id);

  return (
    <RecordPage
      backHref="/inventory/counts"
      backLabel="Cycle counts"
      title={c.number}
      status={<StatusBadge status={c.status === "posted" ? "approved" : c.status === "counting" ? "draft" : c.status} />}
      subtitle={`${c.scope_label} at ${c.locations?.name} · ${done}/${rows.length} counted · snapshot ${formatDate(c.snapshot_at, true)}${Number(c.total_variance_value) ? ` · variance ${formatMoney(c.total_variance_value)}` : ""}`}
      tabs={[{ key: "count", label: "Count sheet", count: rows.length }, { key: "approvals", label: "Approvals" }, { key: "history", label: "History" }]}
      activeTab={tab}
      actions={
        counting && done === rows.length ? (
          <ActionForm action={submitCount} submitLabel="Submit count" className="flex flex-col gap-2" confirm="Submit the count? Differences go for approval.">
            <input type="hidden" name="id" value={c.id} />
          </ActionForm>
        ) : undefined
      }
    >
      {counting && !!moved && (
        <div className="mb-4">
          <Alert tone="danger">{moved} stock movement(s) happened at this location after the count sheet was made. Recount the affected items, or start a new count.</Alert>
        </div>
      )}
      {tab === "count" && (
        <Card>
          {counting && <OfflineCountHint countId={c.id} />}
          <ActionForm action={recordCounts} submitLabel="Save counts" className="space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <Table>
              <thead>
                <tr>
                  <Th>Bin</Th><Th>Product</Th><Th>Lot</Th>
                  {showExpected && <Th className="text-right">System</Th>}
                  <Th className="text-right">Counted</Th>
                  {showExpected && <Th className="text-right">Difference</Th>}
                  {showExpected && seeCost && <Th className="text-right">Value</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const diff = l.counted_qty != null ? Number(l.counted_qty) - Number(l.expected_qty) : null;
                  return (
                    <tr key={l.id} className={diff ? "bg-danger/5" : ""}>
                      <Td>{l.bins?.code}</Td>
                      <Td>{l.products?.sku}<div className="text-xs text-muted-foreground">{l.products?.name}</div></Td>
                      <Td className="font-mono text-xs">{l.batches?.lot_no}</Td>
                      {showExpected && <Td className="text-right tabular-nums">{qtyFmt(l.expected_qty)}</Td>}
                      <Td className="text-right">
                        {counting ? (
                          <Input name={`count:${l.id}`} type="number" inputMode="decimal" min={0} step="any" defaultValue={l.counted_qty ?? ""} className="ml-auto w-24 text-right" aria-label={`Count for ${l.products?.sku} lot ${l.batches?.lot_no}`} />
                        ) : (
                          <span className="tabular-nums">{l.counted_qty != null ? qtyFmt(l.counted_qty) : "—"}</span>
                        )}
                      </Td>
                      {showExpected && <Td className={`text-right tabular-nums ${diff ? "font-semibold text-danger" : ""}`}>{diff == null ? "—" : diff > 0 ? `+${qtyFmt(diff)}` : qtyFmt(diff)}</Td>}
                      {showExpected && seeCost && <Td className="text-right tabular-nums">{diff ? formatMoney((diff * Number(l.unit_cost)).toFixed(2)) : "—"}</Td>}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {!counting && <p className="text-xs text-muted-foreground">This count is closed.</p>}
          </ActionForm>
        </Card>
      )}
      {tab === "approvals" && <ApprovalTimeline docType="stock_count" recordId={c.id} />}
      {tab === "history" && <RecordHistory tables={["stock_counts", "stock_count_lines"]} recordIds={[c.id, ...rows.map((l) => l.id)]} />}
    </RecordPage>
  );
}
