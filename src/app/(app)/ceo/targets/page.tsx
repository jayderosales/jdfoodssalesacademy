import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/utils";
import { saveTargets } from "../actions";
import { peso } from "../parts";

export const metadata = { title: "CEO reports: targets" };

export default async function CeoTargets({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("ceo.reports.view");
  const sp = await searchParams;
  const today = manilaToday();
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number(today.slice(0, 4));
  const repMonth = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? `${sp.month}-01` : `${today.slice(0, 7)}-01`;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  const supabase = await createClient();
  const [{ data: targets }, { data: reps }, { data: actual }] = await Promise.all([
    supabase.from("sales_targets").select("month, rep_id, amount").or(`month.gte.${year}-01-01,month.eq.${repMonth}`),
    supabase.rpc("ceo_rep_performance"),
    supabase.rpc("ceo_sales_daily", { p_from: `${year}-01-01`, p_to: `${year}-12-31` }),
  ]);
  const ts = (targets as { month: string; rep_id: string | null; amount: string }[] | null) ?? [];
  const company = (m: string) => ts.find((t) => t.month === m && !t.rep_id)?.amount ?? "";
  const repT = (id: string) => ts.find((t) => t.month === repMonth && t.rep_id === id)?.amount ?? "";
  const byMonth = new Map<string, number>();
  for (const d of (actual as { day: string; sales: string }[] | null) ?? []) byMonth.set(`${d.day.slice(0, 7)}-01`, (byMonth.get(`${d.day.slice(0, 7)}-01`) ?? 0) + Number(d.sales));
  const repRows = (reps as { user_id: string; full_name: string; sales_mtd: string }[] | null) ?? [];
  const mName = (m: string) => new Date(`${m}T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const yearTarget = months.reduce((s, m) => s + Number(company(m) || 0), 0);
  const yearActual = [...byMonth.values()].reduce((s, v) => s + v, 0);

  return (
    <>
      <PageHeader title="Sales targets" description="Monthly sales targets for the company and for each rep. Used for 'sales versus target' in the reports and the morning summary." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <CardTitle>Company targets {year}</CardTitle>
            <span className="text-sm"><Link href={`/ceo/targets?year=${year - 1}`} className="underline">{year - 1}</Link> · <Link href={`/ceo/targets?year=${year + 1}`} className="underline">{year + 1}</Link></span>
          </div>
          <ActionForm action={saveTargets} submitLabel="Save company targets">
            <Table>
              <thead><tr><Th>Month</Th><Th>Target (₱, incl. VAT)</Th><Th className="text-right">Actual</Th><Th className="text-right">%</Th></tr></thead>
              <tbody>
                {months.map((m) => {
                  const t = Number(company(m) || 0);
                  const a = byMonth.get(m) ?? 0;
                  return (
                    <tr key={m}>
                      <Td>{mName(m)}</Td>
                      <Td><Input name={`t:${m}:company`} defaultValue={company(m) ? Number(company(m)).toFixed(2) : ""} inputMode="decimal" className="h-8 w-36" aria-label={`Target ${mName(m)}`} /></Td>
                      <Td className="text-right tabular-nums">{a ? peso(a) : "—"}</Td>
                      <Td className={`text-right ${t && a >= t ? "text-success" : ""}`}>{t ? `${Math.round((a / t) * 100)}%` : ""}</Td>
                    </tr>
                  );
                })}
                <tr className="font-semibold"><Td>Year</Td><Td>{yearTarget ? peso(yearTarget) : "—"}</Td><Td className="text-right">{peso(yearActual)}</Td><Td className="text-right">{yearTarget ? `${Math.round((yearActual / yearTarget) * 100)}%` : ""}</Td></tr>
              </tbody>
            </Table>
            <p className="text-xs text-muted-foreground">Leave a month blank for no target. Sales are counted when orders are released for delivery.</p>
          </ActionForm>
        </Card>
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Rep targets: {mName(repMonth)}</CardTitle>
            <form className="flex items-center gap-1 text-sm" action="/ceo/targets">
              <input type="hidden" name="year" value={year} />
              <Input name="month" type="month" defaultValue={repMonth.slice(0, 7)} className="h-8" aria-label="Month" />
              <button className="h-8 rounded-lg border px-2">Show</button>
            </form>
          </div>
          {repRows.length === 0 ? <p className="text-sm text-muted-foreground">No active sales reps yet.</p> : (
            <ActionForm action={saveTargets} submitLabel="Save rep targets">
              <Table>
                <thead><tr><Th>Rep</Th><Th>Target (₱)</Th>{repMonth === `${today.slice(0, 7)}-01` && <Th className="text-right">Sold so far</Th>}</tr></thead>
                <tbody>
                  {repRows.map((r) => (
                    <tr key={r.user_id}>
                      <Td>{r.full_name}</Td>
                      <Td><Input name={`t:${repMonth}:${r.user_id}`} defaultValue={repT(r.user_id) ? Number(repT(r.user_id)).toFixed(2) : ""} inputMode="decimal" className="h-8 w-36" aria-label={`Target for ${r.full_name}`} /></Td>
                      {repMonth === `${today.slice(0, 7)}-01` && <Td className="text-right tabular-nums">{peso(r.sales_mtd)}</Td>}
                    </tr>
                  ))}
                </tbody>
              </Table>
              <p className="text-xs text-muted-foreground">Reps can see their own target. Rep targets don&apos;t have to add up to the company target (shop and office sales have no rep).</p>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
