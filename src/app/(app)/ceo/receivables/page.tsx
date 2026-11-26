import Link from "next/link";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { BUCKETS, totals } from "@/lib/accounting/aging";
import { loadReceivables } from "@/lib/accounting/open-items";
import { formatMoney, fromCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/utils";
import { AgingTable } from "../../accounting/parts";
import { Tile } from "../parts";

export const metadata = { title: "CEO reports: receivables" };

const LABEL: Record<string, string> = { current: "Not yet due", "1-30": "1–30 days late", "31-60": "31–60 days late", "61-90": "61–90 days late", "90+": "Over 90 days late" };

export default async function CeoReceivables() {
  await requirePermission("ceo.reports.view");
  const supabase = await createClient();
  const today = manilaToday();
  const { rows, names } = await loadReceivables(supabase, today);
  const t = totals(rows);
  const m = (c: bigint) => formatMoney(fromCentavos(c));
  const overdue = t.total - t.buckets.current;
  const { data: pend } = await supabase.from("payments").select("amount").eq("status", "pending");
  const pending = ((pend as { amount: string }[] | null) ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <PageHeader title="Receivables report" description="What customers owe and how late, as of today. Click a customer to see each unpaid order." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Customers owe us" value={m(t.total)} sub={`${rows.filter((r) => r.total > 0n).length} customers`} />
        <Tile label="Overdue" value={m(overdue)} tone={overdue > 0n ? "bad" : "good"} sub={t.total > 0n ? `${Number((overdue * 100n) / t.total)}% of the total` : undefined} />
        <Tile label="Over 90 days late" value={m(t.buckets["90+"])} tone={t.buckets["90+"] > 0n ? "bad" : "default"} />
        <Tile label="Payments waiting to confirm" value={formatMoney(pending.toFixed(2))} href="/sales/payments" />
      </div>
      <Card className="mb-4">
        <CardTitle>Aging summary</CardTitle>
        <div className="grid gap-2 sm:grid-cols-5">
          {BUCKETS.map((b) => (
            <div key={b} className="rounded-lg bg-muted/50 p-2 text-sm">
              <p className="text-xs text-muted-foreground">{LABEL[b]}</p>
              <p className={`font-semibold tabular-nums ${b !== "current" && t.buckets[b] > 0n ? "text-danger" : ""}`}>{m(t.buckets[b])}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardTitle>By customer (largest first)</CardTitle>
        {rows.length ? <AgingTable rows={rows} names={names} partyHref={(p) => `/sales/customers/${p}`} itemHref={(k) => (k.startsWith("opening:") ? null : `/sales/orders/${k}`)} /> : <p className="text-sm text-muted-foreground">No one owes us anything right now.</p>}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Same figures as <Link href="/accounting/receivables" className="underline">Accounting → Receivables</Link>.</p>
    </>
  );
}
