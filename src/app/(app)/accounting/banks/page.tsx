import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { releasePettyCash } from "../actions";
import { accounts, BooksBanner } from "../parts";

export const metadata = { title: "Cash and banks" };

export default async function BanksPage() {
  await requirePermission(["accounting.view", "bank.reconcile", "finance.reports.view"]);
  const access = await getAccess();
  const today = manilaToday();
  const supabase = await createClient();
  const [{ data: tb }, { data: unmatched }, { data: pcs }] = await Promise.all([
    supabase.rpc("trial_balance", { p_from: today, p_to: today }),
    supabase.from("bank_statement_lines").select("account_id").is("journal_line_id", null).limit(5000),
    supabase.from("petty_cash_requests").select("id, number, amount, purpose, needed_on, profiles:requested_by(full_name)").eq("status", "approved").is("released_at", null).order("created_at"),
  ]);
  const cashAccs = ((tb as { account_id: string; code: string; name: string; subtype: string; closing: string }[] | null) ?? []).filter((a) => ["cash", "bank"].includes(a.subtype));
  const open = new Map<string, number>();
  for (const u of (unmatched as { account_id: string }[] | null) ?? []) open.set(u.account_id, (open.get(u.account_id) ?? 0) + 1);
  const canRelease = can(access, "accounting.journals.create");
  const expense = canRelease ? await accounts({ postingOnly: true, types: ["expense"] }) : [];
  const supplies = expense.find((a) => a.system_key === "supplies_expense")?.id;
  type PC = { id: string; number: string; amount: string; purpose: string; needed_on: string | null; profiles: { full_name: string } | null };
  const pending = (pcs as unknown as PC[] | null) ?? [];

  return (
    <>
      <PageHeader title="Cash and banks" description="Balances from the ledger. Open an account to import the bank statement and tick off what matches." />
      <BooksBanner />
      <Card className="mb-4">
        <CardTitle>Accounts</CardTitle>
        <Table>
          <thead><tr><Th>Account</Th><Th className="text-right">Balance in the books</Th><Th className="text-right">Statement lines not matched</Th></tr></thead>
          <tbody>
            {cashAccs.map((a) => (
              <tr key={a.account_id}>
                <Td><Link href={`/accounting/banks/${a.account_id}`} className="font-medium text-brand underline">{a.code} {a.name}</Link></Td>
                <Td className="text-right tabular-nums">{formatMoney(a.closing)}</Td>
                <Td className={`text-right ${open.get(a.account_id) ? "text-amber-700" : "text-muted-foreground"}`}>{open.get(a.account_id) ?? 0}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardTitle>Petty cash to release</CardTitle>
        <p className="mb-2 text-sm text-muted-foreground">Approved requests. Release the cash, choose the expense it&apos;s for, and it posts to the books (expense debited, petty cash fund credited).</p>
        {pending.length === 0 ? <p className="py-3 text-center text-sm text-muted-foreground">Nothing waiting.</p> : (
          <ul className="divide-y text-sm">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><Link href={`/requests/petty-cash/${p.id}`} className="font-medium text-brand underline">{p.number}</Link> · {p.profiles?.full_name} · {p.purpose} · <b>{formatMoney(p.amount)}</b>{p.needed_on ? ` · needed ${formatDate(p.needed_on)}` : ""}</span>
                {canRelease && (
                  <ActionForm action={releasePettyCash} submitLabel="Release" className="flex items-center gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <Select name="account_id" defaultValue={supplies} className="h-8 w-56" aria-label="Expense account">
                      {expense.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                    </Select>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
