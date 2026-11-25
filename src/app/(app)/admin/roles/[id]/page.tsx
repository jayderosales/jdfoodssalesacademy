import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { Alert, Badge, Card, CardTitle, Field, Input, PageHeader } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { MODULE_LABELS } from "@/lib/rbac/permissions";
import type { RoleRow } from "@/lib/rbac/queries";
import { createClient } from "@/lib/supabase/server";
import { deleteRole, setRolePermissions, updateRole } from "../actions";

export const metadata = { title: "Role" };

interface PermRow {
  code: string;
  module: string;
  description: string;
  is_restricted: boolean;
}

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(["admin.roles.manage", "admin.users.view"]);
  const access = await getAccess();
  const canEdit = can(access, "admin.roles.manage");
  const supabase = await createClient();
  const [{ data: role }, { data: perms }, { data: granted }, { data: holders }] = await Promise.all([
    supabase.from("roles").select("*").eq("id", id).maybeSingle(),
    supabase.from("permissions").select("*").order("module").order("code"),
    supabase.from("role_permissions").select("permission_code").eq("role_id", id),
    supabase.from("user_roles").select("user_id, profiles!user_roles_user_id_fkey(full_name, email)").eq("role_id", id),
  ]);
  if (!role) notFound();
  const r = role as RoleRow;
  const has = new Set(((granted as { permission_code: string }[] | null) ?? []).map((g) => g.permission_code));
  const byModule = new Map<string, PermRow[]>();
  for (const p of (perms as PermRow[] | null) ?? []) byModule.set(p.module, [...(byModule.get(p.module) ?? []), p]);
  const people = ((holders as unknown as { user_id: string; profiles: { full_name: string; email: string } | null }[] | null) ?? []);

  return (
    <>
      <PageHeader
        title={r.name}
        description={`${r.is_internal ? "Staff role" : "Portal role"}${r.is_system ? " · built-in" : " · custom"} · code ${r.code}`}
        actions={<Link href="/admin/roles" className="text-sm text-brand underline">All roles</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Permissions</CardTitle>
          {r.grants_all ? (
            <Alert>This role has every permission, including ones added in future phases.</Alert>
          ) : (
            <ActionForm action={setRolePermissions} submitLabel="Save permissions">
              <input type="hidden" name="id" value={r.id} />
              {[...byModule.entries()].map(([mod, list]) => (
                <fieldset key={mod} className="rounded border p-3">
                  <legend className="px-1 text-sm font-semibold">{MODULE_LABELS[mod] ?? mod}</legend>
                  <div className="space-y-2">
                    {list.map((p) => (
                      <label key={p.code} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name="perms" value={p.code} defaultChecked={has.has(p.code)} disabled={!canEdit} className="mt-1 size-4" />
                        <span>
                          {p.description} {p.is_restricted && <Badge tone="warning">restricted</Badge>}
                          <span className="block font-mono text-[11px] text-muted-foreground">{p.code}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </ActionForm>
          )}
        </Card>
        <div className="space-y-4">
          {canEdit && (
            <Card>
              <CardTitle>Details</CardTitle>
              <ActionForm action={updateRole} submitLabel="Save">
                <input type="hidden" name="id" value={r.id} />
                <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={r.name} required /></Field>
                <Field label="Description" htmlFor="description"><Input id="description" name="description" defaultValue={r.description} /></Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={r.active} className="size-4" /> Active (inactive roles grant nothing)
                </label>
              </ActionForm>
            </Card>
          )}
          <Card>
            <CardTitle>People with this role ({people.length})</CardTitle>
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {people.map((p) => (
                  <li key={p.user_id}><Link href={`/admin/users/${p.user_id}`} className="text-brand underline">{p.profiles?.full_name || p.profiles?.email}</Link></li>
                ))}
              </ul>
            )}
          </Card>
          {canEdit && !r.is_system && (
            <Card>
              <CardTitle>Delete role</CardTitle>
              <ActionForm action={deleteRole} submitLabel="Delete role" variant="danger" confirm={`Delete the role "${r.name}"?`}>
                <input type="hidden" name="id" value={r.id} />
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
      <div className="mt-6">
        <RecordHistory tables={["roles"]} recordIds={[r.id]} />
      </div>
    </>
  );
}
