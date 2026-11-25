import Link from "next/link";
import { Badge, Card, Input, PageHeader, Select, Table, Td, Th, Button } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { listTeams } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ team?: string; q?: string; status?: string }> }) {
  const { team, q, status = "active" } = await searchParams;
  const profile = await requireStaff();
  const supabase = await createClient();
  const teams = await listTeams();

  // RLS limits managers to reps on the teams they manage.
  let query = supabase.from("profiles").select("*").eq("role", "rep").order("full_name");
  if (status !== "all") query = query.eq("status", status);
  if (team) query = query.eq("team_id", team);
  if (q) query = query.or(`full_name.ilike.%${q.replace(/[%,()]/g, "")}%,email.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query;
  const reps = (data as Profile[] | null) ?? [];
  const teamLabel = new Map(teams.map((t) => [t.id, t.label]));

  return (
    <>
      <PageHeader
        title={profile.role === "owner" ? "All reps" : "My team"}
        description="Level, skill score, onboarding progress and at-risk flags arrive in Phase 4."
      />
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-4">
          <Input name="q" placeholder="Search name or email" defaultValue={q} aria-label="Search" />
          <Select name="team" defaultValue={team ?? ""} aria-label="Team">
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
          <Select name="status" defaultValue={status} aria-label="Status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
          <Button type="submit" variant="outline">Filter</Button>
        </form>

        {reps.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No reps found.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Team</Th>
                <Th>Hire date</Th>
                <Th>Last active</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/team/${r.id}`} className="font-medium text-brand underline">{r.full_name || r.email}</Link>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </Td>
                  <Td>{r.team_id ? teamLabel.get(r.team_id) : "—"}</Td>
                  <Td>{formatDate(r.hire_date)}</Td>
                  <Td>{formatDate(r.last_active_at, true)}</Td>
                  <Td>
                    <Badge tone={r.status === "active" ? "success" : "neutral"}>{r.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
