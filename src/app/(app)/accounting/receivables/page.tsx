import Link from "next/link";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { totals } from "@/lib/accounting/aging";
import { loadReceivables } from "@/lib/accounting/open-items";
import { formatMoney, fromCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/utils";
import { AgingTable, BooksBanner } from "../parts";

export const metadata = { title: "Receivables" };

/** What customers owe: delivered/ready orders not fully paid, plus opening balances, less money paid on account. */
export default async function ReceivablesPage() {
  await requirePermission(["ar.manage", "accounting.view", "finance.reports.view"]);
  const today = manilaToday();
  const supabase = await createClient();
  const { rows, names } = await loadReceivables(supabase, today);
  const t = totals(rows);
  const late = t.total - t.buckets.current;
  const m = (c: bigint) => formatMoney(fromCentavos(c));

  return (
    <>
      <PageHeader title="Receivables" description="Who owes us, and how late. Open a customer to see each unpaid order. Record payments in Sales → Payments." />
      <BooksBanner />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Customers owe us" value={m(t.total)} />
        <KpiCard label="Overdue" value={m(late)} tone={late ? "danger" : "success"} hint={t.total ? `${Math.round(Number((late * 100n) / (t.total || 1n)))}% of the total` : undefined} />
        <KpiCard label="Over 90 days late" value={m(t.buckets["90+"])} tone={t.buckets["90+"] ? "danger" : "default"} />
      </div>
      <Card>
        <CardTitle>Aging as of today</CardTitle>
        {rows.length ? (
          <AgingTable rows={rows} names={names} partyHref={(p) => `/sales/customers/${p}`} itemHref={(k) => (k.startsWith("opening:") ? null : `/sales/orders/${k}`)} />
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">No one owes us anything right now.</p>
        )}
      </Card>
      <p className="mt-3 text-sm text-muted-foreground">Money a customer paid without an order is applied to their oldest unpaid items first. Follow up overdue customers from their <Link href="/sales/customers" className="underline">customer page</Link>. The ledger&apos;s receivables account should match this total; differences show in the <Link href="/accounting/ledger?account=1100" className="underline">ledger</Link>.</p>
    </>
  );
}
