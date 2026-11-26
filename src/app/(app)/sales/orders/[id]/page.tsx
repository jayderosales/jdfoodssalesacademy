import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addOrderLine, cancelOrder, deleteDraftOrder, fulfilAction, placeOrder, recordPayment, removeOrderLine } from "../../actions";
import { CHANNEL_LABEL, METHOD_LABEL, SellableDatalist } from "../../parts";

export const metadata = { title: "Sales order" };

interface Order {
  id: string; number: string; status: string; channel: string; payment_mode: string; terms_days: number; total: string; subtotal: string;
  discount_total: string; paid_amount: string; placed_at: string | null; created_at: string; ready_at: string | null; due_date: string | null;
  cancel_reason: string; courier_note: string; notes: string; customer_id: string; location_id: string; created_by: string | null;
  ship_to: { recipient?: string; phone?: string; email?: string; line?: string; city?: string; province?: string; zip?: string };
  customers: { name: string; code: string; mobile: string } | null; locations: { name: string } | null;
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const { data: o } = await supabase.from("sales_orders").select("*, customers(name, code, mobile), locations(name)").eq("id", id).maybeSingle();
  if (!o) notFound();
  const order = o as unknown as Order;
  const [{ data: lines }, { data: pays }, { data: allocs }, { data: ships }, { data: inv }, { data: pickups }] = await Promise.all([
    supabase.from("sales_order_lines").select("id, qty, list_price, unit_price, discount_pct, line_total, price_source, products(sku, name, base_unit)").eq("order_id", id).order("id"),
    supabase.from("payments").select("id, number, method, amount, reference, status, paid_on, from_customer, reject_reason").eq("order_id", id).order("created_at"),
    supabase.from("sales_order_allocations").select("id, qty, movement_id, products(sku, name), batches(lot_no, expiry_date), bins(code)").eq("order_id", id),
    supabase.from("shipments").select("courier, tracking_no, fee_info, dispatched_at, delivered_at, pod_note, locations(name)").eq("order_id", id).order("created_at"),
    supabase.from("billing_invoices").select("id, number, issued_on, due_on, status, total, si_issuances(series, si_no, status)").eq("order_id", id).maybeSingle(),
    supabase.from("locations").select("id, name").eq("is_pickup_point", true).eq("active", true),
  ]);
  type Line = { id: string; qty: string; list_price: string; unit_price: string; discount_pct: string; line_total: string; price_source: string; products: { sku: string; name: string; base_unit: string } };
  const ls = (lines as unknown as Line[] | null) ?? [];
  const ps = (pays as { id: string; number: string; method: string; amount: string; reference: string; status: string; paid_on: string; from_customer: boolean; reject_reason: string }[] | null) ?? [];
  const al = (allocs as unknown as { id: string; qty: string; movement_id: number | null; products: { sku: string; name: string }; batches: { lot_no: string; expiry_date: string | null }; bins: { code: string } }[] | null) ?? [];
  const sh = (ships as unknown as { courier: string; tracking_no: string; fee_info: string | null; dispatched_at: string; delivered_at: string | null; pod_note: string; locations: { name: string } | null }[] | null) ?? [];
  const invoice = inv as unknown as { id: string; number: string; issued_on: string; due_on: string | null; status: string; total: string; si_issuances: { series: string; si_no: number; status: string }[] } | null;

