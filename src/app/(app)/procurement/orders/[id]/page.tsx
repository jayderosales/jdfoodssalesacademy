import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Attachments } from "@/components/shared/attachments";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addPoLine, createSupplierInvoice, deleteDraftPo, poAction, receivePo, removePoLine, updatePoHeader } from "../../actions";
import { INVOICE_STATUS_LABEL, ItemDatalist, PO_STATUS_HELP, stockLocations, unitOptions } from "../../parts";

export const metadata = { title: "Purchase order" };

interface Po {
  id: string; number: string; status: string; supplier_id: string; location_id: string; order_date: string; expected_date: string | null; vat_inclusive: boolean;
  vat_rate: string; subtotal: string; vat_amount: string; total: string; payment_terms_days: number; notes: string; revision: number; closed_reason: string; created_by: string;
  suppliers: { name: string; code: string; vat_registered: boolean } | null; locations: { name: string } | null;
}

export default async function PoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("purchase_orders").select("*, suppliers(name, code, vat_registered), locations(name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const po = data as unknown as Po;
  const [{ data: lines }, { data: receipts }, { data: invoices }] = await Promise.all([
    supabase.from("purchase_order_lines").select("id, qty, unit_code, unit_price, discount_pct, amount, net_amount, received_qty, invoiced_qty, products(sku, name, track_expiry, shelf_life_days)").eq("po_id", id).order("id"),
    supabase.from("stock_receipts").select("id, number, received_on, reference, status").eq("po_id", id).order("created_at"),
    supabase.from("supplier_invoices").select("id, number, invoice_no, invoice_date, total, status").eq("po_id", id).order("created_at"),
  ]);
  type Line = { id: string; qty: string; unit_code: string; unit_price: string; discount_pct: string; amount: string; net_amount: string; received_qty: string; invoiced_qty: string; products: { sku: string; name: string; track_expiry: boolean; shelf_life_days: number | null } };
  const ls = (lines as unknown as Line[] | null) ?? [];
  const st = po.status;
  const editable = ["draft", "returned"].includes(st) && can(access, "procurement.po.create");
  const canReceive = can(access, "inventory.receive") && ["approved", "sent", "partly_received"].includes(st);
  const canInvoice = can(access, "procurement.invoices.manage") && ["partly_received", "received", "closed"].includes(st) && ls.some((l) => Number(l.received_qty) > Number(l.invoiced_qty));
  const buyer = can(access, "procurement.po.create");
  const [units, locations] = await Promise.all([editable ? unitOptions() : [], editable ? stockLocations() : []]);

  return (
    <>
      <PageHeader
        title={`PO ${po.number}${po.revision ? ` (rev. ${po.revision})` : ""}`}
        description={`${po.suppliers?.name ?? "?"} · deliver to ${po.locations?.name ?? "?"} · ${po.payment_terms_days}-day terms · ${po.vat_inclusive ? "prices include" : "prices exclude"} ${Number(po.vat_rate)}% VAT`}
        actions={<div className="flex items-center gap-2"><Link href={`/procurement/orders/${id}/print`} className="rounded-lg border px-3 py-1.5 text-sm">Print / PDF</Link><StatusBadge status={st} className="text-sm" /></div>}
      />
      <p className="mb-4 rounded-lg bg-muted p-3 text-sm">{PO_STATUS_HELP[st]}{po.closed_reason ? ` Reason: ${po.closed_reason}` : ""}</p>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Price</Th><Th className="text-right">Amount</Th><Th className="text-right">Received</Th><Th className="text-right">Billed</Th>{editable && <Th />}</tr></thead>
              <tbody>
                {ls.map((l) => (
                  <tr key={l.id}>
                    <Td>{l.products.sku}<div className="text-xs text-muted-foreground">{l.products.name}</div></Td>
                    <Td className="text-right tabular-nums">{Number(l.qty).toLocaleString("en-PH")} {l.unit_code}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(l.unit_price)}{Number(l.discount_pct) ? <div className="text-xs">−{Number(l.discount_pct)}%</div> : null}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(l.amount)}</Td>
                    <Td className={`text-right tabular-nums ${Number(l.received_qty) >= Number(l.qty) ? "text-success" : ""}`}>{Number(l.received_qty).toLocaleString("en-PH")}</Td>
                    <Td className="text-right tabular-nums">{Number(l.invoiced_qty).toLocaleString("en-PH")}</Td>
                    {editable && <Td><ActionForm action={removePoLine} submitLabel="Remove" variant="outline" className="flex"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="po_id" value={id} /></ActionForm></Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
            {ls.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No items yet.</p>}
            <div className="mt-3 space-y-0.5 text-right text-sm">
              <p>Net of VAT {formatMoney(po.subtotal)} · VAT {formatMoney(po.vat_amount)}</p>
              <p className="text-lg font-bold">Total {formatMoney(po.total)}</p>
            </div>
            {editable && (
              <div className="mt-4 border-t pt-4">
                <ItemDatalist />
                <ActionForm action={addPoLine} submitLabel="Add item" className="grid gap-2 sm:grid-cols-[1fr_80px_90px_110px_70px_auto] sm:items-end">
                  <input type="hidden" name="po_id" value={id} />
                  <Field label="Item" htmlFor="product"><Input id="product" name="product" list="item-list" required autoComplete="off" /></Field>
                  <Field label="Qty" htmlFor="qty"><Input id="qty" name="qty" type="number" min={0} step="any" required /></Field>
                  <Field label="Unit" htmlFor="unit_code"><Select id="unit_code" name="unit_code" defaultValue=""><option value="">base</option>{units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}</Select></Field>
                  <Field label="Price (blank = list)" htmlFor="unit_price"><Input id="unit_price" name="unit_price" inputMode="decimal" /></Field>
                  <Field label="Disc %" htmlFor="discount_pct"><Input id="discount_pct" name="discount_pct" type="number" min={0} max={100} step="0.01" /></Field>
                </ActionForm>
              </div>
            )}
          </Card>

          {canReceive && (
            <Card>
              <CardTitle>Receive items</CardTitle>
              <p className="mb-3 text-sm text-muted-foreground">Enter what arrived. Lots go to QA quarantine (unless the item skips QA) and stock goes up at {po.locations?.name}.</p>
              <ActionForm action={receivePo} submitLabel="Post receipt" className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <div className="-mx-4 overflow-x-auto sm:mx-0">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="px-2 py-2">Item</th><th className="px-2 py-2">Open</th><th className="px-2 py-2">Received now</th><th className="px-2 py-2">Lot</th><th className="px-2 py-2">Expiry</th></tr></thead>
                    <tbody>
                      {ls.filter((l) => Number(l.received_qty) < Number(l.qty)).map((l) => (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="px-2 py-1">{l.products.sku}<input type="hidden" name="line_id" value={l.id} /></td>
                          <td className="px-2 py-1 tabular-nums">{(Number(l.qty) - Number(l.received_qty)).toLocaleString("en-PH")} {l.unit_code}</td>
                          <td className="px-2 py-1"><Input name={`qty:${l.id}`} type="number" min={0} step="any" className="h-8 w-24" aria-label={`Received ${l.products.sku}`} /></td>
                          <td className="px-2 py-1"><Input name={`lot:${l.id}`} className="h-8 w-28" placeholder={l.products.track_expiry ? "required" : "optional"} aria-label={`Lot ${l.products.sku}`} /></td>
                          <td className="px-2 py-1"><Input name={`exp:${l.id}`} type="date" className="h-8 w-36" aria-label={`Expiry ${l.products.sku}`} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Field label="Supplier delivery receipt (DR) no." htmlFor="reference"><Input id="reference" name="reference" className="max-w-xs" /></Field>
              </ActionForm>
            </Card>
          )}

          {(((receipts as unknown[] | null) ?? []).length > 0 || ((invoices as unknown[] | null) ?? []).length > 0 || canInvoice) && (
            <Card>
              <CardTitle>Receipts and supplier invoices</CardTitle>
              <ul className="mb-3 space-y-1 text-sm">
                {((receipts as { id: string; number: string; received_on: string; reference: string }[] | null) ?? []).map((r) => (
                  <li key={r.id}>Receipt <Link href={`/inventory/receipts/${r.id}`} className="text-brand underline">{r.number}</Link> · {formatDate(r.received_on)}{r.reference ? ` · DR ${r.reference}` : ""}</li>
                ))}
                {((invoices as { id: string; number: string; invoice_no: string; invoice_date: string; total: string; status: string }[] | null) ?? []).map((i) => (
                  <li key={i.id}>Invoice <Link href={`/procurement/invoices/${i.id}`} className="text-brand underline">{i.invoice_no}</Link> · {formatDate(i.invoice_date)} · {formatMoney(i.total)} · {INVOICE_STATUS_LABEL[i.status]}</li>
                ))}
              </ul>
              {canInvoice && (
                <ActionForm action={createSupplierInvoice} submitLabel="Record supplier invoice" className="grid gap-2 border-t pt-3 sm:grid-cols-3 sm:items-end">
                  <input type="hidden" name="po_id" value={id} />
                  <Field label="Supplier's invoice no." htmlFor="invoice_no"><Input id="invoice_no" name="invoice_no" required /></Field>
                  <Field label="Invoice date" htmlFor="invoice_date"><Input id="invoice_date" name="invoice_date" type="date" required /></Field>
                </ActionForm>
              )}
            </Card>
          )}
          {st !== "draft" && <ApprovalTimeline docType="purchase_order" recordId={id} />}
          <Card><CardTitle>Attachments (quotation, signed PO, DR)</CardTitle><Attachments table="purchase_orders" id={id} canAdd={buyer || can(access, "inventory.receive")} userId={me.id} /></Card>
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["purchase_orders"]} recordIds={[id]} /></Card>
        </div>

        <div className="space-y-4">
          {editable && (
            <Card>
              <CardTitle>Details</CardTitle>
              <ActionForm action={updatePoHeader} submitLabel="Save">
                <input type="hidden" name="id" value={id} />
                <Field label="Deliver to" htmlFor="location_id"><Select id="location_id" name="location_id" defaultValue={po.location_id}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
                <Field label="Expected delivery" htmlFor="expected_date"><Input id="expected_date" name="expected_date" type="date" defaultValue={po.expected_date ?? ""} /></Field>
                <Field label="Notes to supplier" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} defaultValue={po.notes} /></Field>
              </ActionForm>
            </Card>
          )}
          {buyer && (
            <Card>
              <CardTitle>Next step</CardTitle>
              <div className="space-y-3 text-sm">
                {editable && (
                  <>
                    <ActionForm action={poAction} submitLabel="Submit for CEO approval"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="submit" /></ActionForm>
                    {st === "draft" && po.revision === 0 && <ActionForm action={deleteDraftPo} submitLabel="Delete draft" variant="outline" confirm="Delete this draft PO?"><input type="hidden" name="id" value={id} /></ActionForm>}
                  </>
                )}
                {st === "approved" && (
                  <ActionForm action={poAction} submitLabel="Mark as sent to supplier"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="sent" /></ActionForm>
                )}
                {["approved", "sent"].includes(st) && ls.every((l) => Number(l.received_qty) === 0) && (
                  <ActionForm action={poAction} submitLabel="Revise (needs new approval)" variant="outline"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="revise" /></ActionForm>
                )}
                {["sent", "partly_received", "received"].includes(st) && (
                  <details className="rounded-lg border p-2"><summary className="cursor-pointer font-medium">Close PO</summary>
                    <ActionForm action={poAction} submitLabel="Close PO" variant="outline"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="close" /><Field label="Reason" htmlFor="close-reason"><Input id="close-reason" name="reason" required placeholder="Rest won't be delivered" /></Field></ActionForm>
                  </details>
                )}
                {["draft", "returned", "submitted", "approved", "sent"].includes(st) && (
                  <details className="rounded-lg border p-2"><summary className="cursor-pointer font-medium">Cancel PO</summary>
                    <ActionForm action={poAction} submitLabel="Cancel PO" variant="danger"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="cancel" /><Field label="Reason" htmlFor="cancel-reason"><Input id="cancel-reason" name="reason" required /></Field></ActionForm>
                  </details>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
