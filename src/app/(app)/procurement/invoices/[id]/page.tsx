import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Attachments } from "@/components/shared/attachments";
import { ScanOriginal } from "@/components/shared/scan-original";
import { Card, CardTitle, Field, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addInvoiceExtraLine, invoiceAction, removeInvoiceLine, updateInvoiceLine } from "../../actions";
import { INVOICE_STATUS_LABEL } from "../../parts";

export const metadata = { title: "Supplier invoice" };

const MATCH: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "text-success" },
  qty: { label: "More than received", cls: "text-danger" },
  price: { label: "Price differs", cls: "text-danger" },
  not_on_po: { label: "Not on PO", cls: "text-amber-700" },
  "": { label: "—", cls: "text-muted-foreground" },
};

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("supplier_invoices").select("*, suppliers(name), purchase_orders(id, number, vat_inclusive, vat_rate)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const inv = data as unknown as { id: string; number: string; invoice_no: string; invoice_date: string; due_date: string | null; subtotal: string; vat_amount: string; total: string; status: string; match_note: string; notes: string; suppliers: { name: string } | null; purchase_orders: { id: string; number: string; vat_inclusive: boolean; vat_rate: string } | null };
  const { data: lines } = await supabase.from("supplier_invoice_lines").select("id, qty, unit_price, amount, match_status, description, po_line_id, purchase_order_lines(qty, unit_price, received_qty, invoiced_qty, unit_code), products(sku, name)").eq("invoice_id", id).order("id");
  type Line = { id: string; qty: string; unit_price: string; amount: string; match_status: string; description: string; po_line_id: string | null; purchase_order_lines: { qty: string; unit_price: string; received_qty: string; invoiced_qty: string; unit_code: string } | null; products: { sku: string; name: string } | null };
  const ls = (lines as unknown as Line[] | null) ?? [];
  const editable = can(access, "procurement.invoices.manage") && ["draft", "variance", "returned"].includes(inv.status);
  const linesTotal = ls.reduce((s, l) => s + Number(l.amount), 0);

  return (
    <>
      <PageHeader title={`Supplier invoice ${inv.invoice_no}`} description={`${inv.suppliers?.name ?? "?"} · ${inv.number} · dated ${formatDate(inv.invoice_date)} · due ${formatDate(inv.due_date)}`} actions={<span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{INVOICE_STATUS_LABEL[inv.status]}</span>} />
      {inv.match_note && <p className={`mb-4 rounded-lg p-3 text-sm ${["approved", "matched"].includes(inv.status) ? "bg-muted" : "bg-amber-50 text-amber-900"}`}>Match notes: {inv.match_note}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <p className="mb-2 text-sm">PO {inv.purchase_orders ? <Link href={`/procurement/orders/${inv.purchase_orders.id}`} className="text-brand underline">{inv.purchase_orders.number}</Link> : "—"} · amounts {inv.purchase_orders?.vat_inclusive ? "include" : "exclude"} VAT, same as the PO.</p>
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">PO price</Th><Th className="text-right">Received / billed before</Th><Th className="text-right">Billed qty</Th><Th className="text-right">Billed price</Th><Th className="text-right">Amount</Th><Th>Match</Th></tr></thead>
              <tbody>
                {ls.map((l) => (
                  <tr key={l.id}>
                    <Td>{l.products?.sku ?? l.description}<div className="text-xs text-muted-foreground">{l.products?.name}</div></Td>
                    <Td className="text-right tabular-nums">{l.purchase_order_lines ? formatMoney(l.purchase_order_lines.unit_price) : "—"}</Td>
                    <Td className="text-right tabular-nums">{l.purchase_order_lines ? `${Number(l.purchase_order_lines.received_qty)} / ${Number(l.purchase_order_lines.invoiced_qty)} ${l.purchase_order_lines.unit_code}` : "—"}</Td>
                    {editable ? (
                      <Td colSpan={2}>
                        <ActionForm action={updateInvoiceLine} submitLabel="Update" variant="outline" className="flex items-center justify-end gap-1">
                          <input type="hidden" name="id" value={l.id} /><input type="hidden" name="invoice_id" value={id} />
                          <Input name="qty" defaultValue={Number(l.qty)} className="h-8 w-20" aria-label="Billed quantity" />
                          <Input name="unit_price" defaultValue={Number(l.unit_price)} className="h-8 w-24" aria-label="Billed price" />
                        </ActionForm>
                      </Td>
                    ) : (
                      <><Td className="text-right tabular-nums">{Number(l.qty)}</Td><Td className="text-right tabular-nums">{formatMoney(l.unit_price)}</Td></>
                    )}
                    <Td className="text-right tabular-nums">{formatMoney(l.amount)}</Td>
                    <Td className={MATCH[l.match_status]?.cls}>
                      {MATCH[l.match_status]?.label}
                      {editable && <ActionForm action={removeInvoiceLine} submitLabel="Remove" variant="outline" className="mt-1 flex"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="invoice_id" value={id} /></ActionForm>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {ls.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No lines. Nothing received on the PO is waiting to be billed.</p>}
            <div className="mt-3 text-right text-sm">
              {inv.status === "draft" ? <p className="text-lg font-bold">Lines total {formatMoney(linesTotal.toFixed(2))}</p> : (
                <><p>Net {formatMoney(inv.subtotal)} · VAT {formatMoney(inv.vat_amount)}</p><p className="text-lg font-bold">Total {formatMoney(inv.total)}</p></>
              )}
            </div>
            {editable && (
              <details className="mt-3 border-t pt-3">
                <summary className="cursor-pointer text-sm font-medium">Add a charge that isn&apos;t on the PO (e.g. delivery fee)</summary>
                <ActionForm action={addInvoiceExtraLine} submitLabel="Add charge" className="mt-2 grid gap-2 sm:grid-cols-[1fr_80px_110px_auto] sm:items-end">
                  <input type="hidden" name="invoice_id" value={id} />
                  <Field label="Description" htmlFor="description"><Input id="description" name="description" required /></Field>
                  <Field label="Qty" htmlFor="qty"><Input id="qty" name="qty" type="number" min={0} step="any" defaultValue={1} required /></Field>
                  <Field label="Price" htmlFor="unit_price"><Input id="unit_price" name="unit_price" inputMode="decimal" required /></Field>
                </ActionForm>
                <p className="mt-1 text-xs text-muted-foreground">Charges not on the PO always need the CEO&apos;s approval as a variance.</p>
              </details>
            )}
          </Card>
          {["submitted", "approved", "rejected", "returned"].includes(inv.status) && <ApprovalTimeline docType="supplier_invoice" recordId={id} />}
          <Card><CardTitle>Invoice copy</CardTitle><Attachments table="supplier_invoices" id={id} canAdd={can(access, "procurement.invoices.manage")} userId={me.id} /></Card>
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["supplier_invoices"]} recordIds={[id]} /></Card>
        </div>
        <div className="space-y-4">
          <ScanOriginal table="supplier_invoices" id={id} />
          {can(access, "procurement.invoices.manage") && (
            <Card>
              <CardTitle>Next step</CardTitle>
              <div className="space-y-3 text-sm">
                {editable && (
                  <>
                    <p className="text-muted-foreground">Check the quantities and prices against the paper invoice, then match.</p>
                    <ActionForm action={invoiceAction} submitLabel="Match to PO and receipts"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="match" /></ActionForm>
                  </>
                )}
                {inv.status === "variance" && (
                  <ActionForm action={invoiceAction} submitLabel="Send variance to CEO" variant="outline"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="variance" /></ActionForm>
                )}
                {["matched", "approved"].includes(inv.status) && <p className="text-success">Ready to pay. Accounting pays it from <Link href="/accounting/payables" className="underline">Payables</Link>.</p>}
                {inv.status === "submitted" && <p>Waiting for the CEO to accept the variance.</p>}
                {!["submitted", "void"].includes(inv.status) && (
                  <details className="rounded-lg border p-2"><summary className="cursor-pointer font-medium">Void invoice</summary>
                    <ActionForm action={invoiceAction} submitLabel="Void" variant="danger"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="void" /><Field label="Reason" htmlFor="void-reason"><Input id="void-reason" name="reason" required /></Field></ActionForm>
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
