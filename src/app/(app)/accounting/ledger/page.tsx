import Link from "next/link";
import { Card, CardTitle, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney, fromCentavos, toCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { accounts, BooksBanner, monthStart, SOURCE_LABEL, sourceHref } from "../parts";

export const metadata = { title: "General ledger" };

type Row = { id: string; debit: string; credit: string; description: string; journal_entries: { id: string; number: string; entry_date: string; source: string; source_table: string; source_id: string; memo: string; is_test: boolean } };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["accounting.view", "finance.reports.view"]);
  const sp = await searchParams;
  const accs = await accounts({ postingOnly: false });
  const acc = accs.find((a) => a.code === sp.account) ?? null;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : monthStart();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : manilaToday();
  const supabase = await createClient();

  let opening = 0n;
  let rows: Row[] = [];
  if (acc) {
    const [{ data: tb }, { data: within }] = await Promise.all([
      supabase.rpc("trial_balance", { p_from: from, p_to: to }),
      supabase.from("journal_lines").select("id, debit, credit, description, journal_entries!inner(id, number, entry_date, source, source_table, source_id, memo, is_test, status)").eq("account_id", acc.id).eq("journal_entries.status", "posted").gte("journal_entries.entry_date", from).lte("journal_entries.entry_date", to).limit(2000),
    ]);
    const o = ((tb as { account_id: string; opening: string }[] | null) ?? []).find((x) => x.account_id === acc.id)?.opening;
    if (o) opening = String(o).startsWith("-") ? -toCentavos(String(o).slice(1)) : toCentavos(String(o));
    rows = ((within as unknown as Row[] | null) ?? []).sort((a, b) => a.journal_entries.entry_date.localeCompare(b.journal_entries.entry_date) || a.journal_entries.number.localeCompare(b.journal_entries.number));
  }
  // credit-normal accounts show balances as positive credits
  const creditNormal = acc ? ["liability", "equity", "income"].includes(acc.type) : false;
  const show = (c: bigint) => formatMoney(fromCentavos(creditNormal ? -c : c));
  let bal = opening;

  return (
    <>
      <PageHeader title="General ledger" description="Every posted line for one account, with a running balance. Click an entry to see the whole journal, or the source to see the document." />
      <BooksBanner />
      <form className="mb-3 flex flex-wrap items-end gap-2 text-sm" action="/accounting/ledger">
        <label className="text-xs">Account
          <Select name="account" defaultValue={acc?.code ?? ""} className="h-9 w-72">
            <option value="">Choose an account…</option>
            {accs.filter((a) => !a.is_header).map((a) => <option key={a.id} value={a.code}>{a.code} {a.name}{a.active ? "" : " (inactive)"}</option>)}
          </Select>
        </label>
        <label className="text-xs">From<Input name="from" type="date" defaultValue={from} className="h-9" /></label>
        <label className="text-xs">To<Input name="to" type="date" defaultValue={to} className="h-9" /></label>
        <button className="h-9 rounded-lg border px-3">Show</button>
      </form>
      {acc ? (
        <Card>
          <CardTitle>{acc.code} {acc.name} · {formatDate(from)} – {formatDate(to)}</CardTitle>
          <Table>
            <thead><tr><Th>Date</Th><Th>Entry</Th><Th>Description</Th><Th className="text-right">Debit</Th><Th className="text-right">Credit</Th><Th className="text-right">Balance{creditNormal ? " (Cr)" : ""}</Th></tr></thead>
            <tbody>
              <tr className="bg-muted/40"><Td colSpan={5} className="font-medium">Opening balance</Td><Td className="text-right tabular-nums">{show(opening)}</Td></tr>
              {rows.map((r) => {
                bal += toCentavos(r.debit) - toCentavos(r.credit);
                const j = r.journal_entries;
                const src = j.source_table && j.source_id ? sourceHref(j.source_table, j.source_id) : null;
                return (
                  <tr key={r.id}>
                    <Td>{formatDate(j.entry_date)}</Td>
                    <Td><Link href={`/accounting/journals/${j.id}`} className="text-brand underline">{j.number}</Link>{j.is_test && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">test</span>}<div className="text-xs text-muted-foreground">{src ? <Link href={src} className="underline">{SOURCE_LABEL[j.source]}</Link> : SOURCE_LABEL[j.source]}</div></Td>
                    <Td className="max-w-sm">{r.description || j.memo}</Td>
                    <Td className="text-right tabular-nums">{Number(r.debit) ? formatMoney(r.debit) : ""}</Td>
                    <Td className="text-right tabular-nums">{Number(r.credit) ? formatMoney(r.credit) : ""}</Td>
                    <Td className="text-right tabular-nums">{show(bal)}</Td>
                  </tr>
                );
              })}
              <tr className="font-bold"><Td colSpan={5}>Closing balance</Td><Td className="text-right tabular-nums">{show(bal)}</Td></tr>
            </tbody>
          </Table>
          {rows.length === 2000 && <p className="mt-2 text-sm text-amber-700">Showing the first 2,000 lines. Narrow the dates to see the rest.</p>}
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Choose an account to see its entries. Or start from a <Link href="/accounting/reports?r=tb" className="underline">trial balance</Link>.</p>
      )}
    </>
  );
}
