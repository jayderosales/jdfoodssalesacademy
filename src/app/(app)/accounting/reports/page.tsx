import Link from "next/link";
import { Card, CardTitle, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { BooksBanner, monthStart } from "../parts";

export const metadata = { title: "Financial reports" };

type Tb = { account_id: string; code: string; name: string; type: string; subtype: string; opening: string; debit: string; credit: string; closing: string };
const REPORTS = [["pl", "Profit and loss"], ["bs", "Balance sheet"], ["tb", "Trial balance"], ["vat", "VAT"], ["ewt", "Withholding tax (2307)"]] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("finance.reports.view");
  const sp = await searchParams;
  const r = REPORTS.find(([k]) => k === sp.r)?.[0] ?? "pl";
  const today = manilaToday();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : monthStart();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
  const official = sp.official === "1";
  const supabase = await createClient();
  const m = (n: number) => formatMoney(n.toFixed(2));
  const ledger = (code: string) => `/accounting/ledger?account=${code}&from=${from}&to=${to}`;

  let body: React.ReactNode = null;
  if (r === "pl" || r === "bs" || r === "tb") {
    const { data } = await supabase.rpc("trial_balance", { p_from: r === "bs" ? "1900-01-01" : from, p_to: to, p_official: official });
    const tb = ((data as Tb[] | null) ?? []).filter((x) => Number(x.opening) || Number(x.debit) || Number(x.credit) || Number(x.closing));
    if (r === "tb") {
      const dr = tb.reduce((s, x) => s + Math.max(Number(x.closing), 0), 0);
      const cr = tb.reduce((s, x) => s + Math.max(-Number(x.closing), 0), 0);
      body = (
        <Table>
          <thead><tr><Th>Account</Th><Th className="text-right">Opening</Th><Th className="text-right">Debit</Th><Th className="text-right">Credit</Th><Th className="text-right">Closing Dr</Th><Th className="text-right">Closing Cr</Th></tr></thead>
          <tbody>
            {tb.map((x) => (
              <tr key={x.account_id}>
                <Td><Link href={ledger(x.code)} className="text-brand underline">{x.code}</Link> {x.name}</Td>
                <Td className="text-right tabular-nums">{m(Number(x.opening))}</Td>
                <Td className="text-right tabular-nums">{m(Number(x.debit))}</Td>
                <Td className="text-right tabular-nums">{m(Number(x.credit))}</Td>
                <Td className="text-right tabular-nums">{Number(x.closing) > 0 ? m(Number(x.closing)) : ""}</Td>
                <Td className="text-right tabular-nums">{Number(x.closing) < 0 ? m(-Number(x.closing)) : ""}</Td>
              </tr>
            ))}
            <tr className="font-bold"><Td>Total</Td><Td /><Td /><Td /><Td className="text-right">{m(dr)}</Td><Td className="text-right">{m(cr)}</Td></tr>
          </tbody>
        </Table>
      );
      if (Math.abs(dr - cr) > 0.004) body = <><p className="mb-2 font-semibold text-danger">The trial balance doesn&apos;t balance by {m(dr - cr)}. Contact support.</p>{body}</>;
    } else if (r === "pl") {
      const group = (label: string, f: (x: Tb) => boolean, sign: 1 | -1) => {
        const rows = tb.filter(f);
        const total = rows.reduce((s, x) => s + sign * (Number(x.credit) - Number(x.debit)), 0);
        return { label, rows, total, sign };
      };
      const sales = group("Revenue", (x) => x.type === "income" && x.subtype === "sales", 1);
      const cos = group("Cost of sales", (x) => x.subtype === "cost_of_sales", -1);
      const opex = group("Operating expenses", (x) => x.type === "expense" && x.subtype !== "cost_of_sales", -1);
      const other = group("Other income", (x) => x.type === "income" && x.subtype !== "sales", 1);
      const gp = sales.total - cos.total;
      const net = gp - opex.total + other.total;
      const section = (g: ReturnType<typeof group>) => (
        <>
          <tr className="bg-muted/50"><Td className="font-semibold">{g.label}</Td><Td /></tr>
          {g.rows.map((x) => <tr key={x.account_id}><Td className="pl-6"><Link href={ledger(x.code)} className="underline">{x.code}</Link> {x.name}</Td><Td className="text-right tabular-nums">{m(g.sign * (Number(x.credit) - Number(x.debit)))}</Td></tr>)}
          <tr><Td className="font-medium">Total {g.label.toLowerCase()}</Td><Td className="text-right font-medium tabular-nums">{m(g.total)}</Td></tr>
        </>
      );
      body = (
        <Table>
          <tbody>
            {section(sales)}
            {section(cos)}
            <tr className="font-bold"><Td>Gross profit{sales.total ? ` (${Math.round((gp / sales.total) * 100)}%)` : ""}</Td><Td className="text-right tabular-nums">{m(gp)}</Td></tr>
            {section(opex)}
            {section(other)}
            <tr className="text-lg font-bold"><Td>Net income</Td><Td className={`text-right tabular-nums ${net < 0 ? "text-danger" : ""}`}>{m(net)}</Td></tr>
          </tbody>
        </Table>
      );
    } else {
      const bal = (x: Tb) => Number(x.closing);
      const assets = tb.filter((x) => x.type === "asset");
      const liab = tb.filter((x) => x.type === "liability");
      const eq = tb.filter((x) => x.type === "equity");
      const profit = tb.filter((x) => x.type === "income" || x.type === "expense").reduce((s, x) => s - bal(x), 0);
      const ta = assets.reduce((s, x) => s + bal(x), 0);
      const tl = liab.reduce((s, x) => s - bal(x), 0);
      const te = eq.reduce((s, x) => s - bal(x), 0) + profit;
      const rows = (list: Tb[], sign: 1 | -1) => list.map((x) => <tr key={x.account_id}><Td className="pl-6"><Link href={ledger(x.code)} className="underline">{x.code}</Link> {x.name}</Td><Td className="text-right tabular-nums">{m(sign * bal(x))}</Td></tr>);
      body = (
        <Table>
          <tbody>
            <tr className="bg-muted/50"><Td className="font-semibold">Assets</Td><Td /></tr>
            {rows(assets, 1)}
            <tr className="font-bold"><Td>Total assets</Td><Td className="text-right">{m(ta)}</Td></tr>
            <tr className="bg-muted/50"><Td className="font-semibold">Liabilities</Td><Td /></tr>
            {rows(liab, -1)}
            <tr className="font-medium"><Td>Total liabilities</Td><Td className="text-right">{m(tl)}</Td></tr>
            <tr className="bg-muted/50"><Td className="font-semibold">Equity</Td><Td /></tr>
            {rows(eq, -1)}
            <tr><Td className="pl-6">Profit not yet closed to retained earnings</Td><Td className="text-right">{m(profit)}</Td></tr>
            <tr className="font-medium"><Td>Total equity</Td><Td className="text-right">{m(te)}</Td></tr>
            <tr className="font-bold"><Td>Liabilities + equity</Td><Td className={`text-right ${Math.abs(ta - tl - te) > 0.004 ? "text-danger" : ""}`}>{m(tl + te)}</Td></tr>
          </tbody>
        </Table>
      );
    }
  } else if (r === "vat") {
    const { data } = await supabase.from("vat_summary").select("*").order("month", { ascending: false }).limit(24);
    const rows = (data as { month: string; output_vat: string; input_vat: string; includes_test: boolean }[] | null) ?? [];
    body = (
      <>
        <p className="mb-2 text-sm text-muted-foreground">From the ledger: output VAT on sales minus input VAT on purchases. Use this to prepare the monthly/quarterly VAT returns (the accountant confirms the figures).</p>
        <Table>
          <thead><tr><Th>Month</Th><Th className="text-right">Output VAT</Th><Th className="text-right">Input VAT</Th><Th className="text-right">VAT payable</Th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.month}>
                <Td>{new Date(x.month).toLocaleDateString("en-PH", { month: "long", year: "numeric" })}{x.includes_test ? " (test)" : ""}</Td>
                <Td className="text-right tabular-nums"><Link href={`/accounting/ledger?account=2100&from=${x.month}`} className="underline">{m(Number(x.output_vat))}</Link></Td>
                <Td className="text-right tabular-nums"><Link href={`/accounting/ledger?account=1300&from=${x.month}`} className="underline">{m(Number(x.input_vat))}</Link></Td>
                <Td className="text-right font-semibold tabular-nums">{m(Number(x.output_vat) - Number(x.input_vat))}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No VAT postings yet.</p>}
      </>
    );
  } else {
    const { data } = await supabase.from("ewt_withheld").select("*").gte("pay_date", from).lte("pay_date", to).order("pay_date");
    const rows = (data as { payment_id: string; number: string; pay_date: string; supplier: string; tin: string; ewt_rate: string; gross: string; ewt_amount: string; net_paid: string }[] | null) ?? [];
    body = (
      <>
        <p className="mb-2 text-sm text-muted-foreground">Tax withheld from supplier payments: the data for BIR Form 2307 and the monthly remittance. Rates are per supplier (needs the accountant&apos;s confirmation).</p>
        <Table>
          <thead><tr><Th>Date</Th><Th>Supplier</Th><Th>TIN</Th><Th className="text-right">Rate</Th><Th className="text-right">Paid (gross)</Th><Th className="text-right">Withheld</Th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.payment_id}>
                <Td>{formatDate(x.pay_date)}<div className="text-xs"><Link href={`/accounting/payables/${x.payment_id}`} className="underline">{x.number}</Link></div></Td>
                <Td>{x.supplier}</Td><Td>{x.tin || "—"}</Td><Td className="text-right">{Number(x.ewt_rate)}%</Td>
                <Td className="text-right tabular-nums">{m(Number(x.gross))}</Td><Td className="text-right tabular-nums">{m(Number(x.ewt_amount))}</Td>
              </tr>
            ))}
            <tr className="font-bold"><Td colSpan={5}>Total withheld</Td><Td className="text-right">{m(rows.reduce((s, x) => s + Number(x.ewt_amount), 0))}</Td></tr>
          </tbody>
        </Table>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Financial reports" description="Straight from the ledger. Click an account to see every entry behind it." />
      <BooksBanner />
      <div className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        {REPORTS.map(([k, l]) => <Link key={k} href={`/accounting/reports?r=${k}&from=${from}&to=${to}`} className={`rounded-full border px-3 py-1 ${k === r ? "border-brand bg-brand text-white" : "hover:bg-muted"}`}>{l}</Link>)}
        <form className="ml-auto flex flex-wrap items-end gap-2" action="/accounting/reports">
          <input type="hidden" name="r" value={r} />
          {r !== "bs" && r !== "vat" && <label className="text-xs">From<Input name="from" type="date" defaultValue={from} className="h-8" /></label>}
          {r !== "vat" && <label className="text-xs">{r === "bs" ? "As of" : "To"}<Input name="to" type="date" defaultValue={to} className="h-8" /></label>}
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="official" value="1" defaultChecked={official} /> Official only</label>
          <button className="h-8 rounded-lg border px-3">Show</button>
        </form>
      </div>
      <Card>
        <CardTitle>{REPORTS.find(([k]) => k === r)?.[1]} {r === "bs" ? `as of ${formatDate(to)}` : r === "vat" ? "" : `· ${formatDate(from)} – ${formatDate(to)}`}</CardTitle>
        {body}
      </Card>
    </>
  );
}
