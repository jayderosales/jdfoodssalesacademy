import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { createJournal } from "../actions";
import { BooksBanner, SOURCE_LABEL } from "../parts";

export const metadata = { title: "Journal entries" };

const STATUS = ["draft", "submitted", "approved", "returned", "rejected", "posted"];

export default async function JournalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["accounting.view", "accounting.journals.create"]);
  const access = await getAccess();
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("journal_entries").select("id, number, entry_date, source, memo, status, is_test, total, reversal_of, reversed_by").order("entry_date", { ascending: false }).order("number", { ascending: false }).limit(200);
  if (sp.source && SOURCE_LABEL[sp.source]) q = q.eq("source", sp.source);
  if (sp.status && STATUS.includes(sp.status)) q = q.eq("status", sp.status);
  if (sp.q) q = q.or(`number.ilike.%${sp.q.replace(/[%,()]/g, "")}%,memo.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);
  const { data } = await q;
  const rows = (data as { id: string; number: string; entry_date: string; source: string; memo: string; status: string; is_test: boolean; total: string; reversal_of: string | null; reversed_by: string | null }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Journal entries" description="Automatic entries from sales, purchases, payments and stock, plus manual adjustments. Posted entries can't be edited, only reversed." />
      <BooksBanner />
      {can(access, "accounting.journals.create") && (
        <details className="mb-4 rounded-xl border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">New manual journal entry</summary>
          <ActionForm action={createJournal} submitLabel="Create draft" className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-end">
            <Field label="Date" htmlFor="entry_date"><Input id="entry_date" name="entry_date" type="date" defaultValue={manilaToday()} required /></Field>
            <Field label="What is it for?" htmlFor="memo"><Input id="memo" name="memo" placeholder="e.g. Accrue December rent" required /></Field>
          </ActionForm>
          <p className="mt-1 text-xs text-muted-foreground">Manual entries go to the CEO for approval before they post.</p>
        </details>
      )}
      <form className="mb-3 flex flex-wrap items-end gap-2 text-sm" action="/accounting/journals">
        <Input name="q" placeholder="Number or memo" defaultValue={sp.q ?? ""} className="h-9 w-48" />
        <Select name="source" defaultValue={sp.source ?? ""} className="h-9 w-48">
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="h-9 w-40">
          <option value="">Any status</option>
          {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <button className="h-9 rounded-lg border px-3">Filter</button>
      </form>
      <Card>
        <CardTitle>{rows.length === 200 ? "Latest 200 entries" : `${rows.length} entries`}</CardTitle>
        <Table>
          <thead><tr><Th>Number</Th><Th>Date</Th><Th>Source</Th><Th>Memo</Th><Th>Status</Th><Th className="text-right">Amount</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td><Link href={`/accounting/journals/${r.id}`} className="font-medium text-brand underline">{r.number || "(draft)"}</Link></Td>
                <Td>{formatDate(r.entry_date)}</Td>
                <Td>{SOURCE_LABEL[r.source] ?? r.source}</Td>
                <Td className="max-w-md truncate">{r.memo}{r.reversed_by && <span className="ml-1 text-xs text-muted-foreground">(reversed)</span>}</Td>
                <Td>{r.status}{r.is_test && r.status === "posted" && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">test</span>}</Td>
                <Td className="text-right tabular-nums">{formatMoney(r.total)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No journal entries match.</p>}
      </Card>
    </>
  );
}
