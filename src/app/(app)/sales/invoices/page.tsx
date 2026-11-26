import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addBooklet, recordSi } from "../actions";

export const metadata = { title: "Invoices & SI" };

/**
 * Billing invoices come from released orders. Official sales invoices (pre-printed booklets) are recorded here,
 * and the register flags duplicates (blocked), skipped numbers, numbers outside any booklet and invoices without an SI.
 */
export default async function InvoicesPage() {
  await requirePermission("sales.invoices.manage");
  const supabase = await createClient();
  const [{ data: invs }, { data: books }, { data: ex }, { data: recent }] = await Promise.all([
    supabase.from("billing_invoices").select("id, number, issued_on, due_on, total, status, order_id, customers(name), si_issuances(series, si_no, status)").order("issued_on", { ascending: false }).limit(200),
    supabase.from("si_booklets").select("id, series, start_no, end_no, status, received_on, locations(name)").order("received_on", { ascending: false }),
    supabase.from("si_exceptions").select("kind, series, si_no, issued_on, invoice_id, detail").limit(300),
    supabase.from("si_issuances").select("id, series, si_no, status, issued_on, note, billing_invoices(number)").order("created_at", { ascending: false }).limit(30),
  ]);
  const invoices = (invs as unknown as { id: string; number: string; issued_on: string; due_on: string | null; total: string; status: string; order_id: string; customers: { name: string } | null; si_issuances: { series: string; si_no: number; status: string }[] }[] | null) ?? [];
  const withoutSi = invoices.filter((i) => i.status === "issued" && !i.si_issuances.some((s) => s.status === "issued"));
  const exc = (ex as { kind: string; series: string; si_no: number | null; issued_on: string | null; invoice_id: string | null; detail: string }[] | null) ?? [];
  const booklets = (books as unknown as { id: string; series: string; start_no: number; end_no: number; status: string; received_on: string; locations: { name: string } | null }[] | null) ?? [];
  const KIND: Record<string, string> = { gap: "Skipped number", out_of_range: "Not in any booklet", missing_si: "No SI yet" };

  return (
    <>
      <PageHeader title="Invoices & official SI" description="The system issues billing invoices. Official sales invoices come from the pre-printed booklets and are monitored here." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Alerts ({exc.length})</CardTitle>
            {exc.length === 0 ? <p className="text-sm text-success">No gaps, out-of-range numbers or missing SIs.</p> : (
              <ul className="space-y-1 text-sm">
                {exc.slice(0, 50).map((e, i) => (
                  <li key={i} className={e.kind === "missing_si" ? "text-amber-800" : "text-danger"}>
                    <b>{KIND[e.kind]}</b>{e.si_no ? `: ${e.series}${e.si_no}` : ""} · {e.detail}{e.issued_on ? ` (${formatDate(e.issued_on)})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Billing invoices</CardTitle>
            <Table>
              <thead><tr><Th>Invoice</Th><Th>Customer</Th><Th>Date</Th><Th className="text-right">Total</Th><Th>Official SI</Th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td><Link href={`/sales/orders/${i.order_id}`} className="text-brand underline">{i.number}</Link> {i.status === "void" && <StatusBadge status="void" />}</Td>
                    <Td>{i.customers?.name}</Td>
                    <Td>{formatDate(i.issued_on)}{i.due_on ? <div className="text-xs text-muted-foreground">due {formatDate(i.due_on)}</div> : null}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(i.total)}</Td>
                    <Td>{i.si_issuances.filter((s) => s.status === "issued").map((s) => `${s.series}${s.si_no}`).join(", ") || <span className="text-amber-700">—</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {invoices.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No billing invoices yet. They&apos;re created when an order is marked ready for pickup.</p>}
          </Card>
          <Card>
            <CardTitle>Recently recorded SIs</CardTitle>
            <ul className="text-sm">
              {((recent as unknown as { id: string; series: string; si_no: number; status: string; issued_on: string; note: string; billing_invoices: { number: string } | null }[] | null) ?? []).map((s) => (
                <li key={s.id}>{s.series}{s.si_no} · <StatusBadge status={s.status} /> · {s.billing_invoices?.number ?? "—"} · {formatDate(s.issued_on)}{s.note ? ` · ${s.note}` : ""}</li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardTitle>Record an official SI</CardTitle>
            <ActionForm action={recordSi} submitLabel="Record SI">
              <Field label="For billing invoice" htmlFor="invoice_id">
                <Select id="invoice_id" name="invoice_id" defaultValue="">
                  <option value="">— none (void / spoiled) —</option>
                  {withoutSi.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.customers?.name} · ₱{Number(i.total).toLocaleString("en-PH")}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Series" htmlFor="series"><Input id="series" name="series" placeholder="e.g. A" /></Field>
                <Field label="SI number" htmlFor="si_no"><Input id="si_no" name="si_no" type="number" min={1} required /></Field>
              </div>
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue="issued"><option value="issued">Issued</option><option value="void">Void</option><option value="spoiled">Spoiled</option></Select>
              </Field>
              <Field label="Note (required for void / spoiled)" htmlFor="note"><Input id="note" name="note" /></Field>
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Booklets</CardTitle>
            <ul className="mb-3 space-y-1 text-sm">
              {booklets.map((b) => <li key={b.id}>{b.series}{b.start_no}–{b.series}{b.end_no} · <StatusBadge status={b.status} />{b.locations?.name ? ` · ${b.locations.name}` : ""}</li>)}
            </ul>
            {booklets.length === 0 && <p className="mb-3 text-sm text-muted-foreground">Register the booklets in use so the system can spot gaps.</p>}
            <ActionForm action={addBooklet} submitLabel="Register booklet">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Series" htmlFor="b-series"><Input id="b-series" name="series" /></Field>
                <Field label="First no." htmlFor="start_no"><Input id="start_no" name="start_no" type="number" min={1} required /></Field>
                <Field label="Last no." htmlFor="end_no"><Input id="end_no" name="end_no" type="number" min={1} required /></Field>
              </div>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
