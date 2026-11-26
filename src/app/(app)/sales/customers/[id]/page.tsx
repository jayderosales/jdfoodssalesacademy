import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { KpiCard } from "@/components/shared/kpi-card";
import { RecordHistory } from "@/components/record-history";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addAddress, addContact, removeCustomerPrice, setCustomerPrice, updateCredit, updateCustomer } from "../../actions";
import { ActivityForm } from "../../activities/activity-form";
import { ACTIVITY_LABEL, CHANNEL_LABEL, METHOD_LABEL, SellableDatalist, TYPE_LABEL, salesPeople } from "../../parts";

export const metadata = { title: "Customer" };

/** Customer 360: details, credit, balance, orders, payments, special prices, contacts, activity. */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("*, price_lists(name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as unknown as {
    id: string; code: string; name: string; type: string; mobile: string; email: string; tin: string; notes: string; active: boolean; owner_id: string | null;
    payment_terms_days: number; credit_limit: string; on_hold: boolean; opening_balance: string; opening_due_date: string | null; source: string; price_lists: { name: string } | null;
  };
  const [{ data: orders }, { data: pays }, { data: contacts }, { data: addrs }, { data: prices }, { data: acts }, { data: bal }, { data: od }, people] = await Promise.all([
    supabase.from("sales_orders").select("id, number, status, total, paid_amount, channel, placed_at, created_at, due_date").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("payments").select("id, number, method, amount, status, paid_on, reference").eq("customer_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("customer_contacts").select("id, name, role, mobile, email").eq("customer_id", id),
    supabase.from("customer_addresses").select("id, label, recipient, phone, line, city, province, zip, is_default").eq("customer_id", id),
    supabase.from("customer_prices").select("product_id, price, valid_from, valid_to, products(sku, name, srp)").eq("customer_id", id),
    supabase.from("activities").select("id, kind, subject, notes, outcome, done_at, due_at, created_at, lat").eq("customer_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.rpc("customer_balance", { p_customer: id }),
    supabase.rpc("customer_overdue", { p_customer: id }),
    can(access, "sales.view_all") ? salesPeople(me) : Promise.resolve([]),
  ]);
  const os = (orders as { id: string; number: string; status: string; total: string; paid_amount: string; channel: string; placed_at: string | null; created_at: string; due_date: string | null }[] | null) ?? [];
  const delivered = os.filter((o) => ["ready_for_pickup", "dispatched", "delivered"].includes(o.status));
  const lifetime = delivered.reduce((s, o) => s + Number(o.total), 0);
  const canEdit = can(access, "sales.customers.manage");
  const canCredit = can(access, "sales.view_all") || can(access, "sales.payments.confirm");
  const canPrice = can(access, "sales.pricing.manage");
  const owed = Number(bal ?? 0);
  const overdue = Number(od ?? 0);

  return (
    <>
      <PageHeader title={c.name} description={`${c.code} · ${TYPE_LABEL[c.type]} · price list: ${c.price_lists?.name ?? "—"}${c.source === "shop" ? " · from the online shop" : ""}`} actions={can(access, "sales.orders.create") ? <Link href="/sales/orders" className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">New order</Link> : undefined} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <KpiCard label="Owes us" value={formatMoney(owed.toFixed(2))} tone={owed > 0 ? "warning" : "default"} hint={c.payment_terms_days ? `limit ${formatMoney(c.credit_limit)}` : "pays before release"} />
        <KpiCard label="Overdue" value={formatMoney(overdue.toFixed(2))} tone={overdue > 0 ? "danger" : "default"} hint={c.on_hold ? "ON HOLD" : undefined} />
        <KpiCard label="Bought (released orders)" value={formatMoney(lifetime.toFixed(2))} hint={`${delivered.length} orders`} />
        <KpiCard label="Last order" value={os[0] ? formatDate(os[0].placed_at ?? os[0].created_at) : "—"} href={os[0] ? `/sales/orders/${os[0].id}` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Orders</CardTitle>
            <Table>
              <thead><tr><Th>Order</Th><Th>Channel</Th><Th>Date</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
              <tbody>
                {os.map((o) => (
                  <tr key={o.id}>
                    <Td><Link href={`/sales/orders/${o.id}`} className="text-brand underline">{o.number}</Link></Td>
                    <Td>{CHANNEL_LABEL[o.channel]}</Td>
                    <Td>{formatDate(o.placed_at ?? o.created_at)}{o.due_date && Number(o.paid_amount) < Number(o.total) ? <div className="text-xs text-amber-700">due {formatDate(o.due_date)}</div> : null}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(o.total)}</Td>
                    <Td><StatusBadge status={o.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {os.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No orders yet.</p>}
          </Card>

          <Card>
            <CardTitle>Payments</CardTitle>
            <ul className="divide-y text-sm">
              {((pays as { id: string; number: string; method: string; amount: string; status: string; paid_on: string; reference: string }[] | null) ?? []).map((p) => (
                <li key={p.id} className="flex justify-between py-2"><span>{p.number} · {METHOD_LABEL[p.method]} · {formatDate(p.paid_on)}{p.reference ? ` · ${p.reference}` : ""}</span><span className="flex gap-2"><b>{formatMoney(p.amount)}</b><StatusBadge status={p.status === "confirmed" ? "approved" : p.status} /></span></li>
              ))}
            </ul>
            {!(pays as unknown[] | null)?.length && <p className="text-sm text-muted-foreground">No payments yet.</p>}
          </Card>

          <Card>
            <CardTitle>Calls, visits and notes</CardTitle>
            {can(access, "sales.crm") && <ActivityForm customerId={id} />}
            <ul className="mt-3 divide-y text-sm">
              {((acts as { id: string; kind: string; subject: string; notes: string; outcome: string; done_at: string | null; due_at: string | null; created_at: string; lat: string | null }[] | null) ?? []).map((a) => (
                <li key={a.id} className="py-2">
                  <b>{ACTIVITY_LABEL[a.kind]}</b> · {a.subject} <span className="text-muted-foreground">· {formatDate(a.created_at, true)}{a.lat ? " · 📍 checked in" : ""}{!a.done_at && a.due_at ? ` · due ${formatDate(a.due_at, true)}` : ""}</span>
                  {a.notes && <p className="text-muted-foreground">{a.notes}</p>}
                  {a.outcome && <p>Outcome: {a.outcome}</p>}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>Special prices</CardTitle>
            <p className="mb-2 text-sm text-muted-foreground">These override the {c.price_lists?.name ?? "price list"} for this customer only.</p>
            <Table>
              <thead><tr><Th>Product</Th><Th className="text-right">SRP</Th><Th className="text-right">Their price</Th><Th>From</Th>{canPrice && <Th />}</tr></thead>
              <tbody>
                {((prices as unknown as { product_id: string; price: string; valid_from: string; valid_to: string | null; products: { sku: string; name: string; srp: string | null } }[] | null) ?? []).map((p) => (
                  <tr key={`${p.product_id}:${p.valid_from}`}>
                    <Td>{p.products.sku}<div className="text-xs text-muted-foreground">{p.products.name}</div></Td>
                    <Td className="text-right">{formatMoney(p.products.srp)}</Td>
                    <Td className="text-right font-semibold">{formatMoney(p.price)}</Td>
                    <Td>{p.valid_from === "2000-01-01" ? "always" : formatDate(p.valid_from)}</Td>
                    {canPrice && (
                      <Td>
                        <ActionForm action={removeCustomerPrice} submitLabel="Remove" variant="outline" className="flex">
                          <input type="hidden" name="customer_id" value={id} /><input type="hidden" name="product_id" value={p.product_id} /><input type="hidden" name="valid_from" value={p.valid_from} />
                        </ActionForm>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
            {canPrice && (
              <>
                <SellableDatalist />
                <ActionForm action={setCustomerPrice} submitLabel="Save special price" className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_150px_auto] sm:items-end">
                  <input type="hidden" name="customer_id" value={id} />
                  <Field label="Product" htmlFor="sp-product"><Input id="sp-product" name="product" list="sell-list" required autoComplete="off" /></Field>
                  <Field label="Price" htmlFor="sp-price"><Input id="sp-price" name="price" inputMode="decimal" required /></Field>
                  <Field label="From (optional)" htmlFor="sp-from"><Input id="sp-from" name="valid_from" type="date" /></Field>
                </ActionForm>
              </>
            )}
          </Card>
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["customers"]} recordIds={[id]} /></Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Details</CardTitle>
            {canEdit ? (
              <ActionForm action={updateCustomer} submitLabel="Save">
                <input type="hidden" name="id" value={id} />
                <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={c.name} required /></Field>
                <Field label="Type" htmlFor="type">
                  <Select id="type" name="type" defaultValue={c.type}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                </Field>
                <Field label="Mobile" htmlFor="mobile"><Input id="mobile" name="mobile" defaultValue={c.mobile} /></Field>
                <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={c.email} /></Field>
                <Field label="TIN" htmlFor="tin"><Input id="tin" name="tin" defaultValue={c.tin} /></Field>
                {people.length > 0 && (
                  <Field label="Sales rep" htmlFor="owner_id">
                    <Select id="owner_id" name="owner_id" defaultValue={c.owner_id ?? ""}>
                      <option value="">Unassigned</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </Field>
                )}
                {people.length === 0 && <input type="hidden" name="owner_id" value={c.owner_id ?? ""} />}
                <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={c.notes} rows={3} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c.active} /> Active</label>
              </ActionForm>
            ) : (
              <dl className="space-y-1 text-sm"><dt className="text-muted-foreground">Mobile</dt><dd>{c.mobile || "—"}</dd><dt className="text-muted-foreground">Email</dt><dd>{c.email || "—"}</dd></dl>
            )}
          </Card>

          <Card>
            <CardTitle>Credit</CardTitle>
            {canCredit ? (
              <ActionForm action={updateCredit} submitLabel="Save credit terms">
                <input type="hidden" name="id" value={id} />
                <Field label="Payment terms (days, 0 = pay first)" htmlFor="payment_terms_days"><Input id="payment_terms_days" name="payment_terms_days" type="number" min={0} max={180} defaultValue={c.payment_terms_days} /></Field>
                <Field label="Credit limit (₱)" htmlFor="credit_limit"><Input id="credit_limit" name="credit_limit" inputMode="decimal" defaultValue={Number(c.credit_limit).toFixed(2)} /></Field>
                <Field label="Opening balance (₱)" htmlFor="opening_balance" hint="What they owed before this system."><Input id="opening_balance" name="opening_balance" inputMode="decimal" defaultValue={Number(c.opening_balance).toFixed(2)} /></Field>
                <Field label="Opening balance due" htmlFor="opening_due_date"><Input id="opening_due_date" name="opening_due_date" type="date" defaultValue={c.opening_due_date ?? ""} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="on_hold" defaultChecked={c.on_hold} /> On hold (credit orders need CEO approval)</label>
              </ActionForm>
            ) : (
              <p className="text-sm">{c.payment_terms_days ? `${c.payment_terms_days}-day terms, limit ${formatMoney(c.credit_limit)}` : "Pays before release."} {c.on_hold && <b className="text-danger">On hold.</b>}</p>
            )}
          </Card>

          <Card>
            <CardTitle>Contacts</CardTitle>
            <ul className="mb-3 space-y-1 text-sm">
              {((contacts as { id: string; name: string; role: string; mobile: string; email: string }[] | null) ?? []).map((x) => (
                <li key={x.id}><b>{x.name}</b>{x.role ? ` (${x.role})` : ""} · {x.mobile} {x.email}</li>
              ))}
            </ul>
            {canEdit && (
              <details><summary className="cursor-pointer text-sm font-medium">Add contact</summary>
                <ActionForm action={addContact} submitLabel="Add contact">
                  <input type="hidden" name="customer_id" value={id} />
                  <Field label="Name" htmlFor="c-name"><Input id="c-name" name="name" required /></Field>
                  <Field label="Role" htmlFor="c-role"><Input id="c-role" name="role" placeholder="Owner, purchaser…" /></Field>
                  <Field label="Mobile" htmlFor="c-mobile"><Input id="c-mobile" name="mobile" /></Field>
                  <Field label="Email" htmlFor="c-email"><Input id="c-email" name="email" type="email" /></Field>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card>
            <CardTitle>Delivery addresses</CardTitle>
            <ul className="mb-3 space-y-1 text-sm">
              {((addrs as { id: string; label: string; recipient: string; phone: string; line: string; city: string; province: string; is_default: boolean }[] | null) ?? []).map((a) => (
                <li key={a.id}><b>{a.label}</b>{a.is_default ? " (default)" : ""}: {a.recipient} {a.phone} · {a.line}, {a.city} {a.province}</li>
              ))}
            </ul>
            {canEdit && (
              <details><summary className="cursor-pointer text-sm font-medium">Add address</summary>
                <ActionForm action={addAddress} submitLabel="Add address">
                  <input type="hidden" name="customer_id" value={id} />
                  <Field label="Label" htmlFor="a-label"><Input id="a-label" name="label" placeholder="Main, Branch 2…" /></Field>
                  <Field label="Recipient" htmlFor="a-recipient"><Input id="a-recipient" name="recipient" /></Field>
                  <Field label="Phone" htmlFor="a-phone"><Input id="a-phone" name="phone" /></Field>
                  <Field label="Street, barangay" htmlFor="a-line"><Input id="a-line" name="line" required /></Field>
                  <Field label="City" htmlFor="a-city"><Input id="a-city" name="city" /></Field>
                  <Field label="Province" htmlFor="a-province"><Input id="a-province" name="province" /></Field>
                  <Field label="ZIP" htmlFor="a-zip"><Input id="a-zip" name="zip" /></Field>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_default" /> Default</label>
                </ActionForm>
              </details>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
