import Link from "next/link";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { BUCKETS, totals } from "@/lib/accounting/aging";
import { loadPayables } from "@/lib/accounting/open-items";
import { formatMoney, fromCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { AgingTable, PAY_STATUS } from "../../accounting/parts";
import { addDays, Tile } from "../parts";

export const metadata = { title: "CEO reports: payables" };

const LABEL: Record<string, string> = { current: "Not yet due", "1-30": "1–30 days late", "31-60": "31–60 days late", "61-90": "61–90 days late", "90+": "Over 90 days late" };

export default async function CeoPayables() {
  await requirePermission("ceo.reports.view");
  const supabase = await createClient();
  const today = manilaToday();
  const [{ rows, names }, { data: pays }] = await Promise.all([
    loadPayables(supabase, today),
    supabase.from("supplier_payments").select("id, number, pay_date, status, net_paid, suppliers(name)").in("status", ["submitted", "approved"]).order("pay_date"),
  ]);
  const t = totals(rows);
  const m = (c: bigint) => formatMoney(fromCentavos(c));
  const week = addDays(today, 7);
  const items = rows.flatMap((r) => r.items.map((i) => ({ ...i, supplier: names.get(r.party) ?? "?" })));
  const dueSoon = items.filter((i) => i.due <= week).sort((a, b) => a.due.localeCompare(b.due));
  const dueSoonTotal = dueSoon.reduce((s, i) => s + i.open, 0n);
  const inProgress = (pays as unknown as { id: string; number: string; pay_date: string; status: string; net_paid: string; suppliers: { name: string } | null }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Payables report" description="What we owe suppliers, what's due this week, and payments waiting for you or for release." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="We owe suppliers" value={m(t.total)} />
        <Tile label="Overdue" value={m(t.total - t.buckets.current)} tone={t.total - t.buckets.current > 0n ? "bad" : "good"} />
        <Tile label="Due within 7 days (incl. overdue)" value={m(dueSoonTotal)} tone={dueSoonTotal > 0n ? "warn" : "default"} />
        <Tile label="Payments in progress" value={inProgress.length} sub={formatMoney(inProgress.reduce((s, p) => s + Number(p.net_paid), 0).toFixed(2))} href="/accounting/payables" />
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
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Due within 7 days</CardTitle>
          {dueSoon.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due this week.</p> : (
            <Table>
              <thead><tr><Th>Due</Th><Th>Supplier</Th><Th>Invoice</Th><Th className="text-right">Open</Th></tr></thead>
              <tbody>
                {dueSoon.map((i) => (
                  <tr key={i.key}>
                    <Td className={i.due < today ? "font-semibold text-danger" : ""}>{formatDate(i.due)}</Td>
                    <Td>{i.supplier}</Td>
                    <Td>{i.key.startsWith("opening:") ? i.label : <Link href={`/procurement/invoices/${i.key}`} className="underline">{i.label}</Link>}</Td>
                    <Td className="text-right tabular-nums">{m(i.open)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardTitle>Payments waiting for approval or release</CardTitle>
          {inProgress.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
            <Table>
              <thead><tr><Th>Payment</Th><Th>Supplier</Th><Th>Status</Th><Th className="text-right">Amount</Th></tr></thead>
              <tbody>
                {inProgress.map((p) => (
                  <tr key={p.id}>
                    <Td><Link href={`/accounting/payables/${p.id}`} className="underline">{p.number}</Link></Td>
                    <Td>{p.suppliers?.name}</Td>
                    <Td>{PAY_STATUS[p.status]}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(p.net_paid)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      <Card>
        <CardTitle>By supplier</CardTitle>
        {rows.length ? <AgingTable rows={rows} names={names} partyHref={(p) => `/procurement/suppliers/${p}`} itemHref={(k) => (k.startsWith("opening:") ? null : `/procurement/invoices/${k}`)} /> : <p className="text-sm text-muted-foreground">No supplier invoices are waiting to be paid.</p>}
      </Card>
    </>
  );
}
