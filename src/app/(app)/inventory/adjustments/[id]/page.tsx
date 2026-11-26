import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Attachments } from "@/components/shared/attachments";
import { RecordPage } from "@/components/shared/record-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { addAdjustmentLine, cancelAdjustment, removeAdjustmentLine, submitAdjustment } from "../../actions";
import { qtyFmt, StockLineSelect } from "../../doc-parts";
import { REASONS } from "../reasons";

export const metadata = { title: "Adjustment" };

export default async function AdjustmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "lines" } = await searchParams;
  const me = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const [{ data }, { data: lines }] = await Promise.all([
    supabase.from("stock_adjustments").select("*, locations(name)").eq("id", id).maybeSingle(),
    supabase.from("stock_adjustment_lines").select("id, qty, reason, unit_cost, products(sku, name, base_unit), batches(lot_no)").eq("adjustment_id", id),
  ]);
  if (!data) notFound();
  const a = data as { id: string; number: string; status: string; reason_type: string; location_id: string; notes: string; total_value: string; locations: { name: string } | null };
  const rows = (lines as unknown as { id: string; qty: string; reason: string; unit_cost: string | null; products: { sku: string; name: string; base_unit: string } | null; batches: { lot_no: string } | null }[] | null) ?? [];
  const canReq = can(access, "inventory.adjust.request");
  const editable = canReq && ["draft", "returned"].includes(a.status);
  const outOnly = ["damage", "disposal", "sample", "internal_use"].includes(a.reason_type);

  return (
    <RecordPage
      backHref="/inventory/adjustments"
      backLabel="Adjustments"
      title={a.number}
      status={<StatusBadge status={a.status === "posted" ? "approved" : a.status} />}
      subtitle={`${REASONS[a.reason_type]} at ${a.locations?.name}${Number(a.total_value) ? ` · ${formatMoney(a.total_value)}` : ""}${a.notes ? ` · ${a.notes}` : ""}`}
      tabs={[{ key: "lines", label: "Lines", count: rows.length }, { key: "approvals", label: "Approvals" }, { key: "history", label: "History" }]}
      activeTab={tab}
      actions={
        editable ? (
          <>
            {rows.length > 0 && (
              <ActionForm action={submitAdjustment} submitLabel={a.status === "returned" ? "Resubmit for approval" : "Send for approval"} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={a.id} />
              </ActionForm>
            )}
            <ActionForm action={cancelAdjustment} submitLabel="Cancel" variant="outline" className="flex flex-col gap-2" confirm="Cancel this adjustment?">
              <input type="hidden" name="id" value={a.id} />
            </ActionForm>
          </>
        ) : undefined
      }
    >
      {tab === "lines" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <Table>
                <thead><tr><Th>Product</Th><Th>Lot</Th><Th className="text-right">Qty</Th><Th>Note</Th>{editable && <Th />}</tr></thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.products?.sku}<div className="text-xs text-muted-foreground">{l.products?.name}</div></Td>
                      <Td className="font-mono text-xs">{l.batches?.lot_no}</Td>
                      <Td className={`text-right tabular-nums ${Number(l.qty) < 0 ? "text-danger" : "text-success"}`}>{Number(l.qty) > 0 ? "+" : ""}{qtyFmt(l.qty)} {l.products?.base_unit}</Td>
                      <Td className="text-sm">{l.reason || "—"}</Td>
                      {editable && (
                        <Td>
                          <ActionForm action={removeAdjustmentLine} submitLabel="Remove" variant="outline" className="flex">
                            <input type="hidden" name="line_id" value={l.id} />
                            <input type="hidden" name="adjustment_id" value={a.id} />
                          </ActionForm>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
              {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No lines yet.</p>}
            </Card>
            {editable && (
              <Card>
                <CardTitle>Add a line</CardTitle>
                <ActionForm action={addAdjustmentLine} submitLabel="Add line">
                  <input type="hidden" name="adjustment_id" value={a.id} />
                  <Field label="Item" htmlFor="stock"><StockLineSelect locationId={a.location_id} /></Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Quantity" htmlFor="qty"><Input id="qty" name="qty" type="number" min={0.0001} step="any" required /></Field>
                    <Field label="Direction" htmlFor="direction">
                      <Select id="direction" name="direction" defaultValue={a.reason_type === "found" ? "in" : "out"} disabled={outOnly || a.reason_type === "found"}>
                        <option value="out">Remove from stock</option>
                        <option value="in">Add to stock</option>
                      </Select>
                      {(outOnly || a.reason_type === "found") && <input type="hidden" name="direction" value={a.reason_type === "found" ? "in" : "out"} />}
                    </Field>
                    <Field label="Note" htmlFor="reason"><Input id="reason" name="reason" placeholder="e.g. Broken during loading" /></Field>
                  </div>
                </ActionForm>
                <p className="mt-2 text-xs text-muted-foreground">To add stock that isn&apos;t in the list yet (new lot), use Receipts instead.</p>
              </Card>
            )}
          </div>
          <Attachments table="stock_adjustments" id={a.id} canAdd={canReq && ["draft", "returned", "submitted"].includes(a.status)} userId={me.id} />
        </div>
      )}
      {tab === "approvals" && <ApprovalTimeline docType="stock_adjustment" recordId={a.id} />}
      {tab === "history" && <RecordHistory tables={["stock_adjustments", "stock_adjustment_lines"]} recordIds={[a.id, ...rows.map((l) => l.id)]} />}
    </RecordPage>
  );
}
