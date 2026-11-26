import Link from "next/link";
import { Card, CardTitle, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { loadSnapshot } from "../data";
import { addDays, DailyBars, Delta, isoOr, monthStartOf, peso, ShareBars, TargetBar, Tile, yearStartOf } from "../parts";

export const metadata = { title: "CEO reports: sales" };

type Row = { key: string; label: string; orders: number; qty: string; amount: string };
const DIMS = [["channel", "By channel"], ["brand", "By brand"], ["rep", "By sales rep"], ["customer", "Top customers"], ["product", "Top products"]] as const;

export default async function CeoSales({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("ceo.reports.view");
  const sp = await searchParams;
  const s = await loadSnapshot();
  const today = s.today;
  const preset = sp.range === "ytd" ? [yearStartOf(today), today] : sp.range === "30" ? [addDays(today, -29), today] : [monthStartOf(today), today];
  const from = isoOr(sp.from, preset[0]);
  const to = isoOr(sp.to, preset[1]);
  const supabase = await createClient();
  const [daily, ...breakdowns] = await Promise.all([
    supabase.rpc("ceo_sales_daily", { p_from: from, p_to: to }),
    ...DIMS.map(([d]) => supabase.rpc("ceo_sales_breakdown", { p_from: from, p_to: to, p_dim: d, p_limit: d === "customer" || d === "product" ? 10 : 50 })),
  ]);
  const days = ((daily.data as { day: string; orders: number; sales: string; collected: string }[] | null) ?? []);
  const n = (v: string | number | null | undefined) => Number(v ?? 0);
  const total = days.reduce((a, d) => a + n(d.sales), 0);
  const orders = days.reduce((a, d) => a + Number(d.orders), 0);
  const collected = days.reduce((a, d) => a + n(d.collected), 0);
  const pace = (s.target.day_of_month / s.target.days_in_month) * 100;
  const drill: Record<string, (k: string) => string | null> = {
    customer: (k) => `/sales/customers/${k}`,
    product: () => null,
    rep: () => null,
    channel: () => null,
    brand: () => null,
  };

  return (
    <>
      <PageHeader title="Sales" description="Counted when an order is released for delivery (Ready for pickup). Amounts include VAT, as invoiced." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Today" value={peso(s.sales.today)} sub={`${s.sales.orders_today} orders · yesterday ${peso(s.sales.yesterday)}`} />
        <Tile label="Month to date" value={peso(s.sales.mtd)} sub={<Delta now={n(s.sales.mtd)} before={n(s.sales.last_month_same_days)} label="same days last month" />} />
        <Tile label="Year to date" value={peso(s.sales.ytd)} sub={`${s.sales.orders_ytd} orders`} />
        <Tile label="Last month (full)" value={peso(s.sales.last_month)} />
      </div>
      <Card className="mb-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div><CardTitle>This month vs target</CardTitle><TargetBar actual={n(s.sales.mtd)} target={s.target.month ? n(s.target.month) : null} pace={pace} /></div>
          <div><CardTitle>Year to date vs target</CardTitle><TargetBar actual={n(s.sales.ytd)} target={s.target.ytd ? n(s.target.ytd) : null} /></div>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        {[["", "This month"], ["30", "Last 30 days"], ["ytd", "Year to date"]].map(([k, l]) => (
          <Link key={k} href={k ? `/ceo/sales?range=${k}` : "/ceo/sales"} className={`rounded-full border px-3 py-1 ${(sp.range ?? "") === k && !sp.from ? "border-brand bg-brand text-white" : "hover:bg-muted"}`}>{l}</Link>
        ))}
        <form className="ml-auto flex flex-wrap items-end gap-2" action="/ceo/sales">
          <label className="text-xs">From<Input name="from" type="date" defaultValue={from} className="h-8" /></label>
          <label className="text-xs">To<Input name="to" type="date" defaultValue={to} className="h-8" /></label>
          <button className="h-8 rounded-lg border px-3">Show</button>
        </form>
      </div>

      <Card className="mb-4">
        <CardTitle>{formatDate(from)} – {formatDate(to)}: {peso(total)} · {orders} orders · collected {peso(collected)}</CardTitle>
        <DailyBars days={days.map((d) => ({ day: d.day, value: n(d.sales), sub: `${d.orders} orders · collected ${peso(d.collected)}` }))} title="Daily sales" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {DIMS.map(([d, label], i) => {
          const rows = ((breakdowns[i].data as Row[] | null) ?? []).map((r) => ({ key: r.key, label: r.label, amount: n(r.amount), sub: d === "product" ? `${Number(r.qty).toLocaleString("en-PH")} units` : `${r.orders} orders` }));
          return (
            <Card key={d} className={d === "product" ? "lg:col-span-2" : ""}>
              <CardTitle>{label}</CardTitle>
              {d === "product" ? (
                <Table>
                  <thead><tr><Th>Product</Th><Th className="text-right">Units</Th><Th className="text-right">Sales</Th></tr></thead>
                  <tbody>{((breakdowns[i].data as Row[] | null) ?? []).map((r) => <tr key={r.key}><Td>{r.label}</Td><Td className="text-right tabular-nums">{Number(r.qty).toLocaleString("en-PH")}</Td><Td className="text-right tabular-nums">{peso(r.amount)}</Td></tr>)}</tbody>
                </Table>
              ) : (
                <ShareBars rows={rows} href={drill[d]} />
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
