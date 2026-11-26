import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui";
import { can, getAccess, requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { statusLabel } from "@/components/shared/status-badge";
import { convertLead, updateLead } from "../../actions";
import { ActivityForm } from "../../activities/activity-form";
import { ACTIVITY_LABEL, STAGES, TYPE_LABEL, salesPeople } from "../../parts";

export const metadata = { title: "Lead" };

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600000).toISOString().slice(0, 16) : "");

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const access = await getAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const l = data as { id: string; number: string; name: string; company: string; mobile: string; email: string; city: string; source: string; interest: string; customer_type: string; stage: string; est_value: string; owner_id: string | null; customer_id: string | null; lost_reason: string; next_action: string; next_action_at: string | null; created_at: string };
  const [{ data: acts }, people] = await Promise.all([
    supabase.from("activities").select("id, kind, subject, notes, outcome, done_at, created_at, lat").eq("lead_id", id).order("created_at", { ascending: false }),
    can(access, "sales.view_all") ? salesPeople(me) : Promise.resolve([]),
  ]);
  const canEdit = can(access, "sales.crm") && (l.owner_id === me.id || can(access, "sales.view_all"));

  return (
    <>
      <PageHeader title={l.company || l.name} description={`${l.number} · ${TYPE_LABEL[l.customer_type]} · from ${l.source.replace("_", " ")} · added ${formatDate(l.created_at)}`} actions={<StatusBadge status={l.stage} className="text-sm" />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <p className="text-sm">{l.name}{l.mobile ? ` · ${l.mobile}` : ""}{l.email ? ` · ${l.email}` : ""}{l.city ? ` · ${l.city}` : ""}</p>
            {l.interest && <p className="mt-2 text-sm text-muted-foreground">{l.interest}</p>}
            <p className="mt-2 text-sm">Estimated value <b>{formatMoney(l.est_value)}</b></p>
            {l.customer_id && <p className="mt-2 text-sm">Converted → <Link href={`/sales/customers/${l.customer_id}`} className="text-brand underline">customer record</Link></p>}
          </Card>
          <Card>
            <CardTitle>Activity</CardTitle>
            {canEdit && <ActivityForm leadId={id} />}
            <ul className="mt-3 divide-y text-sm">
              {((acts as { id: string; kind: string; subject: string; notes: string; outcome: string; created_at: string; lat: string | null }[] | null) ?? []).map((a) => (
                <li key={a.id} className="py-2"><b>{ACTIVITY_LABEL[a.kind]}</b> · {a.subject} <span className="text-muted-foreground">· {formatDate(a.created_at, true)}{a.lat ? " · 📍" : ""}</span>{a.outcome && <p>Outcome: {a.outcome}</p>}{a.notes && <p className="text-muted-foreground">{a.notes}</p>}</li>
              ))}
            </ul>
          </Card>
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["leads"]} recordIds={[id]} /></Card>
        </div>
        <div className="space-y-4">
          {canEdit && (
            <Card>
              <CardTitle>Update</CardTitle>
              <ActionForm action={updateLead} submitLabel="Save">
                <input type="hidden" name="id" value={id} />
                <Field label="Stage" htmlFor="stage">
                  <Select id="stage" name="stage" defaultValue={l.stage}>{STAGES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</Select>
                </Field>
                <Field label="Estimated value (₱)" htmlFor="est_value"><Input id="est_value" name="est_value" inputMode="decimal" defaultValue={Number(l.est_value).toFixed(2)} /></Field>
                <Field label="Next step" htmlFor="next_action"><Input id="next_action" name="next_action" defaultValue={l.next_action} placeholder="Send price list, visit Tuesday…" /></Field>
                <Field label="By when" htmlFor="next_action_at"><Input id="next_action_at" name="next_action_at" type="datetime-local" defaultValue={toLocal(l.next_action_at)} /></Field>
                <Field label="If lost, why" htmlFor="lost_reason"><Input id="lost_reason" name="lost_reason" defaultValue={l.lost_reason} /></Field>
                {people.length > 0 && (
                  <Field label="Owner" htmlFor="owner_id">
                    <Select id="owner_id" name="owner_id" defaultValue={l.owner_id ?? ""}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                  </Field>
                )}
              </ActionForm>
            </Card>
          )}
          {canEdit && !l.customer_id && (
            <Card>
              <CardTitle>Won it?</CardTitle>
              <p className="mb-2 text-sm text-muted-foreground">Turn this lead into a customer so you can take orders.</p>
              <ActionForm action={convertLead} submitLabel="Convert to customer"><input type="hidden" name="id" value={id} /></ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
