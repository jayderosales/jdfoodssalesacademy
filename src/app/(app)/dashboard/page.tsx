import Link from "next/link";
import { Alert, Card, CardTitle, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMyRoleNames } from "@/lib/rbac/queries";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { RepDashboard } from "./rep-dashboard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const profile = await requireUser();
  const supabase = await createClient();
  const firstName = (profile.full_name || profile.email).split(" ")[0];

  // Counts respect RLS: owners see everyone, managers see their teams, reps see themselves.
  const [{ count: activeReps }, { count: teams }, { data: myTeam }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "rep").eq("status", "active"),
    supabase.from("teams").select("id", { count: "exact", head: true }),
    profile.team_id
      ? supabase.from("teams").select("name, locations(name)").eq("id", profile.team_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Staff: roleplays on their reps not yet reviewed.
  let awaitingReview = 0;
  if (profile.role === "owner" || profile.role === "manager") {
    const { data: reps } = await supabase.from("profiles").select("id").eq("role", "rep");
    const ids = (reps ?? []).map((r: { id: string }) => r.id);
    if (ids.length) {
      const { count } = await createAdminClient()
        .from("roleplay_sessions")
        .select("id", { count: "exact", head: true })
        .in("user_id", ids)
        .eq("status", "graded")
        .is("reviewed_at", null);
      awaitingReview = count ?? 0;
    }
  }

  const team = myTeam as unknown as { name: string; locations: { name: string } | { name: string }[] | null } | null;
  const loc = Array.isArray(team?.locations) ? team?.locations[0] : team?.locations;
  const roleNames = await getMyRoleNames(profile.id);
  const teamLabel = team ? `${team.name}${loc?.name ? " · " + loc.name : ""}` : roleNames.join(", ");
  const isAcademyStaff = profile.role === "owner" || profile.role === "manager";

  return (
    <>
      {error === "forbidden" && (
        <div className="mb-4">
          <Alert tone="danger">You don&apos;t have access to that page.</Alert>
        </div>
      )}
      <PageHeader title={`Hi, ${firstName}!`} description={teamLabel} />

      {profile.role === "rep" && <RepDashboard profile={profile} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isAcademyStaff && (
          <>
            <Card>
              <CardTitle>{profile.role === "owner" ? "Active reps (company)" : "Active reps on your teams"}</CardTitle>
              <p className="text-3xl font-bold text-brand">{activeReps ?? 0}</p>
              <Link href="/team" className="mt-2 inline-block text-sm text-brand underline">View reps</Link>
            </Card>
            {profile.role === "owner" && (
              <Card>
                <CardTitle>Teams</CardTitle>
                <p className="text-3xl font-bold text-brand">{teams ?? 0}</p>
                <Link href="/admin/org/teams" className="mt-2 inline-block text-sm text-brand underline">Manage teams</Link>
              </Card>
            )}
            <Card>
              <CardTitle>Roleplays awaiting review</CardTitle>
              <p className="text-3xl font-bold text-brand">{awaitingReview}</p>
              <Link href="/reviews" className="mt-2 inline-block text-sm text-brand underline">Open review queue</Link>
            </Card>
          </>
        )}
        {!profile.role && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardTitle>Welcome to JD Foods OS</CardTitle>
            <p className="text-sm text-muted-foreground">
              This is the start of the company system. More modules (inventory, sales, procurement, accounting) will appear in the menu as they
              go live and your role allows. Use the search box (Ctrl+K) to jump to any page you can open.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
