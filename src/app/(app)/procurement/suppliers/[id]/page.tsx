import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Attachments } from "@/components/shared/attachments";
import { RecordHistory } from "@/components/record-history";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addBankAccount, addSupplierContact, setSupplierPrice, updateSupplier } from "../../actions";
import { ItemDatalist, unitOptions } from "../../parts";

export const metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePermission(["procurement.view", "procurement.suppliers.manage"]);
  const access = await getAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const s = data as { id: string; code: string; name: string; tin: string; vat_registered: boolean; payment_terms_days: number; address: string; mobile: string; email: string; category: string; status: string; status_note: string; notes: string };
  const canEdit = can(access, "procurement.suppliers.manage");
  const seeBank = can(access, "procurement.view_bank");
  const [{ data: contacts }, { data: prices }, { data: pos }, { data: perf }, bank, units] = await Promise.all([
    supabase.from("supplier_contacts").select("id, name, role, mobile, email").eq("supplier_id", id),
    supabase.from("supplier_products").select("product_id, unit_code, supplier_code, price, moq, lead_time_days, last_price, last_po_at, products(sku, name)").eq("supplier_id", id),
    supabase.from("purchase_orders").select("id, number, status, total, order_date, expected_date").eq("supplier_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("supplier_performance").select("*").eq("supplier_id", id).maybeSingle(),
    seeBank ? supabase.from("supplier_bank_accounts").select("id, bank, account_name, account_no").eq("supplier_id", id) : Promise.resolve({ data: [] }),
    unitOptions(),
  ]);
  if (seeBank && ((bank.data as unknown[] | null) ?? []).length) await supabase.rpc("log_restricted_access", { p_table: "supplier_bank_accounts", p_record: id, p_purpose: "view supplier page" });
  const p = perf as { po_count: number; po_value: string; on_time_pct: string | null; fill_pct: string | null; reject_pct: string | null } | null;
  const pct = (v: string | null | undefined) => (v == null ? "—" : `${Number(v)}%`);

  return (
    <>
      <PageHeader title={s.name} description={`${s.code} · ${s.category || "no category"} · ${s.vat_registered ? "VAT-registered" : "non-VAT"} · ${s.payment_terms_days}-day terms`} actions={<StatusBadge status={s.status === "blocked" ? "rejected" : s.status} className="text-sm" />} />
      {s.status !== "approved" && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{s.status === "pending" ? "Pending accreditation: approve this supplier (Details → Status) before raising POs." : `Blocked: ${s.status_note}`}</p>}
      <div className="mb-4 grid gap-3 text-sm sm:grid-cols-5">
        {[["POs", String(p?.po_count ?? 0)], ["Ordered", formatMoney(p?.po_value ?? "0")], ["On time", pct(p?.on_time_pct)], ["Fill rate", pct(p?.fill_pct)], ["QA rejects", pct(p?.reject_pct)]].map(([k, v]) => (
          <Card key={k} className="p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="text-lg font-bold">{v}</p></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Supplier prices</CardTitle>
            <Table>
              <thead><tr><Th>Item</Th><Th>Unit</Th><Th className="text-right">Price</Th><Th className="text-right">Last paid</Th><Th className="text-right">MOQ</Th><Th>Lead</Th></tr></thead>
              <tbody>
                {((prices as unknown as { product_id: string; unit_code: string; supplier_code: string; price: string; moq: string; lead_time_days: number | null; last_price: string | null; products: { sku: string; name: string } }[] | null) ?? []).map((r) => (
                  <tr key={`${r.product_id}:${r.unit_code}`}>
                    <Td>{r.products.sku}<div className="text-xs text-muted-foreground">{r.products.name}{r.supplier_code ? ` · their code ${r.supplier_code}` : ""}</div></Td>
                    <Td>{r.unit_code}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(r.price)}</Td>
                    <Td className="text-right tabular-nums">{r.last_price ? formatMoney(r.last_price) : "—"}</Td>
                    <Td className="text-right">{Number(r.moq)}</Td>
                    <Td>{r.lead_time_days != null ? `${r.lead_time_days}d` : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {canEdit && (
              <>
                <ItemDatalist />
                <ActionForm action={setSupplierPrice} submitLabel="Save price" className="mt-3 grid gap-2 sm:grid-cols-6 sm:items-end">
                  <input type="hidden" name="supplier_id" value={id} />
                  <div className="sm:col-span-2"><Field label="Item" htmlFor="product"><Input id="product" name="product" list="item-list" required autoComplete="off" /></Field></div>
                  <Field label="Unit" htmlFor="unit_code"><Select id="unit_code" name="unit_code" defaultValue="pc">{units.map((u) => <option key={u.code} value={u.code}>{u.code}</option>)}</Select></Field>
                  <Field label="Price" htmlFor="price"><Input id="price" name="price" inputMode="decimal" required /></Field>
                  <Field label="MOQ" htmlFor="moq"><Input id="moq" name="moq" type="number" min={0} step="any" /></Field>
                  <Field label="Lead days" htmlFor="lead_time_days"><Input id="lead_time_days" name="lead_time_days" type="number" min={0} /></Field>
                </ActionForm>
              </>
            )}
          </Card>
          <Card>
            <CardTitle>Purchase orders</CardTitle>
            <Table>
              <thead><tr><Th>PO</Th><Th>Date</Th><Th>Expected</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
              <tbody>
                {((pos as { id: string; number: string; status: string; total: string; order_date: string; expected_date: string | null }[] | null) ?? []).map((o) => (
                  <tr key={o.id}>
                    <Td><Link href={`/procurement/orders/${o.id}`} className="text-brand underline">{o.number}</Link></Td>
                    <Td>{formatDate(o.order_date)}</Td>
                    <Td>{formatDate(o.expected_date)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(o.total)}</Td>
                    <Td><StatusBadge status={o.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card><CardTitle>Documents (BIR 2303, FDA LTO, price quotes…)</CardTitle><Attachments table="suppliers" id={id} canAdd={canEdit} userId={me.id} /></Card>
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["suppliers"]} recordIds={[id]} /></Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardTitle>Details</CardTitle>
            {canEdit ? (
              <ActionForm action={updateSupplier} submitLabel="Save">
                <input type="hidden" name="id" value={id} />
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue={s.status}><option value="pending">Pending accreditation</option><option value="approved">Approved</option><option value="blocked">Blocked</option></Select>
                </Field>
                <Field label="Status note (required when blocking)" htmlFor="status_note"><Input id="status_note" name="status_note" defaultValue={s.status_note} /></Field>
                <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={s.name} required /></Field>
                <Field label="Category" htmlFor="category"><Input id="category" name="category" defaultValue={s.category} /></Field>
                <Field label="TIN" htmlFor="tin"><Input id="tin" name="tin" defaultValue={s.tin} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="vat_registered" defaultChecked={s.vat_registered} /> VAT-registered</label>
                <Field label="Payment terms (days)" htmlFor="payment_terms_days"><Input id="payment_terms_days" name="payment_terms_days" type="number" min={0} max={180} defaultValue={s.payment_terms_days} /></Field>
                <Field label="Mobile" htmlFor="mobile"><Input id="mobile" name="mobile" defaultValue={s.mobile} /></Field>
                <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={s.email} /></Field>
                <Field label="Address" htmlFor="address"><Textarea id="address" name="address" rows={2} defaultValue={s.address} /></Field>
                <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} defaultValue={s.notes} /></Field>
              </ActionForm>
            ) : (
              <p className="text-sm">{s.address}<br />{s.mobile} {s.email}<br />TIN {s.tin || "—"}</p>
            )}
          </Card>
          <Card>
            <CardTitle>Contacts</CardTitle>
            <ul className="mb-2 space-y-1 text-sm">
              {((contacts as { id: string; name: string; role: string; mobile: string; email: string }[] | null) ?? []).map((c) => <li key={c.id}><b>{c.name}</b>{c.role ? ` (${c.role})` : ""} · {c.mobile} {c.email}</li>)}
            </ul>
            {canEdit && (
              <details><summary className="cursor-pointer text-sm font-medium">Add contact</summary>
                <ActionForm action={addSupplierContact} submitLabel="Add contact">
                  <input type="hidden" name="supplier_id" value={id} />
                  <Field label="Name" htmlFor="c-name"><Input id="c-name" name="name" required /></Field>
                  <Field label="Role" htmlFor="c-role"><Input id="c-role" name="role" placeholder="Sales agent, accounting…" /></Field>
                  <Field label="Mobile" htmlFor="c-mobile"><Input id="c-mobile" name="mobile" /></Field>
                  <Field label="Email" htmlFor="c-email"><Input id="c-email" name="email" type="email" /></Field>
                </ActionForm>
              </details>
            )}
          </Card>
          {seeBank && (
            <Card>
              <CardTitle>Bank details (finance only)</CardTitle>
              <ul className="mb-2 space-y-1 text-sm">
                {((bank.data as { id: string; bank: string; account_name: string; account_no: string }[] | null) ?? []).map((b) => <li key={b.id}><b>{b.bank}</b> · {b.account_name} · <span className="font-mono">{b.account_no}</span></li>)}
              </ul>
              <details><summary className="cursor-pointer text-sm font-medium">Add bank account</summary>
                <ActionForm action={addBankAccount} submitLabel="Save bank account">
                  <input type="hidden" name="supplier_id" value={id} />
                  <Field label="Bank" htmlFor="b-bank"><Input id="b-bank" name="bank" required /></Field>
                  <Field label="Account name" htmlFor="b-name"><Input id="b-name" name="account_name" required /></Field>
                  <Field label="Account number" htmlFor="b-no"><Input id="b-no" name="account_no" required /></Field>
                </ActionForm>
              </details>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
