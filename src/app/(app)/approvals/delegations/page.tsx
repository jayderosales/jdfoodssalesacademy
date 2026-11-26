import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { peopleNames } from "@/components/shared/approval-timeline";
import { Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { addDelegation, removeDelegation } from "../actions";

export const metadata = { title: "Delegate approvals" };

interface Del {
  id: string;
  from_user: string;
  to_user: string;
  starts_on: string;
  ends_on: string;
  reason: string;
}

export default async function DelegationsPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data }, { data: staff }] = await Promise.all([
    supabase.from("approval_delegations").select("*").or(`from_user.eq.${me.id},to_user.eq.${me.id}`).order("starts_on", { ascending: false }),
    supabase.rpc("delegation_candidates"),
  ]);
  const rows = (data as Del[] | null) ?? [];
  const names = await peopleNames(rows.flatMap((d) => [d.from_user, d.to_user]));
  const options = (staff as { id: string; name: string }[] | null) ?? [];
  const today = manilaToday();

  return (
    <>
      <PageHeader
        title="Delegate approvals"
        description="While you're away, someone else can approve for you. Their decisions are recorded under both names."
        actions={<Link href="/approvals" className="text-sm text-brand underline">Back to approvals</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>New delegation</CardTitle>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">There are no other active staff accounts yet.</p>
          ) : (
            <ActionForm action={addDelegation} submitLabel="Save delegation">
              <Field label="Who approves for you" htmlFor="to_user">
                <Select id="to_user" name="to_user" required defaultValue="">
                  <option value="" disabled>Choose a colleague</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" htmlFor="starts_on"><Input id="starts_on" name="starts_on" type="date" defaultValue={today} required /></Field>
                <Field label="Until" htmlFor="ends_on"><Input id="ends_on" name="ends_on" type="date" defaultValue={today} required /></Field>
              </div>
              <Field label="Reason (optional)" htmlFor="reason"><Input id="reason" name="reason" placeholder="e.g. On leave" /></Field>
            </ActionForm>
          )}
        </Card>
        <Card>
          <CardTitle>Your delegations</CardTitle>
          {rows.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
          <ul className="divide-y text-sm">
            {rows.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {d.from_user === me.id ? `${names.get(d.to_user)} approves for you` : `You approve for ${names.get(d.from_user)}`}
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(d.starts_on)} – {formatDate(d.ends_on)}{d.reason ? ` · ${d.reason}` : ""}
                    {d.ends_on < today ? " · ended" : d.starts_on <= today ? " · active now" : ""}
                  </span>
                </span>
                {d.from_user === me.id && (
                  <ActionForm action={removeDelegation} submitLabel="Remove" variant="outline" className="flex">
                    <input type="hidden" name="id" value={d.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
