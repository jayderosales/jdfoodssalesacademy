import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { listTeams } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Profile } from "@/lib/types";
import { formatDate, manilaToday } from "@/lib/utils";
import { deactivateUser, reactivateUser, sendReset, setManagedTeams, updateUser } from "../actions";

export const metadata = { title: "Edit user" };

const EXIT_REASONS = [
  "Resigned — better offer",
  "Resigned — personal / family",
  "Resigned — career change",
  "Did not pass probation",
  "Terminated — performance",
  "Terminated — conduct",
  "End of contract",
  "Other",
];

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const me = await requireOwner();
  const supabase = await createClient();
  const [{ data }, teams, { data: managed }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    listTeams(),
    supabase.from("team_managers").select("team_id").eq("manager_id", id),
  ]);
  if (!data) notFound();
  const user = data as Profile;
  const managedIds = new Set((managed ?? []).map((m: { team_id: string }) => m.team_id));
  const isSelf = user.id === me.id;

  return (
    <>
      <PageHeader
        title={user.full_name || user.email}
        description={`${ROLE_LABEL[user.role]} · ${user.email}`}
        actions={<Link href="/admin/users" className="text-sm text-brand underline">Back to users</Link>}
      />

      {created && (
        <div className="mb-4">
          <Alert tone="success">
            {created === "invite"
              ? "User created and invite email sent. They'll set their own password from the link."
              : "User created. Share the temporary password with them securely (not in a group chat)."}
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Details</CardTitle>
          <ActionForm action={updateUser} submitLabel="Save details">
            <input type="hidden" name="id" value={user.id} />
            <Field label="Full name" htmlFor="full_name">
              <Input id="full_name" name="full_name" defaultValue={user.full_name} required />
            </Field>
            <Field label="Role" htmlFor="role" hint={isSelf ? "You can't change your own role." : undefined}>
              <Select id="role" name="role" defaultValue={user.role} disabled={isSelf}>
                <option value="rep">Salesperson</option>
                <option value="manager">Sales Manager</option>
                <option value="owner">Owner / Admin</option>
              </Select>
              {isSelf && <input type="hidden" name="role" value={user.role} />}
            </Field>
            <Field label="Team" htmlFor="team_id">
              <Select id="team_id" name="team_id" defaultValue={user.team_id ?? ""}>
                <option value="">— None —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Hire date" htmlFor="hire_date">
              <Input id="hire_date" name="hire_date" type="date" defaultValue={user.hire_date ?? ""} />
            </Field>
          </ActionForm>
        </Card>

        <div className="space-y-4">
          {(user.role === "manager" || user.role === "owner") && (
            <Card>
              <CardTitle>Teams this person manages</CardTitle>
              <ActionForm action={setManagedTeams} submitLabel="Save managed teams">
                <input type="hidden" name="id" value={user.id} />
                {teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet. Create one under Teams &amp; branches.</p>}
                <div className="space-y-2">
                  {teams.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="team_ids" value={t.id} defaultChecked={managedIds.has(t.id)} className="size-4" />
                      {t.label}
                    </label>
                  ))}
                </div>
              </ActionForm>
            </Card>
          )}

          <Card>
            <CardTitle>Account</CardTitle>
            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd><Badge tone={user.status === "active" ? "success" : "neutral"}>{user.status}</Badge></dd>
              <dt className="text-muted-foreground">Privacy consent</dt>
              <dd>{user.consent_at ? `${formatDate(user.consent_at)} (${user.consent_version})` : "Not yet"}</dd>
              <dt className="text-muted-foreground">Last active</dt>
              <dd>{formatDate(user.last_active_at, true)}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(user.created_at)}</dd>
            </dl>
            {user.status === "active" && (
              <ActionForm action={sendReset} submitLabel="Send password setup email" variant="outline">
                <input type="hidden" name="email" value={user.email} />
              </ActionForm>
            )}
          </Card>

          <Card>
            {user.status === "active" ? (
              <>
                <CardTitle>Deactivate (employee left)</CardTitle>
                {isSelf ? (
                  <p className="text-sm text-muted-foreground">You can&apos;t deactivate your own account.</p>
                ) : (
                  <ActionForm
                    action={deactivateUser}
                    submitLabel="Deactivate user"
                    variant="danger"
                    confirm="Deactivate this user? They will no longer be able to sign in. Their data is kept."
                  >
                    <input type="hidden" name="id" value={user.id} />
                    <p className="text-sm text-muted-foreground">
                      Sign-in is blocked, but nothing is deleted: their training history stays in reports and turnover analytics.
                    </p>
                    <Field label="Last working day" htmlFor="exit_date">
                      <Input id="exit_date" name="exit_date" type="date" defaultValue={manilaToday()} />
                    </Field>
                    <Field label="Exit reason" htmlFor="exit_reason">
                      <Select id="exit_reason" name="exit_reason" required defaultValue="">
                        <option value="" disabled>Choose a reason</option>
                        {EXIT_REASONS.map((r) => <option key={r}>{r}</option>)}
                      </Select>
                    </Field>
                  </ActionForm>
                )}
              </>
            ) : (
              <>
                <CardTitle>Inactive</CardTitle>
                <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Exit date</dt>
                  <dd>{formatDate(user.exit_date)}</dd>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd>{user.exit_reason ?? "—"}</dd>
                  <dt className="text-muted-foreground">Level at exit</dt>
                  <dd>{user.exit_stage_level ?? "—"}</dd>
                </dl>
                <ActionForm action={reactivateUser} submitLabel="Reactivate user" variant="outline">
                  <input type="hidden" name="id" value={user.id} />
                </ActionForm>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
