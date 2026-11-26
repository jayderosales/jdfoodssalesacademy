import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addRequestLine, cancelDraftRequest, declineRequest, orderRequestLines, removeRequestLine, submitRequest } from "../../actions";
import { ItemDatalist, stockLocations, supplierOptions, unitOptions } from "../../parts";

export const metadata = { title: "Purchase request" };

const LABEL: Record<string, string> = { draft: "draft", submitted: "pending", ordered: "approved", declined: "rejected", cancelled: "cancelled" };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("purchase_requests").select("*, locations(name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as { id: string; number: string; status: string; requested_by: string; location_id: string; needed_by: string | null; reason: string; decline_reason: string; locations: { name: string } | null };
  const { data: lines } = await supabase.from("purchase_request_lines").select("id, qty, unit_code, notes, po_line_id, products(sku, name), purchase_order_lines(po_id, purchase_orders(number))").eq("request_id", id);
  const ls = (lines as unknown as { id: string; qty: string; unit_code: string; notes: string; po_line_id: string | null; products: { sku: string; name: string }; purchase_order_lines: { po_id: string; purchase_orders: { number: string } } | null }[] | null) ?? [];
  const mineDraft = r.requested_by === me.id && r.status === "draft";
  const buyer = can(access, "procurement.po.create") && r.status === "submitted";
  const [units, suppliers, locations] = await Promise.all([mineDraft ? unitOptions() : [], buyer ? supplierOptions(true) : [], buyer ? stockLocations() : []]);
  const open = ls.filter((l) => !l.po_line_id);

  return (
    <>
      <PageHeader title={`Request ${r.number}`} description={`For ${r.locations?.name ?? "?"}${r.needed_by ? ` · needed by ${formatDate(r.needed_by)}` : ""}${r.reason ? ` · ${r.reason}` : ""}`} actions={<StatusBadge status={LABEL[r.status] ?? r.status} className="text-sm" />} />
      {r.status === "declined" && <p className="mb-4 rounded-lg bg-muted p-3 text-sm">Declined: {r.decline_reason}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            {buyer && open.length > 0 ? (
              <ActionForm action={orderRequestLines} submitLabel="Create purchase order" className="space-y-3">
                <Table>
                  <thead><tr><Th>Order</Th><Th>Item</Th><Th className="text-right">Qty</Th><Th>Notes</Th></tr></thead>
                  <tbody>
                    {ls.map((l) => (
                      <tr key={l.id}>
                        <Td>{l.po_line_id ? <Link href={`/procurement/orders/${l.purchase_order_lines?.po_id}`} className="text-xs text-brand underline">{l.purchase_order_lines?.purchase_orders.number}</Link> : <input type="checkbox" name="line" value={l.id} defaultChecked aria-label={`Order ${l.products.sku}`} />}</Td>
                        <Td>{l.products.sku}<div className="text-xs text-muted-foreground">{l.products.name}</div></Td>
                        <Td className="text-right">{Number(l.qty)} {l.unit_code}</Td>
                        <Td>{l.notes}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Supplier (approved only)" htmlFor="supplier_id">
                    <Select id="supplier_id" name="supplier_id" required defaultValue="">
                      <option value="" disabled>Choose a supplier</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Deliver to" htmlFor="location_id">
                    <Select id="location_id" name="location_id" defaultValue={r.location_id}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">Prices come from the supplier&apos;s price list; you can adjust them on the PO before submitting.</p>
              </ActionForm>
            ) : (
              <Table>
                <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th>Notes</Th><Th>Ordered on</Th>{mineDraft && <Th />}</tr></thead>
                <tbody>
                  {ls.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.products.sku}<div className="text-xs text-muted-foreground">{l.products.name}</div></Td>
                      <Td className="text-right">{Number(l.qty)} {l.unit_code}</Td>
                      <Td>{l.notes}</Td>
                      <Td>{l.purchase_order_lines ? <Link href={`/procurement/orders/${l.purchase_order_lines.po_id}`} className="text-brand underline">{l.purchase_order_lines.purchase_orders.number}</Link> : "—"}</Td>
                      {mineDraft && (
                        <Td><ActionForm action={removeRequestLine} submitLabel="Remove" variant="outline" className="flex"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="request_id" value={id} /></ActionForm></Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {ls.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No items yet.</p>}
            {mineDraft && (
              <div className="mt-4 border-t pt-4">
                <ItemDatalist />
                <ActionForm action={addRequestLine} submitLabel="Add item" className="grid gap-2 sm:grid-cols-[1fr_90px_100px_1fr_auto] sm:items-end">
                  <input type="hidden" name="request_id" value={id} />
                  <Field label="Item" htmlFor="product"><Input id="product" name="product" list="item-list" required autoComplete="off" /></Field>
                  <Field label="Qty" htmlFor="qty"><Input id="qty" name="qty" type="number" min={0} step="any" required /></Field>
                  <Field label="Unit" htmlFor="unit_code">
                    <Select id="unit_code" name="unit_code" defaultValue=""><option value="">base unit</option>{units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}</Select>
                  </Field>
                  <Field label="Notes" htmlFor="notes"><Input id="notes" name="notes" placeholder="Brand, spec…" /></Field>
                </ActionForm>
              </div>
            )}
          </Card>
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["purchase_requests"]} recordIds={[id]} /></Card>
        </div>
        <div className="space-y-4">
          {mineDraft && (
            <Card>
              <CardTitle>Send to the buyer</CardTitle>
              <ActionForm action={submitRequest} submitLabel="Submit request"><input type="hidden" name="id" value={id} /></ActionForm>
              <div className="mt-3"><ActionForm action={cancelDraftRequest} submitLabel="Cancel request" variant="outline" confirm="Cancel this request?"><input type="hidden" name="id" value={id} /></ActionForm></div>
            </Card>
          )}
          {buyer && (
            <Card>
              <CardTitle>Decline</CardTitle>
              <ActionForm action={declineRequest} submitLabel="Decline request" variant="outline">
                <input type="hidden" name="id" value={id} />
                <Field label="Reason" htmlFor="reason"><Input id="reason" name="reason" required placeholder="e.g. We still have stock" /></Field>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
