import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { peopleNames } from "@/components/shared/approval-timeline";
import { completeActivity } from "../actions";
import { ACTIVITY_LABEL, customerOptions } from "../parts";
import { ActivityForm } from "./activity-form";

export const metadata = { title: "Calls & visits" };

/** My follow-ups and today's visits; the sales head sees the whole team. */
export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requirePermission(["sales.crm", "sales.view_all"]);
  const sp = await searchParams;
  const access = await getAccess();
  const team = can(access, "sales.view_all") && sp.who === "team";
  const supabase = await createClient();
  let open = supabase.from("activities").select("id, kind, subject, due_at, owner_id, customers(id, name), leads(id, name)").is("done_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(100);
  let done = supabase.from("activities").select("id, kind, subject, outcome, done_at, lat, lng, accuracy_m, owner_id, customers(id, name), leads(id, name)").not("done_at", "is", null).order("done_at", { ascending: false }).limit(100);
  if (!team) {
    open = open.eq("owner_id", me.id);
    done = done.eq("owner_id", me.id);
  }
  const [{ data: o }, { data: d }, customers] = await Promise.all([open, done, can(access, "sales.crm") ? customerOptions() : []]);
  type Row = { id: string; kind: string; subject: string; due_at?: string | null; done_at?: string; outcome?: string; lat?: string | null; lng?: string | null; accuracy_m?: string | null; owner_id: string; customers: { id: string; name: string } | null; leads: { id: string; name: string } | null };
  const openRows = (o as unknown as Row[] | null) ?? [];
  const doneRows = (d as unknown as Row[] | null) ?? [];
  const names = team ? await peopleNames([...openRows, ...doneRows].map((r) => r.owner_id)) : new Map<string, string>();
  const now = Date.now();
  const who = (r: Row) => (r.customers ? <Link href={`/sales/customers/${r.customers.id}`} className="text-brand underline">{r.customers.name}</Link> : r.leads ? <Link href={`/sales/leads/${r.leads.id}`} className="text-brand underline">{r.leads.name}</Link> : "—");

  return (
    <>
      <PageHeader title="Calls & visits" description="Log calls and field visits (with GPS check-in), and keep track of follow-ups." />
      {can(access, "sales.view_all") && (
        <div className="mb-3 flex gap-2 text-sm">
          <Link href="/sales/activities" className={`rounded-full border px-3 py-1 ${!team ? "border-brand bg-brand text-white" : ""}`}>Mine</Link>
          <Link href="/sales/activities?who=team" className={`rounded-full border px-3 py-1 ${team ? "border-brand bg-brand text-white" : ""}`}>Whole team</Link>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Follow-ups to do ({openRows.length})</CardTitle>
            <ul className="divide-y text-sm">
              {openRows.map((r) => {
                const late = r.due_at && new Date(r.due_at).getTime() < now;
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <b>{r.subject}</b> · {who(r)}{team ? ` · ${names.get(r.owner_id) ?? ""}` : ""}
                      <span className={`block text-xs ${late ? "font-semibold text-danger" : "text-muted-foreground"}`}>{r.due_at ? `${late ? "Overdue: " : "Due "}${formatDate(r.due_at, true)}` : "No due date"}</span>
                    </span>
                    {r.owner_id === me.id && (
                      <ActionForm action={completeActivity} submitLabel="Done" variant="outline" className="flex items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <Input name="outcome" placeholder="Outcome" className="h-8 w-40" />
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
            {openRows.length === 0 && <p className="text-sm text-muted-foreground">Nothing to follow up. 🎉</p>}
          </Card>
          <Card>
            <CardTitle>Recent calls and visits</CardTitle>
            <Table>
              <thead><tr><Th>When</Th><Th>Type</Th><Th>With</Th><Th>Subject / outcome</Th><Th>Check-in</Th></tr></thead>
              <tbody>
                {doneRows.map((r) => (
                  <tr key={r.id}>
                    <Td>{formatDate(r.done_at, true)}{team && <div className="text-xs text-muted-foreground">{names.get(r.owner_id)}</div>}</Td>
                    <Td>{ACTIVITY_LABEL[r.kind]}</Td>
                    <Td>{who(r)}</Td>
                    <Td>{r.subject}{r.outcome && <div className="text-xs text-muted-foreground">{r.outcome}</div>}</Td>
                    <Td>{r.lat && r.lng ? <a className="text-brand underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}>📍 map{r.accuracy_m ? ` ±${Math.round(Number(r.accuracy_m))}m` : ""}</a> : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {doneRows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nothing logged yet.</p>}
          </Card>
        </div>
        {can(access, "sales.crm") && (
          <Card>
            <CardTitle>Log a call or visit</CardTitle>
            <ActivityForm customers={customers.map((c) => ({ id: c.id, name: c.name }))} />
          </Card>
        )}
      </div>
    </>
  );
}
