import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney, fromCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { autoMatch, importStatement, matchLine } from "../../actions";
import { BooksBanner, cents } from "../../parts";

export const metadata = { title: "Bank reconciliation" };

type St = { id: string; txn_date: string; description: string; reference: string; amount: string; journal_line_id: string | null };
type Bk = { id: string; debit: string; credit: string; description: string; journal_entries: { id: string; number: string; entry_date: string; memo: string } };

export default async function BankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(["accounting.view", "bank.reconcile"]);
  const access = await getAccess();
  const supabase = await createClient();
  const { data: acc } = await supabase.from("accounts").select("id, code, name, subtype").eq("id", id).maybeSingle();
  if (!acc || !["cash", "bank"].includes((acc as { subtype: string }).subtype)) notFound();
  const a = acc as { id: string; code: string; name: string };
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: st }, { data: book }] = await Promise.all([
    supabase.from("bank_statement_lines").select("id, txn_date, description, reference, amount, journal_line_id").eq("account_id", id).gte("txn_date", since).order("txn_date", { ascending: false }).limit(1000),
    supabase.from("journal_lines").select("id, debit, credit, description, journal_entries!inner(id, number, entry_date, memo, status)").eq("account_id", id).eq("journal_entries.status", "posted").gte("journal_entries.entry_date", since).limit(3000),
  ]);
  const lines = (st as St[] | null) ?? [];
  const matched = new Set(lines.map((l) => l.journal_line_id).filter(Boolean) as string[]);
  // book lines that are already matched to statement lines older than the window are rare; check them too
  const { data: older } = await supabase.from("bank_statement_lines").select("journal_line_id").eq("account_id", id).lt("txn_date", since).not("journal_line_id", "is", null).limit(5000);
  for (const o of (older as { journal_line_id: string }[] | null) ?? []) matched.add(o.journal_line_id);
  const bookLines = ((book as unknown as Bk[] | null) ?? []).sort((x, y) => y.journal_entries.entry_date.localeCompare(x.journal_entries.entry_date));
  const openBook = bookLines.filter((b) => !matched.has(b.id));
  const byId = new Map(bookLines.map((b) => [b.id, b]));
  const openSt = lines.filter((l) => !l.journal_line_id);
  const net = (b: Bk) => cents(b.debit) - cents(b.credit);
  const canRec = can(access, "bank.reconcile");
  const sum = (xs: bigint[]) => xs.reduce((s, x) => s + x, 0n);

  return (
    <>
      <PageHeader title={`${a.code} ${a.name}`} description="Bank reconciliation: every statement line should match one entry in the books. Lines that don't match are money the books are missing, or entries the bank hasn't cleared yet." />
      <BooksBanner />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Statement lines not matched ({openSt.length})</CardTitle>
            {openSt.length === 0 ? <p className="py-3 text-center text-sm text-muted-foreground">Everything on the statement is matched.</p> : (
              <Table>
                <thead><tr><Th>Date</Th><Th>Description</Th><Th className="text-right">Amount</Th>{canRec && <Th>Match to a book entry</Th>}</tr></thead>
                <tbody>
                  {openSt.map((l) => {
                    const amt = cents(l.amount);
                    const cands = openBook.filter((b) => net(b) === amt);
                    return (
                      <tr key={l.id}>
                        <Td>{formatDate(l.txn_date)}</Td>
                        <Td>{l.description}<div className="text-xs text-muted-foreground">{l.reference}</div></Td>
                        <Td className={`text-right tabular-nums ${amt < 0n ? "text-danger" : ""}`}>{formatMoney(l.amount)}</Td>
                        {canRec && (
                          <Td>
                            {cands.length ? (
                              <ActionForm action={matchLine} submitLabel="Match" variant="outline" className="flex items-center gap-1">
                                <input type="hidden" name="id" value={l.id} /><input type="hidden" name="account_id" value={id} />
                                <Select name="journal_line_id" className="h-8 w-56" aria-label="Book entry">
                                  {cands.map((b) => <option key={b.id} value={b.id}>{b.journal_entries.number} · {formatDate(b.journal_entries.entry_date)} · {(b.description || b.journal_entries.memo).slice(0, 40)}</option>)}
                                </Select>
                              </ActionForm>
                            ) : <span className="text-xs text-muted-foreground">No book entry with this amount. Record the missing transaction (e.g. bank charge as a manual journal), then match.</span>}
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardTitle>Book entries not on the statement ({openBook.length})</CardTitle>
            <p className="mb-2 text-sm text-muted-foreground">Usually cheques not yet cleared or deposits in transit. Old ones need checking. Last 180 days.</p>
            <Table>
              <thead><tr><Th>Date</Th><Th>Entry</Th><Th className="text-right">Amount</Th></tr></thead>
              <tbody>
                {openBook.slice(0, 200).map((b) => (
                  <tr key={b.id}>
                    <Td>{formatDate(b.journal_entries.entry_date)}</Td>
                    <Td><Link href={`/accounting/journals/${b.journal_entries.id}`} className="text-brand underline">{b.journal_entries.number}</Link> <span className="text-muted-foreground">{b.description || b.journal_entries.memo}</span></Td>
                    <Td className="text-right tabular-nums">{formatMoney(fromCentavos(net(b)))}</Td>
                  </tr>
                ))}
                <tr className="font-bold"><Td colSpan={2}>Total not yet on the statement</Td><Td className="text-right">{formatMoney(fromCentavos(sum(openBook.map(net))))}</Td></tr>
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardTitle>Matched lines</CardTitle>
            <Table>
              <thead><tr><Th>Date</Th><Th>Statement</Th><Th>Book entry</Th><Th className="text-right">Amount</Th>{canRec && <Th />}</tr></thead>
              <tbody>
                {lines.filter((l) => l.journal_line_id).slice(0, 200).map((l) => {
                  const b = byId.get(l.journal_line_id!);
                  return (
                    <tr key={l.id}>
                      <Td>{formatDate(l.txn_date)}</Td>
                      <Td>{l.description}</Td>
                      <Td>{b ? <Link href={`/accounting/journals/${b.journal_entries.id}`} className="underline">{b.journal_entries.number}</Link> : "—"}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(l.amount)}</Td>
                      {canRec && <Td><ActionForm action={matchLine} submitLabel="Unmatch" variant="outline" className="flex"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="account_id" value={id} /></ActionForm></Td>}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
        {canRec && (
          <div className="space-y-4">
            <Card>
              <CardTitle>Import statement</CardTitle>
              <ActionForm action={importStatement} submitLabel="Import and match">
                <input type="hidden" name="account_id" value={id} />
                <Field label="Paste from the bank's CSV" htmlFor="csv" hint="One line each: date, description, reference, amount. Money in is positive, money out negative. Lines already imported are skipped.">
                  <Textarea id="csv" name="csv" rows={8} placeholder={"2026-12-01, Deposit, DEP123, 15000.00\n2026-12-02, Cheque 1001, CHK1001, -8200.00"} required />
                </Field>
              </ActionForm>
            </Card>
            <Card>
              <CardTitle>Match automatically</CardTitle>
              <p className="mb-2 text-sm text-muted-foreground">Matches lines with the same amount within 3 days.</p>
              <ActionForm action={autoMatch} submitLabel="Run auto-match" variant="outline"><input type="hidden" name="account_id" value={id} /></ActionForm>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
