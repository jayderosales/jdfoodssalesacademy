import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { totals } from "@/lib/accounting/aging";
import { loadPayables } from "@/lib/accounting/open-items";
import { formatMoney, fromCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { createSupplierPayment } from "../actions";
import { accounts, AgingTable, BooksBanner, PAY_STATUS } from "../parts";

export const metadata = { title: "Payables" };

const METHODS = [["bank_transfer", "Bank transfer"], ["cheque", "Cheque"], ["cash", "Cash"], ["gcash", "GCash"], ["maya", "Maya"], ["other", "Other"]] as const;

export default async function PayablesPage() {
  await requirePermission(["ap.payments.create", "accounting.view", "finance.reports.view"]);
  const access = await getAccess();
  const today = manilaToday();
  const supabase = await createClient();
  const [{ rows, names }, { data: pays }] = await Promise.all([
    loadPayables(supabase, today),
    supabase.from("supplier_payments").select("id, number, pay_date, status, gross, ewt_amount, net_paid, suppliers(name)").order("created_at", { ascending: false }).limit(100),
  ]);
  const t = totals(rows);
  const dueSoon = rows.flatMap((r) => r.items).filter((i) => i.bucket === "current" && i.due <= new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10)).reduce((s, i) => s + i.open, 0n);
  const m = (c: bigint) => formatMoney(fromCentavos(c));
  const payable = rows.filter((r) => r.items.some((i) => !i.key.startsWith("opening:")));
  const canPay = can(access, "ap.payments.create");
  const fromAccounts = canPay ? await accounts({ postingOnly: true, subtypes: ["cash", "bank"] }) : [];
  type P = { id: string; number: string; pay_date: string; status: string; gross: string; ewt_amount: string; net_paid: string; suppliers: { name: string } | null };
  const plist = (pays as unknown as P[] | null) ?? [];

  return (
    <>
      <PageHeader title="Payables" description="What we owe suppliers. Only invoices matched to the PO and receipt (or approved by the CEO) can be paid. Every payment needs the CEO's approval." />
      <BooksBanner />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="We owe suppliers" value={m(t.total)} />
        <KpiCard label="Overdue" value={m(t.total - t.buckets.current)} tone={t.total - t.buckets.current ? "danger" : "success"} />
        <KpiCard label="Due in the next 7 days" value={m(dueSoon)} tone={dueSoon ? "warning" : "default"} />
      </div>
      {canPay && payable.length > 0 && (
        <Card className="mb-4">
          <CardTitle>Pay a supplier</CardTitle>
          <ActionForm action={createSupplierPayment} submitLabel="Prepare payment" className="grid gap-2 sm:grid-cols-[1fr_1fr_150px_150px_auto] sm:items-end">
            <Field label="Supplier" htmlFor="supplier_id">
              <Select id="supplier_id" name="supplier_id" required>
                <option value="">Choose…</option>
                {payable.map((r) => <option key={r.party} value={r.party}>{names.get(r.party)} · {m(r.total)}</option>)}
              </Select>
            </Field>
            <Field label="Pay from" htmlFor="account_id">
              <Select id="account_id" name="account_id" required>
                {fromAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </Select>
            </Field>
            <Field label="Method" htmlFor="method"><Select id="method" name="method">{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Pay date" htmlFor="pay_date"><Input id="pay_date" name="pay_date" type="date" defaultValue={today} required /></Field>
          </ActionForm>
          <p className="mt-1 text-xs text-muted-foreground">Every ready invoice of the supplier is added in full. You can lower or remove amounts on the next page. Withholding tax is worked out from the supplier&apos;s rate.</p>
        </Card>
      )}
      <Card className="mb-4">
        <CardTitle>Aging as of today</CardTitle>
        {rows.length ? (
          <AgingTable rows={rows} names={names} partyHref={(p) => `/procurement/suppliers/${p}`} itemHref={(k) => (k.startsWith("opening:") ? null : `/procurement/invoices/${k}`)} />
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">No supplier invoices are waiting to be paid.</p>
        )}
      </Card>
      <Card>
        <CardTitle>Supplier payments</CardTitle>
        <Table>
          <thead><tr><Th>Number</Th><Th>Supplier</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Invoices settled</Th><Th className="text-right">Tax withheld</Th><Th className="text-right">Paid out</Th></tr></thead>
          <tbody>
            {plist.map((p) => (
              <tr key={p.id}>
                <Td><Link href={`/accounting/payables/${p.id}`} className="font-medium text-brand underline">{p.number}</Link></Td>
                <Td>{p.suppliers?.name}</Td>
                <Td>{formatDate(p.pay_date)}</Td>
                <Td>{PAY_STATUS[p.status] ?? p.status}</Td>
                <Td className="text-right tabular-nums">{formatMoney(p.gross)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(p.ewt_amount)}</Td>
                <Td className="text-right font-medium tabular-nums">{formatMoney(p.net_paid)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {plist.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No payments yet.</p>}
      </Card>
    </>
  );
}
