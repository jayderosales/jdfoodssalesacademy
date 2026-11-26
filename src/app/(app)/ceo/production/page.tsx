import Link from "next/link";
import { Card, CardTitle, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { addDays, isoOr, Tile } from "../parts";

export const metadata = { title: "CEO reports: production" };

type L = { qty: string; unit_code: string; lot_no: string; expiry_date: string | null; products: { sku: string; name: string } | null; production_reports: { id: string; number: string; report_date: string; shift: string; status: string; locations: { name: string } | null; profiles: { full_name: string } | null } };

export default async function CeoProduction({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("ceo.reports.view");
  const sp = await searchParams;
  const today = manilaToday();
  const day = isoOr(sp.date, today);
  const weekFrom = addDays(day, -6);
  const supabase = await createClient();
  const [{ data: lines }, { data: reports }] = await Promise.all([
    supabase.from("production_report_lines").select("qty, unit_code, lot_no, expiry_date, products(sku, name), production_reports!inner(id, number, report_date, shift, status, locations(name), profiles:created_by(full_name))").gte("production_reports.report_date", weekFrom).lte("production_reports.report_date", day).eq("production_reports.status", "submitted").limit(5000),
    supabase.from("production_reports").select("id, number, status, shift, profiles:created_by(full_name)").eq("report_date", day),
  ]);
  const all = (lines as unknown as L[] | null) ?? [];
  const todays = all.filter((l) => l.production_reports.report_date === day).sort((a, b) => (a.products?.sku ?? "").localeCompare(b.products?.sku ?? ""));
  const week = new Map<string, { sku: string; name: string; unit: string; byDay: Map<string, number>; total: number }>();
  for (const l of all) {
    const k = `${l.products?.sku}|${l.unit_code}`;
    const e = week.get(k) ?? { sku: l.products?.sku ?? "?", name: l.products?.name ?? "", unit: l.unit_code, byDay: new Map(), total: 0 };
    e.byDay.set(l.production_reports.report_date, (e.byDay.get(l.production_reports.report_date) ?? 0) + Number(l.qty));
    e.total += Number(l.qty);
    week.set(k, e);
  }
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i));
  const rs = (reports as unknown as { id: string; number: string; status: string; shift: string; profiles: { full_name: string } | null }[] | null) ?? [];
  const drafts = rs.filter((r) => r.status === "draft");
  const q = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

  return (
    <>
      <PageHeader title="Daily production report" description="What the plant produced, from the supervisors' submitted daily reports." />
      <form className="mb-3 flex flex-wrap items-end gap-2 text-sm" action="/ceo/production">
        <Link href={`/ceo/production?date=${addDays(day, -1)}`} className="h-9 rounded-lg border px-3 py-2">← Previous day</Link>
        <label className="text-xs">Date<Input name="date" type="date" defaultValue={day} max={today} className="h-9" /></label>
        <button className="h-9 rounded-lg border px-3">Show</button>
        {day < today && <Link href={`/ceo/production?date=${addDays(day, 1)}`} className="h-9 rounded-lg border px-3 py-2">Next day →</Link>}
      </form>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label={`Lots produced ${day === today ? "today" : formatDate(day)}`} value={todays.length} />
        <Tile label="Products made" value={new Set(todays.map((l) => l.products?.sku)).size} />
        <Tile label="Reports not yet submitted" value={drafts.length} tone={drafts.length ? "warn" : "default"} sub={drafts.map((d) => d.profiles?.full_name).filter(Boolean).join(", ") || undefined} />
      </div>
      <Card className="mb-4">
        <CardTitle>Produced on {formatDate(day)}</CardTitle>
        {todays.length === 0 ? <p className="text-sm text-muted-foreground">No submitted production for this day.</p> : (
          <Table>
            <thead><tr><Th>Product</Th><Th className="text-right">Quantity</Th><Th>Lot</Th><Th>Expiry</Th><Th>Report</Th></tr></thead>
            <tbody>
              {todays.map((l, i) => (
                <tr key={i}>
                  <Td><b>{l.products?.sku}</b> <span className="text-muted-foreground">{l.products?.name}</span></Td>
                  <Td className="text-right tabular-nums">{q(Number(l.qty))} {l.unit_code}</Td>
                  <Td className="font-mono">{l.lot_no}</Td>
                  <Td>{formatDate(l.expiry_date)}</Td>
                  <Td><Link href={`/manufacturing/reports/${l.production_reports.id}`} className="underline">{l.production_reports.number}</Link><div className="text-xs text-muted-foreground">{l.production_reports.locations?.name}{l.production_reports.shift ? ` · ${l.production_reports.shift}` : ""} · {l.production_reports.profiles?.full_name}</div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardTitle>Last 7 days by product</CardTitle>
        {week.size === 0 ? <p className="text-sm text-muted-foreground">No production in these 7 days.</p> : (
          <div className="overflow-x-auto">
            <Table>
              <thead><tr><Th>Product</Th>{dates.map((d) => <Th key={d} className="text-right">{new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", day: "numeric" })}</Th>)}<Th className="text-right">Total</Th></tr></thead>
              <tbody>
                {[...week.values()].sort((a, b) => b.total - a.total).map((e) => (
                  <tr key={`${e.sku}|${e.unit}`}>
                    <Td><b>{e.sku}</b> <span className="text-xs text-muted-foreground">{e.unit}</span></Td>
                    {dates.map((d) => <Td key={d} className="text-right tabular-nums">{e.byDay.get(d) ? q(e.byDay.get(d)!) : ""}</Td>)}
                    <Td className="text-right font-semibold tabular-nums">{q(e.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Production reports are records only for now; they don&apos;t change stock.</p>
    </>
  );
}
