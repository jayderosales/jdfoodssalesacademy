import Link from "next/link";
import { Badge, Button, Card, Input, PageHeader, Select, Table, Td, Th, buttonVariants } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { listTeams } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; team?: string; status?: string }>;
}) {
  const { q, role, team, status = "active" } = await searchParams;
  await requireOwner();
  const supabase = await createClient();
  const teams = await listTeams();
  const teamLabel = new Map(teams.map((t) => [t.id, t.label]));

  let query = supabase.from("profiles").select("*").order("full_name");
  if (status === "pending") query = query.eq("status", "inactive").is("exit_date", null);
  else if (status !== "all") query = query.eq("status", status);
  if (role) query = query.eq("role", role);
  if (team) query = query.eq("team_id", team);
  if (q) {
    const s = q.replace(/[%,()]/g, "");
    query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
  }
  const { data } = await query;
  const users = (data as Profile[] | null) ?? [];

  return (
    <>
      <PageHeader
        title="Users"
        description={`${users.length} shown`}
        actions={<Link href="/admin/users/new" className={buttonVariants()}>Add user</Link>}
      />
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-5">
          <Input name="q" placeholder="Search name or email" defaultValue={q} aria-label="Search" />
          <Select name="role" defaultValue={role ?? ""} aria-label="Role">
            <option value="">All roles</option>
            <option value="rep">Salesperson</option>
            <option value="manager">Sales Manager</option>
            <option value="owner">Owner / Admin</option>
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
              <Th>Role</Th>
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
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </Td>
                <Td>{ROLE_LABEL[u.role]}</Td>
                <Td>{u.team_id ? teamLabel.get(u.team_id) : "—"}</Td>
                <Td>{formatDate(u.hire_date)}</Td>
                <Td>
                  {u.status === "inactive" && !u.exit_date ? (
                    <Badge tone="warning">waiting for approval</Badge>
                  ) : (
                    <Badge tone={u.status === "active" ? "success" : "neutral"}>{u.status}</Badge>
                  )}
                  {!u.consent_at && u.status === "active" && <Badge tone="warning" className="ml-1">no consent yet</Badge>}
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
