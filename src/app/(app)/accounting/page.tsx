import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/utils";
import { retryUnposted } from "./actions";
import { BooksBanner, monthStart } from "./parts";

export const metadata = { title: "Accounting" };

type Tb = { code: string; name: string; type: string; subtype: string; debit: string; credit: string; closing: string };

/** Cash, receivables, payables, this month's profit, VAT and anything that failed to post. */
export default async function AccountingOverview() {
  await requirePermission(["accounting.view", "finance.reports.view"]);
  const access = await getAccess();
  const supabase = await createClient();
  const today = manilaToday();
  const from = monthStart();
  const [{ data: tbMonth }, { data: unposted }, { count: payReady }] = await Promise.all([
    supabase.rpc("trial_balance", { p_from: from, p_to: today }),
    supabase.from("unposted_events").select("event_id, event_type, error, attempts, last_attempt_at").is("resolved_at", null).order("last_attempt_at", { ascending: false }).limit(50),
    supabase.from("supplier_invoices").select("id", { count: "exact", head: true }).in("status", ["matched", "approved"]),
  ]);
  const tb = (tbMonth as Tb[] | null) ?? [];
  const sum = (f: (r: Tb) => boolean, pick: (r: Tb) => number) => tb.filter(f).reduce((s, r) => s + pick(r), 0);
  const cash = sum((r) => ["cash", "bank"].includes(r.subtype), (r) => Number(r.closing));
  const ar = sum((r) => r.subtype === "receivable" && r.code === "1100", (r) => Number(r.closing));
  const ap = -sum((r) => r.code === "2010", (r) => Number(r.closing));
  const revenue = sum((r) => r.type === "income" && r.subtype === "sales", (r) => Number(r.credit) - Number(r.debit));
  const cos = sum((r) => r.subtype === "cost_of_sales", (r) => Number(r.debit) - Number(r.credit));
  const income = sum((r) => r.type === "income", (r) => Number(r.credit) - Number(r.debit));
  const expense = sum((r) => r.type === "expense", (r) => Number(r.debit) - Number(r.credit));
  const outVat = -sum((r) => r.code === "2100", (r) => Number(r.debit) - Number(r.credit));
  const inVat = sum((r) => r.code === "1300", (r) => Number(r.debit) - Number(r.credit));
  const m = (n: number) => formatMoney(n.toFixed(2));
  const up = (unposted as { event_id: number; event_type: string; error: string; attempts: number }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Accounting" description="Every sale, payment, purchase and stock change posts here automatically. Click a number to see what's behind it." />
      <BooksBanner />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Cash and bank" value={m(cash)} href="/accounting/banks" />
        <KpiCard label="Customers owe us" value={m(ar)} href="/accounting/receivables" />
        <KpiCard label="We owe suppliers" value={m(ap)} hint={`${payReady ?? 0} invoices ready to pay`} href="/accounting/payables" />
        <KpiCard label="Not posted" value={up.length} tone={up.length ? "danger" : "success"} hint={up.length ? "Fix below" : "Everything posted"} />
        <KpiCard label="Sales this month (net of VAT)" value={m(revenue)} href={`/accounting/reports?r=pl&from=${from}&to=${today}`} />
        <KpiCard label="Gross profit this month" value={m(revenue - cos)} hint={revenue ? `${Math.round(((revenue - cos) / revenue) * 100)}% margin` : undefined} href={`/accounting/reports?r=pl&from=${from}&to=${today}`} />
        <KpiCard label="Net income this month" value={m(income - expense)} tone={income - expense < 0 ? "danger" : "default"} href={`/accounting/reports?r=pl&from=${from}&to=${today}`} />
        <KpiCard label="VAT this month (output − input)" value={m(outVat - inVat)} hint={`${m(outVat)} − ${m(inVat)}`} href="/accounting/reports?r=vat" />
      </div>
      {up.length > 0 && (
        <Card>
          <CardTitle>Events that didn&apos;t post</CardTitle>
          <p className="mb-2 text-sm text-muted-foreground">The business action went through, but its journal entry failed. Fix the cause (usually a missing or inactive account) and retry.</p>
          <ul className="divide-y text-sm">
            {up.map((u) => (
              <li key={u.event_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b>{u.event_type}</b> #{u.event_id} · {u.error} <span className="text-muted-foreground">({u.attempts} tries)</span></span>
              </li>
            ))}
          </ul>
          {can(access, "accounting.journals.create") && <ActionForm action={retryUnposted} submitLabel="Retry all" className="mt-3" />}
        </Card>
      )}
      <p className="mt-4 text-sm text-muted-foreground">Tasks: <Link href="/accounting/payables" className="underline">pay suppliers</Link> · <Link href="/accounting/banks" className="underline">reconcile banks and release petty cash</Link> · <Link href="/accounting/receivables" className="underline">follow up overdue customers</Link> · <Link href="/accounting/periods" className="underline">close the month</Link> · <Link href="/accounting/transmittals" className="underline">receive transmittals</Link> · <Link href="/scan?section=accounting" className="underline">scan a bill, receipt or payment slip</Link></p>
    </>
  );
}
