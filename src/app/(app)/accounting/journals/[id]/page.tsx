import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { ScanOriginal } from "@/components/shared/scan-original";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { addJournalLine, deleteDraftJournal, removeJournalLine, reverseJournal, submitJournal } from "../../actions";
import { accounts, SOURCE_LABEL, sourceHref } from "../../parts";

export const metadata = { title: "Journal entry" };

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(["accounting.view", "accounting.journals.create"]);
  const access = await getAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("journal_entries").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const je = data as { id: string; number: string; entry_date: string; source: string; source_table: string; source_id: string; memo: string; status: string; is_test: boolean; total: string; reversal_of: string | null; reversed_by: string | null; posted_at: string | null };
  const { data: lines } = await supabase.from("journal_lines").select("id, line_no, debit, credit, description, channel, accounts(code, name), customers(name), suppliers(name), products(sku), locations(name)").eq("entry_id", id).order("line_no").order("id");
  type Line = { id: string; debit: string; credit: string; description: string; channel: string; accounts: { code: string; name: string } | null; customers: { name: string } | null; suppliers: { name: string } | null; products: { sku: string } | null; locations: { name: string } | null };
  const ls = (lines as unknown as Line[] | null) ?? [];
  const dr = ls.reduce((s, l) => s + Number(l.debit), 0);
  const cr = ls.reduce((s, l) => s + Number(l.credit), 0);
  const canEdit = can(access, "accounting.journals.create");
  const editable = canEdit && je.source === "manual" && ["draft", "returned"].includes(je.status);
  const accs = editable ? await accounts({ postingOnly: true }) : [];
  const src = je.source_table && je.source_id ? sourceHref(je.source_table, je.source_id) : null;
  const m = (n: number) => formatMoney(n.toFixed(2));
  const { data: er } = await supabase.from("expense_receipts").select("id").eq("journal_entry_id", id).maybeSingle();
  const expenseReceipt = (er as { id: string } | null)?.id ?? null;

  return (
    <>
      <PageHeader
        title={`Journal ${je.number || "(draft)"}`}
        description={`${formatDate(je.entry_date)} · ${SOURCE_LABEL[je.source] ?? je.source}${je.is_test ? " · test entry (parallel run)" : ""}`}
        actions={<span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{je.status}</span>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <p className="mb-2 text-sm">{je.memo}</p>
            <p className="mb-3 flex flex-wrap gap-3 text-sm">
              {src && <Link href={src} className="text-brand underline">Open the source document</Link>}
              {je.reversal_of && <Link href={`/accounting/journals/${je.reversal_of}`} className="text-brand underline">Reverses an earlier entry</Link>}
              {je.reversed_by && <Link href={`/accounting/journals/${je.reversed_by}`} className="text-brand underline">Reversed by a later entry</Link>}
            </p>
            <Table>
              <thead><tr><Th>Account</Th><Th>Details</Th><Th className="text-right">Debit</Th><Th className="text-right">Credit</Th>{editable && <Th />}</tr></thead>
              <tbody>
                {ls.map((l) => (
                  <tr key={l.id}>
                    <Td><Link href={`/accounting/ledger?account=${l.accounts?.code}`} className="underline">{l.accounts?.code}</Link> {l.accounts?.name}</Td>
                    <Td className="text-xs text-muted-foreground">{[l.description, l.customers?.name, l.suppliers?.name, l.products?.sku, l.locations?.name, l.channel].filter(Boolean).join(" · ")}</Td>
                    <Td className="text-right tabular-nums">{Number(l.debit) ? formatMoney(l.debit) : ""}</Td>
                    <Td className="text-right tabular-nums">{Number(l.credit) ? formatMoney(l.credit) : ""}</Td>
                    {editable && <Td><ActionForm action={removeJournalLine} submitLabel="Remove" variant="outline" className="flex"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="entry_id" value={id} /></ActionForm></Td>}
                  </tr>
                ))}
                <tr className="font-bold"><Td>Total</Td><Td /><Td className="text-right">{m(dr)}</Td><Td className="text-right">{m(cr)}</Td>{editable && <Td />}</tr>
              </tbody>
            </Table>
            {Math.abs(dr - cr) > 0.004 && <p className="mt-2 text-sm font-semibold text-danger">Out of balance by {m(Math.abs(dr - cr))}. Debits must equal credits before you can submit.</p>}
            {editable && (
              <ActionForm action={addJournalLine} submitLabel="Add line" className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-[1fr_110px_130px_1fr_auto] sm:items-end">
                <input type="hidden" name="entry_id" value={id} />
                <Field label="Account" htmlFor="account_id">
                  <Select id="account_id" name="account_id" required>
                    <option value="">Choose…</option>
                    {accs.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </Select>
                </Field>
                <Field label="Side" htmlFor="side"><Select id="side" name="side" defaultValue={dr > cr ? "credit" : "debit"}><option value="debit">Debit</option><option value="credit">Credit</option></Select></Field>
                <Field label="Amount" htmlFor="amount"><Input id="amount" name="amount" inputMode="decimal" defaultValue={dr !== cr ? Math.abs(dr - cr).toFixed(2) : ""} required /></Field>
                <Field label="Note (optional)" htmlFor="description"><Input id="description" name="description" /></Field>
              </ActionForm>
            )}
          </Card>
          {je.source === "manual" && ["submitted", "approved", "rejected", "returned", "posted"].includes(je.status) && <ApprovalTimeline docType="journal_entry" recordId={id} />}
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["journal_entries"]} recordIds={[id]} /></Card>
        </div>
        <div className="space-y-4">
          {expenseReceipt && <ScanOriginal table="expense_receipts" id={expenseReceipt} />}
          {canEdit && (
            <Card>
              <CardTitle>Next step</CardTitle>
              <div className="space-y-3 text-sm">
                {editable && (
                  <>
                    <ActionForm action={submitJournal} submitLabel="Send to CEO for approval"><input type="hidden" name="id" value={id} /></ActionForm>
                    <ActionForm action={deleteDraftJournal} submitLabel="Delete draft" variant="outline" confirm="Delete this draft?"><input type="hidden" name="id" value={id} /></ActionForm>
                  </>
                )}
                {je.status === "submitted" && <p>Waiting for the CEO. It posts automatically once approved.</p>}
                {je.status === "posted" && !je.reversed_by && je.source !== "reversal" && (
                  <details className="rounded-lg border p-2">
                    <summary className="cursor-pointer font-medium">Reverse this entry</summary>
                    <p className="my-2 text-muted-foreground">Creates an opposite entry. Use it to correct a mistake. Fix the source document first if this entry came from one.</p>
                    <ActionForm action={reverseJournal} submitLabel="Reverse" variant="danger" confirm="Post a reversing entry?">
                      <input type="hidden" name="id" value={id} />
                      <Field label="Reversal date" htmlFor="rev-date"><Input id="rev-date" name="date" type="date" defaultValue={manilaToday()} /></Field>
                      <Field label="Reason" htmlFor="rev-reason"><Input id="rev-reason" name="reason" required /></Field>
                    </ActionForm>
                  </details>
                )}
                {je.status === "posted" && <p className="text-muted-foreground">Posted {je.posted_at ? formatDate(je.posted_at) : ""}. Posted entries can&apos;t be edited.</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
