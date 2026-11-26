import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { createProductionReport } from "./actions";

export const metadata = { title: "Daily production" };

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const qty = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

type Line = { qty: string; unit_code: string; products: { sku: string; name: string } | null; production_reports: { report_date: string } };

export default async function ManufacturingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["production.report", "production.view", "readonly.all"]);
  const me = await requireUser();
  const access = await getAccess();
  const sp = await searchParams;
  const today = manilaToday();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : addDays(today, -6);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
  const supabase = await createClient();
  const [{ data: reports }, { data: lines }, { data: locs }] = await Promise.all([
    supabase.from("production_reports").select("id, number, report_date, shift, status, created_by, submitted_at, locations(name), profiles:created_by(full_name), production_report_lines(count)").gte("report_date", from).lte("report_date", to).order("report_date", { ascending: false }).order("number", { ascending: false }).limit(300),
    supabase.from("production_report_lines").select("qty, unit_code, products(sku, name), production_reports!inner(report_date, status)").eq("production_reports.status", "submitted").gte("production_reports.report_date", from).lte("production_reports.report_date", to).limit(5000),
    supabase.from("locations").select("id, name, type").in("type", ["plant", "warehouse"]).eq("active", true).order("type").order("name"),
  ]);
  type R = { id: string; number: string; report_date: string; shift: string; status: string; created_by: string; locations: { name: string } | null; profiles: { full_name: string } | null; production_report_lines: { count: number }[] };
  const rows = (reports as unknown as R[] | null) ?? [];
  const ls = (lines as unknown as Line[] | null) ?? [];
  // output by product and unit over the range, plus today's
  const byProduct = new Map<string, { sku: string; name: string; unit: string; total: number; today: number }>();
  for (const l of ls) {
    const key = `${l.products?.sku}|${l.unit_code}`;
    const e = byProduct.get(key) ?? { sku: l.products?.sku ?? "?", name: l.products?.name ?? "", unit: l.unit_code, total: 0, today: 0 };
    e.total += Number(l.qty);
    if (l.production_reports.report_date === today) e.today += Number(l.qty);
    byProduct.set(key, e);
  }
  const summary = [...byProduct.values()].sort((a, b) => b.total - a.total);
  const todayLots = ls.filter((l) => l.production_reports.report_date === today).length;
  const drafts = rows.filter((r) => r.status === "draft" && r.created_by === me.id);
  const canReport = can(access, "production.report");
  const locations = (locs as { id: string; name: string; type: string }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Daily production" description="What was made each day: product, quantity and lot. Submit the report at the end of the shift; it's locked after that." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Lots reported today" value={todayLots} />
        <KpiCard label={`Products made ${from === addDays(today, -6) && to === today ? "in the last 7 days" : "in this period"}`} value={summary.length} />
        <KpiCard label="Your unsubmitted reports" value={drafts.length} tone={drafts.length ? "warning" : "default"} hint={drafts.length ? "Submit before the end of the day" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Output {formatDate(from)} – {formatDate(to)}</CardTitle>
            <form className="mb-3 flex flex-wrap items-end gap-2 text-sm" action="/manufacturing">
              <label className="text-xs">From<Input name="from" type="date" defaultValue={from} className="h-9" /></label>
              <label className="text-xs">To<Input name="to" type="date" defaultValue={to} className="h-9" /></label>
              <button className="h-9 rounded-lg border px-3">Show</button>
            </form>
            {summary.length === 0 ? <p className="text-sm text-muted-foreground">No submitted production in this period.</p> : (
              <Table>
                <thead><tr><Th>Product</Th><Th className="text-right">Today</Th><Th className="text-right">Period total</Th></tr></thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={`${s.sku}|${s.unit}`}>
                      <Td><b>{s.sku}</b> <span className="text-muted-foreground">{s.name}</span></Td>
                      <Td className="text-right tabular-nums">{s.today ? `${qty(s.today)} ${s.unit}` : "—"}</Td>
                      <Td className="text-right tabular-nums">{qty(s.total)} {s.unit}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardTitle>Reports</CardTitle>
            <Table>
              <thead><tr><Th>Report</Th><Th>Date</Th><Th>Where</Th><Th>By</Th><Th className="text-right">Lots</Th><Th>Status</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td><Link href={`/manufacturing/reports/${r.id}`} className="font-medium text-brand underline">{r.number}</Link>{r.shift && <div className="text-xs text-muted-foreground">{r.shift}</div>}</Td>
                    <Td>{formatDate(r.report_date)}</Td>
                    <Td>{r.locations?.name}</Td>
                    <Td>{r.profiles?.full_name}</Td>
                    <Td className="text-right">{r.production_report_lines?.[0]?.count ?? 0}</Td>
                    <Td className={r.status === "draft" ? "text-amber-700" : "text-success"}>{r.status === "draft" ? "Not submitted" : "Submitted"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No reports in this period.</p>}
          </Card>
        </div>
        {canReport && (
          <div className="space-y-4">
            <Card>
              <CardTitle>Start today&apos;s report</CardTitle>
              {locations.length === 0 ? <p className="text-sm text-muted-foreground">Add a plant location first (Admin → Organization).</p> : (
                <ActionForm action={createProductionReport} submitLabel="Start report">
                  <Field label="Production date" htmlFor="report_date"><Input id="report_date" name="report_date" type="date" defaultValue={today} max={today} required /></Field>
                  <Field label="Where it was made" htmlFor="location_id">
                    <Select id="location_id" name="location_id" defaultValue={locations[0].id}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
                  </Field>
                  <Field label="Shift / line (optional)" htmlFor="shift"><Input id="shift" name="shift" placeholder="e.g. Day shift, Line 1" /></Field>
                </ActionForm>
              )}
            </Card>
            {drafts.length > 0 && (
              <Card>
                <CardTitle>Not yet submitted</CardTitle>
                <ul className="space-y-1 text-sm">{drafts.map((d) => <li key={d.id}><Link href={`/manufacturing/reports/${d.id}`} className="text-brand underline">{d.number}</Link> · {formatDate(d.report_date)}</li>)}</ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
