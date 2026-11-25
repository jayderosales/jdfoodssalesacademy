import Link from "next/link";
import { Badge, Button, Card, Input, PageHeader, Select, Table, Td, Th, buttonVariants } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { listTeams } from "@/lib/org";
import { grantLabel, listGrants, listRoles } from "@/lib/rbac/queries";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Users" };

const ACCOUNT_LABEL: Record<string, string> = { staff: "Staff", customer: "Customer", distributor: "Distributor", supplier: "Supplier" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; team?: string; status?: string; type?: string }>;
}) {
  const { q, role, team, type, status = "active" } = await searchParams;
  await requirePermission("admin.users.view");
  const access = await getAccess();
  const supabase = await createClient();
  const [teams, roles] = await Promise.all([listTeams(), listRoles()]);
  const teamLabel = new Map(teams.map((t) => [t.id, t.label]));

  let query = supabase.from("profiles").select("*").order("full_name");
  if (status === "pending") query = query.eq("status", "inactive").is("approved_at", null);
  else if (status !== "all") query = query.eq("status", status);
  if (type) query = query.eq("account_type", type);
  if (team) query = query.eq("team_id", team);
  if (role) {
    const { data: holders } = await supabase.from("user_roles").select("user_id").eq("role_id", role);
    const ids = (holders ?? []).map((h: { user_id: string }) => h.user_id);
    query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  if (q) {
    const s = q.replace(/[%,()]/g, "");
    query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,company_name.ilike.%${s}%`);
  }
  const { data } = await query;
  const users = (data as Profile[] | null) ?? [];
  const grants = await listGrants(users.map((u) => u.id));
  const grantsByUser = new Map<string, string[]>();
  for (const g of grants) grantsByUser.set(g.user_id, [...(grantsByUser.get(g.user_id) ?? []), grantLabel(g)]);

  const { count: pendingCount } = await supabase
    .from("profiles").select("id", { count: "exact", head: true }).eq("status", "inactive").is("approved_at", null);

  return (
    <>
      <PageHeader
        title="Users"
        description={`${users.length} shown`}
        actions={can(access, "admin.users.manage") ? <Link href="/admin/users/new" className={buttonVariants()}>Add staff user</Link> : undefined}
      />
      {!!pendingCount && status !== "pending" && (
        <Link href="/admin/users?status=pending" className="mb-4 block rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {pendingCount} sign-up{pendingCount === 1 ? " is" : "s are"} waiting for approval. Review →
        </Link>
      )}
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Input name="q" placeholder="Search name, email, company" defaultValue={q} aria-label="Search" />
          <Select name="role" defaultValue={role ?? ""} aria-label="Role">
            <option value="">All roles</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select name="type" defaultValue={type ?? ""} aria-label="Account type">
            <option value="">All account types</option>
            {Object.entries(ACCOUNT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select name="team" defaultValue={team ?? ""} aria-label="Team">
            <option value="">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          <Select name="status" defaultValue={status} aria-label="Status">
            <option value="active">Active</option>
            <option value="pending">Waiting for approval</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Roles</Th>
              <Th>Team</Th>
              <Th>Hire date</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td>
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-brand underline">{u.full_name || "(no name)"}</Link>
                  <div className="text-xs text-muted-foreground">
                    {u.email}
                    {u.account_type !== "staff" && ` · ${ACCOUNT_LABEL[u.account_type]}${u.company_name ? ` · ${u.company_name}` : ""}`}
                  </div>
                </Td>
                <Td className="text-sm">{grantsByUser.get(u.id)?.join(", ") || <span className="text-muted-foreground">No roles</span>}</Td>
                <Td>{u.team_id ? teamLabel.get(u.team_id) : "—"}</Td>
                <Td>{formatDate(u.hire_date)}</Td>
                <Td>
                  {u.status === "inactive" && !u.approved_at ? (
                    <Badge tone="warning">waiting for approval</Badge>
                  ) : (
                    <Badge tone={u.status === "active" ? "success" : "neutral"}>{u.status}</Badge>
                  )}
                  {!u.consent_at && u.status === "active" && u.account_type === "staff" && <Badge tone="warning" className="ml-1">no consent yet</Badge>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {users.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No users match.</p>}
      </Card>
    </>
  );
}