  const st = order.status;
  const draft = st === "draft";
  const canEdit = draft && can(access, "sales.orders.create") && (order.created_by === me.id || can(access, "sales.view_all"));
  const canFulfil = can(access, "sales.fulfil");
  const canPay = can(access, "sales.payments.record") || can(access, "sales.payments.confirm");
  const cancellable = ["draft", "awaiting_payment", "confirmed", "packing", "credit_review"].includes(st) && Number(order.paid_amount) === 0;
  const balance = Math.max(0, Number(order.total) - Number(order.paid_amount));
  const addr = [order.ship_to.line, order.ship_to.city, order.ship_to.province, order.ship_to.zip].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader
        title={`Order ${order.number}`}
        description={`${CHANNEL_LABEL[order.channel] ?? order.channel} · ${order.payment_mode === "terms" ? `on ${order.terms_days}-day terms` : "pay before release"} · ships from ${order.locations?.name ?? "?"}`}
        actions={<StatusBadge status={st} className="text-sm" />}
      />
      {st === "cancelled" || st === "returned" ? <p className="mb-4 rounded-lg bg-muted p-3 text-sm">Reason: {order.cancel_reason || "—"}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="mb-3 flex flex-wrap justify-between gap-2">
              <div>
                <Link href={`/sales/customers/${order.customer_id}`} className="text-lg font-semibold text-brand underline">{order.customers?.name}</Link>
                <p className="text-sm text-muted-foreground">{order.customers?.code} · {order.ship_to.phone || order.customers?.mobile}</p>
                {addr && <p className="text-sm">{order.ship_to.recipient} · {addr}</p>}
                {order.courier_note && <p className="text-sm text-muted-foreground">Courier: {order.courier_note}</p>}
                {order.notes && <p className="text-sm text-muted-foreground">Note: {order.notes}</p>}
              </div>
              <div className="text-right text-sm">
                <p>Placed {formatDate(order.placed_at, true)}</p>
                {order.due_date && <p className={new Date(order.due_date) < new Date() && balance > 0 ? "font-semibold text-danger" : ""}>Due {formatDate(order.due_date)}</p>}
              </div>
            </div>
            <Table>
              <thead><tr><Th>Product</Th><Th className="text-right">Qty</Th><Th className="text-right">Price</Th><Th className="text-right">Disc.</Th><Th className="text-right">Total</Th>{canEdit && <Th />}</tr></thead>
              <tbody>
                {ls.map((l) => (
                  <tr key={l.id}>
                    <Td>{l.products.sku}<div className="text-xs text-muted-foreground">{l.products.name}</div></Td>
                    <Td className="text-right tabular-nums">{Number(l.qty).toLocaleString("en-PH")} {l.products.base_unit}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(l.unit_price)}<div className="text-xs text-muted-foreground">{l.price_source}{l.price_source === "manual" ? ` (list ${formatMoney(l.list_price)})` : ""}</div></Td>
                    <Td className="text-right tabular-nums">{Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : "—"}</Td>
                    <Td className="text-right font-medium tabular-nums">{formatMoney(l.line_total)}</Td>
                    {canEdit && (
                      <Td>
                        <ActionForm action={removeOrderLine} submitLabel="Remove" variant="outline" className="flex">
                          <input type="hidden" name="id" value={l.id} /><input type="hidden" name="order_id" value={id} />
                        </ActionForm>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
            {ls.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No products yet.</p>}
            <div className="mt-3 space-y-1 text-right text-sm">
              {Number(order.discount_total) > 0 && <p>Subtotal {formatMoney(order.subtotal)} · discount −{formatMoney(order.discount_total)}</p>}
              <p className="text-lg font-bold">Total {formatMoney(order.total)}</p>
              <p className={balance > 0 ? "text-amber-700" : "text-success"}>Paid {formatMoney(order.paid_amount)}{balance > 0 ? ` · balance ${formatMoney(balance.toFixed(2))}` : " · fully paid"}</p>
            </div>
            {canEdit && (
              <div className="mt-4 border-t pt-4">
                <SellableDatalist />
                <ActionForm action={addOrderLine} submitLabel="Add product" className="grid gap-2 sm:grid-cols-[1fr_90px_110px_80px_auto] sm:items-end">
                  <input type="hidden" name="order_id" value={id} />
                  <Field label="Product" htmlFor="product"><Input id="product" name="product" list="sell-list" required autoComplete="off" placeholder="Type SKU or name" /></Field>
                  <Field label="Qty" htmlFor="qty"><Input id="qty" name="qty" type="number" min={1} step="any" defaultValue={1} required /></Field>
                  {can(access, "sales.orders.discount") ? (
                    <>
                      <Field label="Price (blank = list)" htmlFor="unit_price"><Input id="unit_price" name="unit_price" inputMode="decimal" /></Field>
                      <Field label="Disc. %" htmlFor="discount_pct"><Input id="discount_pct" name="discount_pct" type="number" min={0} max={100} step="0.01" /></Field>
                    </>
                  ) : (
                    <><span className="hidden sm:block" /><span className="hidden sm:block" /></>
                  )}
                </ActionForm>
              </div>
            )}
          </Card>

          {al.length > 0 && (
            <Card>
              <CardTitle>Pick list (earliest expiry first)</CardTitle>
              <Table>
                <thead><tr><Th>Product</Th><Th>Lot</Th><Th>Bin</Th><Th>Expiry</Th><Th className="text-right">Qty</Th><Th>Stock</Th></tr></thead>
                <tbody>
                  {al.map((a) => (
                    <tr key={a.id}>
                      <Td>{a.products.sku}<div className="text-xs text-muted-foreground">{a.products.name}</div></Td>
                      <Td className="font-mono text-xs">{a.batches.lot_no}</Td>
                      <Td>{a.bins.code}</Td>
                      <Td>{formatDate(a.batches.expiry_date)}</Td>
                      <Td className="text-right tabular-nums">{Number(a.qty).toLocaleString("en-PH")}</Td>
                      <Td>{a.movement_id ? <span className="text-success">deducted</span> : <span className="text-amber-700">reserved</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          <Card>
            <CardTitle>Payments</CardTitle>
            {ps.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : (
              <ul className="divide-y text-sm">
                {ps.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>{p.number} · {METHOD_LABEL[p.method] ?? p.method}{p.reference ? ` · ref ${p.reference}` : ""}{p.from_customer ? " · sent by customer" : ""} · {formatDate(p.paid_on)}</span>
                    <span className="flex items-center gap-2"><b className="tabular-nums">{formatMoney(p.amount)}</b><StatusBadge status={p.status === "confirmed" ? "approved" : p.status} /></span>
                    {p.reject_reason && <span className="w-full text-xs text-danger">Rejected: {p.reject_reason}</span>}
                  </li>
                ))}
              </ul>
            )}
            {canPay && !draft && st !== "cancelled" && balance > 0 && (
              <ActionForm action={recordPayment} submitLabel="Record payment" className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-4 sm:items-end">
                <input type="hidden" name="customer_id" value={order.customer_id} /><input type="hidden" name="order_id" value={id} />
                <Field label="Method" htmlFor="method">
                  <Select id="method" name="method" defaultValue="bank_transfer">
                    {Object.entries(METHOD_LABEL).filter(([k]) => k !== "paymongo").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Amount" htmlFor="amount"><Input id="amount" name="amount" inputMode="decimal" defaultValue={balance.toFixed(2)} required /></Field>
                <Field label="Reference" htmlFor="reference"><Input id="reference" name="reference" placeholder="Bank / GCash ref" /></Field>
                <Field label="Date paid" htmlFor="paid_on"><Input id="paid_on" name="paid_on" type="date" /></Field>
              </ActionForm>
            )}
          </Card>

          {(sh.length > 0 || invoice) && (
            <Card>
              <CardTitle>Delivery and invoice</CardTitle>
              {sh.map((s, i) => (
                <p key={i} className="text-sm">
                  {s.courier}{s.tracking_no ? ` · tracking ${s.tracking_no}` : ""}{s.fee_info ? ` · fee ₱${Number(s.fee_info).toLocaleString("en-PH")} (paid by customer)` : ""} · handed over {formatDate(s.dispatched_at, true)}
                  {s.locations?.name ? ` at ${s.locations.name}` : ""}{s.delivered_at ? ` · delivered ${formatDate(s.delivered_at, true)}` : ""}{s.pod_note ? ` · ${s.pod_note}` : ""}
                </p>
              ))}
              {invoice && (
                <p className="mt-2 text-sm">
                  Billing invoice <b>{invoice.number}</b> ({formatDate(invoice.issued_on)}{invoice.due_on ? `, due ${formatDate(invoice.due_on)}` : ""}) <StatusBadge status={invoice.status} />
                  {" · "}Official SI: {invoice.si_issuances.filter((s) => s.status === "issued").map((s) => `${s.series}${s.si_no}`).join(", ") || <Link href="/sales/invoices" className="text-amber-700 underline">not recorded yet</Link>}
                </p>
              )}
            </Card>
          )}
          {st === "credit_review" || ["confirmed", "cancelled"].includes(st) ? <ApprovalTimeline docType="sales_order_credit" recordId={id} /> : null}
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["sales_orders"]} recordIds={[id]} /></Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Next step</CardTitle>
            <div className="space-y-3 text-sm">
              {draft && canEdit && (
                <>
                  <p className="text-muted-foreground">Add the products, then place the order. Placing reserves the stock.</p>
                  <ActionForm action={placeOrder} submitLabel="Place order"><input type="hidden" name="id" value={id} /></ActionForm>
                  <ActionForm action={deleteDraftOrder} submitLabel="Delete draft" variant="outline" confirm="Delete this draft order?"><input type="hidden" name="id" value={id} /></ActionForm>
                </>
              )}
              {st === "credit_review" && <p>Waiting for the CEO to approve the credit release (over limit, overdue or on hold).</p>}
              {st === "awaiting_payment" && <p>Waiting for payment. Once finance confirms it, the warehouse can pack and release.</p>}
              {canFulfil && st === "confirmed" && (
                <ActionForm action={fulfilAction} submitLabel="Start packing"><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="pack" /></ActionForm>
              )}
              {canFulfil && (st === "confirmed" || st === "packing") && (
                <>
                  <p className="text-muted-foreground">When it&apos;s packed and waiting for the courier, mark it ready. <b>This deducts the stock.</b></p>
                  <ActionForm action={fulfilAction} submitLabel="Ready for pickup" confirm="Mark ready for pickup? Stock will be deducted."><input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="ready" /></ActionForm>
                </>
              )}
              {canFulfil && st === "ready_for_pickup" && (
                <ActionForm action={fulfilAction} submitLabel="Handed to courier">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="dispatch" />
                  <Field label="Courier" htmlFor="courier"><Input id="courier" name="courier" required placeholder="Lalamove, J&T, LBC…" defaultValue={order.courier_note.slice(0, 40)} /></Field>
                  <Field label="Tracking / booking no." htmlFor="tracking"><Input id="tracking" name="tracking" /></Field>
                  <Field label="Courier fee (info only)" htmlFor="fee" hint="Paid by the customer to the courier."><Input id="fee" name="fee" inputMode="decimal" /></Field>
                  {((pickups as { id: string; name: string }[] | null) ?? []).length > 0 && (
                    <Field label="Pickup point" htmlFor="pickup">
                      <Select id="pickup" name="pickup" defaultValue="">
                        <option value="">—</option>
                        {((pickups as { id: string; name: string }[] | null) ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </Field>
                  )}
                </ActionForm>
              )}
              {canFulfil && st === "dispatched" && (
                <ActionForm action={fulfilAction} submitLabel="Mark delivered">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="deliver" />
                  <Field label="Proof / note" htmlFor="note"><Input id="note" name="note" placeholder="e.g. Received by Ana, photo in Messenger" /></Field>
                </ActionForm>
              )}
              {canFulfil && ["ready_for_pickup", "dispatched", "delivered"].includes(st) && (
                <details className="rounded-lg border p-2">
                  <summary className="cursor-pointer font-medium">Record a return</summary>
                  <ActionForm action={fulfilAction} submitLabel="Receive return" variant="outline" confirm="Bring all items back into the RETURNS bin?">
                    <input type="hidden" name="id" value={id} /><input type="hidden" name="step" value="return" />
                    <Field label="Reason" htmlFor="reason"><Input id="reason" name="reason" required /></Field>
                  </ActionForm>
                </details>
              )}
              {!draft && cancellable && (can(access, "sales.view_all") || order.created_by === me.id) && (
                <details className="rounded-lg border p-2">
                  <summary className="cursor-pointer font-medium">Cancel order</summary>
                  <ActionForm action={cancelOrder} submitLabel="Cancel order" variant="danger">
                    <input type="hidden" name="id" value={id} />
                    <Field label="Reason" htmlFor="creason"><Input id="creason" name="reason" required /></Field>
                  </ActionForm>
                </details>
              )}
              {["delivered", "cancelled", "returned"].includes(st) && <p className="text-muted-foreground">Nothing left to do.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
