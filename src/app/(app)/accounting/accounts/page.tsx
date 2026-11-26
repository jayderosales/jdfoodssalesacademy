import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveAccount, setMethodAccount } from "../actions";
import { accounts, BooksBanner } from "../parts";

export const metadata = { title: "Chart of accounts" };

const TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
const METHODS: [string, string][] = [["cash", "Cash"], ["bank_transfer", "Bank transfer"], ["gcash", "GCash"], ["maya", "Maya"], ["cheque", "Cheque"], ["card", "Card"], ["paymongo", "PayMongo (online)"], ["other", "Other"]];

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["accounting.view", "accounting.coa.manage"]);
  const access = await getAccess();
  const sp = await searchParams;
  const supabase = await createClient();
  const all = await accounts();
  const { data: maps } = await supabase.from("payment_method_accounts").select("method, account_id");
  const map = new Map(((maps as { method: string; account_id: string }[] | null) ?? []).map((x) => [x.method, x.account_id]));
  const { data: nv } = await supabase.from("accounts").select("id").eq("needs_verification", true);
  const unverified = new Set(((nv as { id: string }[] | null) ?? []).map((x) => x.id));
  const manage = can(access, "accounting.coa.manage");
  const editing = sp.edit ? all.find((a) => a.id === sp.edit) : null;
  const { data: desc } = editing ? await supabase.from("accounts").select("description").eq("id", editing.id).maybeSingle() : { data: null };
  const cashBank = all.filter((a) => !a.is_header && a.active && ["cash", "bank"].includes(a.subtype));

  return (
    <>
      <PageHeader title="Chart of accounts" description="The accounts every entry posts to. A starting Philippine chart is loaded. The accountant should review it before the books go official." />
      <BooksBanner />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Accounts</CardTitle>
          <Table>
            <thead><tr><Th>Code</Th><Th>Name</Th><Th>Type</Th><Th>Used by</Th>{manage && <Th />}</tr></thead>
            <tbody>
              {all.map((a) => (
                <tr key={a.id} className={a.is_header ? "bg-muted/50 font-semibold" : a.active ? "" : "text-muted-foreground line-through"}>
                  <Td>{a.is_header ? a.code : <Link href={`/accounting/ledger?account=${a.code}`} className="underline">{a.code}</Link>}</Td>
                  <Td className={a.is_header ? "" : "pl-6"}>{a.name}{unverified.has(a.id) && !a.is_header && <span className="ml-1 rounded bg-amber-100 px-1 text-xs font-normal text-amber-900">to review</span>}</Td>
                  <Td className="text-xs">{a.type}{a.subtype ? ` · ${a.subtype}` : ""}</Td>
                  <Td className="text-xs text-muted-foreground">{a.system_key ? "automatic postings" : ""}</Td>
                  {manage && <Td><Link href={`/accounting/accounts?edit=${a.id}`} className="text-sm text-brand underline">Edit</Link></Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-4">
          {manage && (
            <Card>
              <CardTitle>{editing ? `Edit ${editing.code}` : "Add an account"}</CardTitle>
              <ActionForm key={editing?.id ?? "new"} action={saveAccount} submitLabel={editing ? "Save" : "Add account"}>
                <input type="hidden" name="id" value={editing?.id ?? ""} />
                <Field label="Code" htmlFor="code" hint="4–6 digits. 1 assets, 2 liabilities, 3 equity, 4 income, 5 cost of sales, 6 expenses."><Input id="code" name="code" defaultValue={editing?.code} required /></Field>
                <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={editing?.name} required /></Field>
                <Field label="Type" htmlFor="type">
                  <Select id="type" name="type" defaultValue={editing?.type ?? "expense"}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
                </Field>
                <Field label="Group (subtype)" htmlFor="subtype" hint="e.g. cash, bank, receivable, payable, tax, cost_of_sales, operating. Cash and bank accounts show under Cash and banks.">
                  <Input id="subtype" name="subtype" defaultValue={editing?.subtype} />
                </Field>
                <Field label="Description" htmlFor="description"><Input id="description" name="description" defaultValue={(desc as { description: string } | null)?.description ?? ""} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_header" defaultChecked={editing?.is_header ?? false} /> Heading only (can&apos;t be posted to)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Active</label>
                {editing?.system_key && <p className="text-xs text-amber-700">Automatic postings use this account. It can be renamed, but not deactivated.</p>}
              </ActionForm>
              {editing && <Link href="/accounting/accounts" className="mt-2 inline-block text-sm underline">Cancel</Link>}
            </Card>
          )}
          <Card>
            <CardTitle>Where customer payments go</CardTitle>
            <p className="mb-2 text-sm text-muted-foreground">Which cash or bank account each payment method posts to.</p>
            <ul className="space-y-2 text-sm">
              {METHODS.map(([k, l]) => (
                <li key={k}>
                  {manage ? (
                    <ActionForm action={setMethodAccount} submitLabel="Save" variant="outline" className="flex items-center gap-2">
                      <span className="w-28 shrink-0">{l}</span>
                      <input type="hidden" name="method" value={k} />
                      <Select name="account_id" defaultValue={map.get(k) ?? ""} className="h-8" aria-label={`${l} account`}>
                        <option value="" disabled>Choose…</option>
                        {cashBank.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                      </Select>
                    </ActionForm>
                  ) : (
                    <span>{l}: {all.find((a) => a.id === map.get(k))?.name ?? "not set"}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
