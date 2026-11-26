import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { statusLabel } from "@/components/shared/status-badge";
import { createLead } from "../actions";
import { STAGES, TYPE_LABEL } from "../parts";

export const metadata = { title: "Leads" };

/** Pipeline board: one column per stage, with value per column. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["sales.crm", "sales.view_all"]);
  const sp = await searchParams;
  const access = await getAccess();
  const supabase = await createClient();
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await supabase
    .from("leads")
    .select("id, number, name, company, stage, est_value, next_action, next_action_at, stage_changed_at, customer_type")
    .or(`stage.not.in.(won,lost),stage_changed_at.gte.${since}`)
    .order("stage_changed_at", { ascending: false })
    .limit(500);
  const rows = (data as { id: string; number: string; name: string; company: string; stage: string; est_value: string; next_action: string; next_action_at: string | null; stage_changed_at: string; customer_type: string }[] | null) ?? [];
  const q = (sp.q ?? "").toLowerCase();
  const list = q ? rows.filter((r) => `${r.name} ${r.company} ${r.number}`.toLowerCase().includes(q)) : rows;
  const open = list.filter((r) => !["won", "lost"].includes(r.stage));
  const now = Date.now();

  return (
    <>
      <PageHeader title="Leads" description={`${open.length} open leads worth ${formatMoney(open.reduce((s, r) => s + Number(r.est_value), 0).toFixed(2))}. Won and lost show for 90 days.`} />
      <form className="mb-3" action="/sales/leads"><Input name="q" defaultValue={sp.q ?? ""} placeholder="Search leads" className="h-9 max-w-xs" aria-label="Search leads" /></form>
      <div className="-mx-4 mb-6 flex gap-3 overflow-x-auto px-4 pb-2">
        {STAGES.map((s) => {
          const col = list.filter((r) => r.stage === s);
          return (
            <div key={s} className="w-64 shrink-0 rounded-xl bg-muted/50 p-2">
              <p className="mb-2 flex justify-between px-1 text-sm font-semibold"><span>{statusLabel(s)} ({col.length})</span><span className="text-muted-foreground">{formatMoney(col.reduce((t, r) => t + Number(r.est_value), 0).toFixed(0))}</span></p>
              <div className="space-y-2">
                {col.map((r) => {
                  const late = r.next_action_at && new Date(r.next_action_at).getTime() < now && !["won", "lost"].includes(s);
                  return (
                    <Link key={r.id} href={`/sales/leads/${r.id}`} className="block rounded-lg border bg-white p-2 text-sm shadow-sm hover:border-brand">
                      <p className="font-medium">{r.company || r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.company ? `${r.name} · ` : ""}{TYPE_LABEL[r.customer_type]} · {formatMoney(r.est_value)}</p>
                      {r.next_action && <p className={`mt-1 text-xs ${late ? "font-semibold text-danger" : ""}`}>→ {r.next_action}{r.next_action_at ? ` (${formatDate(r.next_action_at)})` : ""}</p>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {can(access, "sales.crm") && (
        <Card className="max-w-2xl">
          <CardTitle>New lead</CardTitle>
          <ActionForm action={createLead} submitLabel="Add lead" className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact name" htmlFor="name"><Input id="name" name="name" required /></Field>
            <Field label="Business" htmlFor="company"><Input id="company" name="company" /></Field>
            <Field label="Mobile" htmlFor="mobile"><Input id="mobile" name="mobile" inputMode="tel" /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" /></Field>
            <Field label="City" htmlFor="city"><Input id="city" name="city" /></Field>
            <Field label="Source" htmlFor="source">
              <Select id="source" name="source" defaultValue="referral">
                {["referral", "walk_in", "facebook", "website", "shop", "event", "cold_call", "other"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </Select>
            </Field>
            <Field label="Could become a" htmlFor="customer_type">
              <Select id="customer_type" name="customer_type" defaultValue="reseller">{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
            <Field label="Estimated monthly value (₱)" htmlFor="est_value"><Input id="est_value" name="est_value" inputMode="decimal" /></Field>
            <div className="sm:col-span-2"><Field label="Interested in" htmlFor="interest"><Textarea id="interest" name="interest" rows={2} /></Field></div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
