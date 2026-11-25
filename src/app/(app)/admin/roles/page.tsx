import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { listRoles } from "@/lib/rbac/queries";
import { createClient } from "@/lib/supabase/server";
import { createRole } from "./actions";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  await requirePermission(["admin.roles.manage", "admin.users.view"]);
  const access = await getAccess();
  const canEdit = can(access, "admin.roles.manage");
  const supabase = await createClient();
  const [roles, { data: grants }, { data: perms }] = await Promise.all([
    listRoles(),
    supabase.from("user_roles").select("role_id"),
    supabase.from("role_permissions").select("role_id"),
  ]);
  const holders = new Map<string, number>();
  for (const g of (grants as { role_id: string }[] | null) ?? []) holders.set(g.role_id, (holders.get(g.role_id) ?? 0) + 1);
  const permCount = new Map<string, number>();
  for (const p of (perms as { role_id: string }[] | null) ?? []) permCount.set(p.role_id, (permCount.get(p.role_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Roles & permissions" description="A role is a bundle of permissions. People get one or more roles under Users." />
      <Card className="mb-4">
        <Table>
          <thead>
            <tr><Th>Role</Th><Th>Type</Th><Th>Permissions</Th><Th>People</Th></tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/roles/${r.id}`} className="font-medium text-brand underline">{r.name}</Link>
                  {!r.active && <Badge className="ml-2">inactive</Badge>}
                  <div className="text-xs text-muted-foreground">{r.description}</div>
                </Td>
                <Td>{r.is_internal ? "Staff" : "Portal"}{!r.is_system && <Badge className="ml-1">custom</Badge>}</Td>
                <Td>{r.grants_all ? "All" : (permCount.get(r.id) ?? 0)}</Td>
                <Td>{holders.get(r.id) ?? 0}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {canEdit && (
        <Card className="max-w-2xl">
          <CardTitle>Add a custom role</CardTitle>
          <ActionForm action={createRole} submitLabel="Create role">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="name"><Input id="name" name="name" required placeholder="e.g. Branch cashier" /></Field>
              <Field label="Code" htmlFor="code" hint="Lowercase, no spaces. Can't be changed later."><Input id="code" name="code" required placeholder="branch_cashier" /></Field>
              <Field label="Who is it for?" htmlFor="is_internal">
                <Select id="is_internal" name="is_internal" defaultValue="true">
                  <option value="true">Staff (two-step sign-in required)</option>
                  <option value="false">Portal users (customers, distributors, suppliers)</option>
                </Select>
              </Field>
              <Field label="Description" htmlFor="description"><Input id="description" name="description" /></Field>
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
