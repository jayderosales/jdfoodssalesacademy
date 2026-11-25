import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { Alert, Badge, Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { listLocations, listTeams } from "@/lib/org";
import { grantLabel, listGrants, listRoles } from "@/lib/rbac/queries";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { formatDate, manilaToday } from "@/lib/utils";
import {
  approveRegistration, deactivateUser, grantRole, reactivateUser, resetMfa, revokeRole, sendReset, setManagedTeams, updateUser,
} from "../actions";

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

const ACCOUNT_LABEL: Record<string, string> = { staff: "Staff", customer: "Customer", distributor: "Distributor", supplier: "Supplier" };

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const me = await requirePermission("admin.users.view");
  const access = await getAccess();
  const canManage = can(access, "admin.users.manage");
  const supabase = await createClient();
  const [{ data }, teams, { data: managed }, grants, roles, locations, { data: departments }, { data: employees }, { data: logins }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    listTeams(),
    supabase.from("team_managers").select("team_id").eq("manager_id", id),
    listGrants([id]),
    listRoles(),
    listLocations(),
    supabase.from("departments").select("id, name").eq("active", true).order("name"),
    supabase.from("employees").select("id, full_name, employee_no").eq("status", "active").order("full_name"),
    supabase.from("login_events").select("at, method, success, ip, user_agent, reason").eq("user_id", id).order("at", { ascending: false }).limit(10),
  ]);
  if (!data) notFound();
  const user = data as Profile;
  const managedIds = new Set((managed ?? []).map((m: { team_id: string }) => m.team_id));
  const isSelf = user.id === me.id;
  const pending = user.status === "inactive" && !user.approved_at;
  const isAcademyManager = user.role === "manager" || user.role === "owner";
  const grantableRoles = roles.filter((r) => r.active && (user.account_type === "staff" ? r.is_internal : !r.is_internal));

  return (
    <>
      <PageHeader
        title={user.full_name || user.email}
        description={`${ACCOUNT_LABEL[user.account_type]}${user.company_name ? ` · ${user.company_name}` : ""} · ${user.email}`}
        actions={<Link href="/admin/users" className="text-sm text-brand underline">Back to users</Link>}
      />

      {created && (
        <div className="mb-4">
          <Alert tone="success">
            {created === "invite"
              ? "User created and invite email sent. They'll set their own password and two-step sign-in from the link."
              : "User created. Share the temporary password with them securely (not in a group chat). They'll set up two-step sign-in when they first sign in."}
          </Alert>
        </div>
      )}

      {pending && (
        <Card className="mb-4 border-amber-300">
          <CardTitle>Waiting for approval</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            {user.account_type === "staff"
              ? "This person signed up without a valid sign-up link. Approving makes them a Sales representative; adjust roles afterwards. Approve only if you know them."
              : `This ${ACCOUNT_LABEL[user.account_type].toLowerCase()} registered themselves${user.company_name ? ` for ${user.company_name}` : ""}${user.phone ? ` (phone ${user.phone})` : ""}. Approving gives them portal access. Linking them to a ${user.account_type} record comes in a later phase.`}
          </p>
          {user.registration_note && <p className="mb-3 rounded bg-muted p-2 text-sm">“{user.registration_note}”</p>}
          {canManage && (
            <ActionForm action={approveRegistration} submitLabel="Approve account">
              <input type="hidden" name="id" value={user.id} />
            </ActionForm>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardTitle>Roles</CardTitle>
            <p className="mb-3 text-sm text-muted-foreground">
              Roles decide what this person can see and do. A role can be limited to one location or department.
            </p>
            {grants.length === 0 && <p className="mb-3 text-sm text-muted-foreground">No roles yet: they can&apos;t see anything.</p>}
            <ul className="mb-4 divide-y rounded border">
              {grants.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                  <span>
                    {grantLabel(g)}
                    {g.valid_to && <span className="ml-2 text-xs text-muted-foreground">until {formatDate(g.valid_to)}</span>}
                  </span>
                  {canManage && !isSelf && (
                    <ActionForm action={revokeRole} submitLabel="Remove" variant="outline" className="flex items-center gap-2" confirm={`Remove ${grantLabel(g)}?`}>
                      <input type="hidden" name="grant_id" value={g.id} />
                      <input type="hidden" name="user_id" value={user.id} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {canManage && !isSelf && !pending && (
              <ActionForm action={grantRole} submitLabel="Add role">
                <input type="hidden" name="user_id" value={user.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Role" htmlFor="role_id">
                    <Select id="role_id" name="role_id" required defaultValue="">
                      <option value="" disabled>Choose a role</option>
                      {grantableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Only at location (optional)" htmlFor="location_id">
                    <Select id="location_id" name="location_id" defaultValue="">
                      <option value="">All locations</option>
                      {locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Only in department (optional)" htmlFor="department_id">
                    <Select id="department_id" name="department_id" defaultValue="">
                      <option value="">All departments</option>
                      {(departments ?? []).map((d: { id: string; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Until (optional)" htmlFor="valid_to" hint="For temporary cover, e.g. during leave.">
                    <Input id="valid_to" name="valid_to" type="date" />
                  </Field>
                </div>
              </ActionForm>
            )}
            {isSelf && <p className="text-sm text-muted-foreground">You can&apos;t change your own roles. Ask another administrator.</p>}
          </Card>

          <Card>
            <CardTitle>Details</CardTitle>
            <ActionForm action={updateUser} submitLabel="Save details">
              <input type="hidden" name="id" value={user.id} />
              <Field label="Full name" htmlFor="full_name">
                <Input id="full_name" name="full_name" defaultValue={user.full_name} required disabled={!canManage} />
              </Field>
              {user.account_type === "staff" && (
                <>
                  <Field label="Employee record" htmlFor="employee_id" hint="Links this sign-in to the person in the company directory (supervisor, department).">
                    <Select id="employee_id" name="employee_id" defaultValue={user.employee_id ?? ""} disabled={!canManage}>
                      <option value="">— Not linked —</option>
                      {(employees ?? []).map((e: { id: string; full_name: string; employee_no: string }) => (
                        <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Sales team (Academy)" htmlFor="team_id">
                    <Select id="team_id" name="team_id" defaultValue={user.team_id ?? ""} disabled={!canManage}>
                      <option value="">— None —</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Hire date" htmlFor="hire_date">
                    <Input id="hire_date" name="hire_date" type="date" defaultValue={user.hire_date ?? ""} disabled={!canManage} />
                  </Field>
                </>
              )}
            </ActionForm>
          </Card>

          {isAcademyManager && (
            <Card>
              <CardTitle>Teams this person manages (Academy)</CardTitle>
              <ActionForm action={setManagedTeams} submitLabel="Save managed teams">
                <input type="hidden" name="id" value={user.id} />
                {teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet. Create one under Organization → Teams.</p>}
                <div className="space-y-2">
                  {teams.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="team_ids" value={t.id} defaultChecked={managedIds.has(t.id)} className="size-4" disabled={!canManage} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Account</CardTitle>
            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd><Badge tone={user.status === "active" ? "success" : pending ? "warning" : "neutral"}>{pending ? "waiting for approval" : user.status}</Badge></dd>
              {user.account_type === "staff" && (
                <>
                  <dt className="text-muted-foreground">Privacy consent</dt>
                  <dd>{user.consent_at ? `${formatDate(user.consent_at)} (${user.consent_version})` : "Not yet"}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Last active</dt>
              <dd>{formatDate(user.last_active_at, true)}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(user.created_at)}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              {user.status === "active" && canManage && (
                <ActionForm action={sendReset} submitLabel="Send password setup email" variant="outline">
                  <input type="hidden" name="email" value={user.email} />
                </ActionForm>
              )}
              {user.status === "active" && can(access, "admin.security.manage") && !isSelf && (
                <ActionForm action={resetMfa} submitLabel="Reset two-step sign-in" variant="outline" confirm="Remove this person's authenticator app? Use this when they lost or changed their phone.">
                  <input type="hidden" name="id" value={user.id} />
                </ActionForm>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Recent sign-ins</CardTitle>
            {(logins ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No sign-ins recorded yet.</p>
            ) : (
              <Table>
                <thead><tr><Th>When</Th><Th>How</Th><Th>Result</Th><Th>Device</Th></tr></thead>
                <tbody>
                  {(logins as { at: string; method: string; success: boolean; ip: string; user_agent: string; reason: string }[]).map((l) => (
                    <tr key={l.at + l.method}>
                      <Td>{formatDate(l.at, true)}</Td>
                      <Td>{l.method.replace("_", " ")}</Td>
                      <Td>{l.success ? <Badge tone="success">ok</Badge> : <Badge tone="danger">{l.reason || "failed"}</Badge>}</Td>
                      <Td className="max-w-48 truncate text-xs text-muted-foreground" title={l.user_agent}>{l.ip} · {l.user_agent}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {!pending && canManage && (
            <Card>
              {user.status === "active" ? (
                <>
                  <CardTitle>Deactivate (left the company)</CardTitle>
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
                      <p className="text-sm text-muted-foreground">Sign-in is blocked, but nothing is deleted: their history stays in reports.</p>
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
                  </dl>
                  <ActionForm action={reactivateUser} submitLabel="Reactivate user" variant="outline">
                    <input type="hidden" name="id" value={user.id} />
                  </ActionForm>
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6">
        <RecordHistory tables={["profiles", "user_roles"]} recordIds={[user.id, ...grants.map((g) => g.id)]} userId={user.id} />
      </div>
    </>
  );
}
