import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { recordExpense } from "../actions";
import { accounts, BooksBanner, monthStart } from "../parts";

export const metadata = { title: "Disbursements" };

type Kind = "supplier" | "petty" | "expense";
const KIND_LABEL: Record<Kind, string> = { supplier: "Supplier payment", petty: "Petty cash released", expense: "Expense (company-paid)" };
interface Row { key: string; kind: Kind; date: string; payee: string; ref: string; amount: number; paidFrom: string; status: string; href: string; photo: string | null }

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** All money going out for a period: paid supplier payments, released petty cash, and company-paid expense receipts. */
export default async function DisbursementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["accounting.view", "ap.payments.create", "accounting.journals.create"]);
  const access = await getAccess();
  const sp = await searchParams;
  const today = manilaToday();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : monthStart();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
  const kind = (["supplier", "petty", "expense"] as const).find((k) => k === sp.kind) ?? null;
  const supabase = await createClient();
  const [{ data: pays }, { data: pcs }, { data: exps }] = await Promise.all([
    supabase.from("supplier_payments").select("id, number, pay_date, net_paid, reference, suppliers(name), accounts(code, name)").eq("status", "paid").gte("pay_date", from).lte("pay_date", to).limit(2000),
    supabase.from("petty_cash_requests").select("id, number, amount, purpose, released_at").not("released_at", "is", null).gte("released_at", `${from}T00:00:00+08:00`).lt("released_at", `${nextDay(to)}T00:00:00+08:00`).limit(2000),
    supabase.from("expense_receipts").select("id, receipt_date, vendor_name, receipt_no, amount, description, scan_id, journal_entry_id, journal_entries(id, number, status)").not("journal_entry_id", "is", null).gte("receipt_date", from).lte("receipt_date", to).limit(2000),
  ]);
  type E = { id: string; receipt_date: string; vendor_name: string; receipt_no: string; amount: string; description: string; scan_id: string | null; journal_entry_id: string; journal_entries: { id: string; number: string; status: string } | null };
  const expenses = (exps as unknown as E[] | null) ?? [];
  // which cash / bank account each company-paid expense came out of (the credit line of its journal)
  const jids = expenses.map((e) => e.journal_entry_id);
  const { data: credits } = jids.length ? await supabase.from("journal_lines").select("entry_id, credit, accounts(code, name)").in("entry_id", jids).gt("credit", 0) : { data: [] };
  const paidFrom = new Map(((credits as unknown as { entry_id: string; accounts: { code: string; name: string } | null }[] | null) ?? []).map((c) => [c.entry_id, c.accounts ? `${c.accounts.code} ${c.accounts.name}` : ""]));

  const rows: Row[] = [
    ...((pays as unknown as { id: string; number: string; pay_date: string; net_paid: string; reference: string; suppliers: { name: string } | null; accounts: { code: string; name: string } | null }[] | null) ?? []).map((p) => ({
      key: `s${p.id}`, kind: "supplier" as const, date: p.pay_date, payee: p.suppliers?.name ?? "?", ref: [p.number, p.reference].filter(Boolean).join(" · "), amount: Number(p.net_paid),
      paidFrom: p.accounts ? `${p.accounts.code} ${p.accounts.name}` : "", status: "Paid", href: `/accounting/payables/${p.id}`, photo: null,
    })),
    ...((pcs as { id: string; number: string; amount: string; purpose: string; released_at: string }[] | null) ?? []).map((p) => ({
      key: `p${p.id}`, kind: "petty" as const, date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(p.released_at)), payee: p.purpose.slice(0, 80), ref: p.number, amount: Number(p.amount),
      paidFrom: "1020 Petty cash fund", status: "Released", href: `/requests/petty-cash/${p.id}`, photo: null,
    })),
    ...expenses.map((e) => ({
      key: `e${e.id}`, kind: "expense" as const, date: e.receipt_date, payee: e.vendor_name, ref: [e.receipt_no && `OR ${e.receipt_no}`, e.description].filter(Boolean).join(" · "), amount: Number(e.amount),
      paidFrom: paidFrom.get(e.journal_entry_id) ?? "",
      status: e.journal_entries?.status === "posted" ? "Posted" : e.journal_entries?.status === "submitted" ? "Waiting for CEO" : e.journal_entries?.status === "rejected" ? "Rejected" : "Draft (send to CEO)",
      href: `/accounting/journals/${e.journal_entry_id}`, photo: e.scan_id ? `/scan/${e.scan_id}` : null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const shown = kind ? rows.filter((r) => r.kind === kind) : rows;
  const sum = (list: Row[]) => list.reduce((s, r) => s + r.amount, 0);
  const m = (n: number) => formatMoney(n.toFixed(2));
  const byAccount = new Map<string, number>();
  for (const r of rows) byAccount.set(r.paidFrom || "Not known", (byAccount.get(r.paidFrom || "Not known") ?? 0) + r.amount);
  const pendingExpenses = rows.filter((r) => r.kind === "expense" && r.status !== "Posted" && r.status !== "Rejected");
  const canRecord = can(access, "accounting.journals.create");
  const [expenseAccs, cashBank] = canRecord ? await Promise.all([accounts({ postingOnly: true, types: ["expense"] }), accounts({ postingOnly: true, subtypes: ["cash", "bank"] })]) : [[], []];
  const qs = (k: Kind | null) => `/accounting/disbursements?from=${from}&to=${to}${k ? `&kind=${k}` : ""}`;

  return (
    <>
      <PageHeader
        title="Disbursements"
        description="All money going out: supplier payments, petty cash released, and expenses paid from company cash or bank. Click a row to see the payment, request or journal behind it."
        actions={canRecord ? <Link href="/accounting/documents?kind=expense_receipt" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">📷 Scan a receipt</Link> : undefined}
      />
      <BooksBanner />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total paid out" value={m(sum(rows))} hint={`${formatDate(from)} – ${formatDate(to)}`} />
        <KpiCard label="Supplier payments" value={m(sum(rows.filter((r) => r.kind === "supplier")))} href={qs("supplier")} />
        <KpiCard label="Petty cash released" value={m(sum(rows.filter((r) => r.kind === "petty")))} href={qs("petty")} />
        <KpiCard label="Company-paid expenses" value={m(sum(rows.filter((r) => r.kind === "expense")))} hint={pendingExpenses.length ? `${pendingExpenses.length} not yet posted` : undefined} tone={pendingExpenses.length ? "warning" : "default"} href={qs("expense")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <form className="mb-3 flex flex-wrap items-end gap-2 text-sm" action="/accounting/disbursements">
              <label className="text-xs">From<Input name="from" type="date" defaultValue={from} className="h-9" /></label>
              <label className="text-xs">To<Input name="to" type="date" defaultValue={to} className="h-9" /></label>
              <label className="text-xs">Type
                <Select name="kind" defaultValue={kind ?? ""} className="h-9 w-48">
                  <option value="">All</option>
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </Select>
              </label>
              <button className="h-9 rounded-lg border px-3">Show</button>
            </form>
            <div className="overflow-x-auto">
              <Table>
                <thead><tr><Th>Date</Th><Th>Type</Th><Th>Paid to / for</Th><Th>Reference</Th><Th>Paid from</Th><Th>Status</Th><Th className="text-right">Amount</Th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.key}>
                      <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
                      <Td className="text-xs">{KIND_LABEL[r.kind]}</Td>
                      <Td><Link href={r.href} className="text-brand underline">{r.payee}</Link>{r.photo && <Link href={r.photo} className="ml-1 text-xs underline">photo</Link>}</Td>
                      <Td className="text-xs text-muted-foreground">{r.ref}</Td>
                      <Td className="text-xs">{r.paidFrom || "—"}</Td>
                      <Td className={`text-xs ${r.status.startsWith("Draft") || r.status === "Waiting for CEO" ? "text-amber-700" : r.status === "Rejected" ? "text-danger" : ""}`}>{r.status}</Td>
                      <Td className="text-right tabular-nums">{m(r.amount)}</Td>
                    </tr>
                  ))}
                  {shown.length > 0 && <tr className="font-bold"><Td colSpan={6}>Total</Td><Td className="text-right tabular-nums">{m(sum(shown))}</Td></tr>}
                </tbody>
              </Table>
            </div>
            {shown.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No money went out in this period.</p>}
            <p className="mt-2 text-xs text-muted-foreground">Company-paid expenses count here once recorded. Their journal still needs the CEO&apos;s approval before it posts to the books.</p>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardTitle>By account paid from</CardTitle>
            {byAccount.size === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
              <ul className="space-y-1 text-sm">
                {[...byAccount.entries()].sort((a, b) => b[1] - a[1]).map(([acc, amt]) => <li key={acc} className="flex justify-between gap-2"><span>{acc}</span><span className="tabular-nums">{m(amt)}</span></li>)}
              </ul>
            )}
          </Card>
          {canRecord && (
            <Card>
              <CardTitle>Record an expense</CardTitle>
              <p className="mb-2 text-sm text-muted-foreground">For an expense paid from company cash or bank. <Link href="/accounting/documents?kind=expense_receipt" className="underline">Scan the receipt</Link> to have it read for you, or type it here. Either way, a draft journal is created for the CEO.</p>
              <ActionForm action={recordExpense} submitLabel="Record and open journal">
                <Field label="Store / vendor" htmlFor="vendor_name"><Input id="vendor_name" name="vendor_name" required /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="OR / invoice no." htmlFor="receipt_no"><Input id="receipt_no" name="receipt_no" /></Field>
                  <Field label="Vendor TIN" htmlFor="vendor_tin"><Input id="vendor_tin" name="vendor_tin" /></Field>
                  <Field label="Date" htmlFor="receipt_date"><Input id="receipt_date" name="receipt_date" type="date" defaultValue={today} required /></Field>
                  <Field label="Amount paid" htmlFor="amount"><Input id="amount" name="amount" inputMode="decimal" required /></Field>
                </div>
                <Field label="VAT included in the amount" htmlFor="vat_amount" hint="0 if the receipt shows no VAT."><Input id="vat_amount" name="vat_amount" inputMode="decimal" defaultValue="0" /></Field>
                <Field label="What it's for" htmlFor="expense_account_id">
                  <Select id="expense_account_id" name="expense_account_id" required defaultValue=""><option value="" disabled>Choose…</option>{expenseAccs.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</Select>
                </Field>
                <Field label="Paid from" htmlFor="paid_from">
                  <Select id="paid_from" name="paid_from" required defaultValue=""><option value="" disabled>Choose…</option>{cashBank.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</Select>
                </Field>
                <Field label="Description" htmlFor="description"><Input id="description" name="description" /></Field>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
