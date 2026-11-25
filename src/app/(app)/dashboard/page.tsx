import Link from "next/link";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { ProgressBar } from "@/components/progress-bar";
import { requireUser } from "@/lib/auth";
import { loadLearnerState } from "@/lib/learning/load";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

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
      ? supabase.from("teams").select("name, branches(name)").eq("id", profile.team_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Staff: roleplays on their reps not yet reviewed.
  let awaitingReview = 0;
  if (profile.role !== "rep") {
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

  // Rep: next unlocked, unfinished lesson across their paths.
  let nextLesson: { id: string; title: string; module: string } | null = null;
  let onboarding: { completed: number; total: number } | null = null;
  if (profile.role === "rep") {
    const state = await loadLearnerState(profile.id);
    onboarding = { completed: 0, total: 0 };
    for (const tree of state.trees) {
      const access = state.access.get(tree.id)!;
      onboarding.completed += access.completed;
      onboarding.total += access.total;
      for (const m of tree.modules) {
        for (const l of m.lessons) {
          const la = access.lessons.get(l.id)!;
          if (!nextLesson && !la.completed && !la.locked) nextLesson = { id: l.id, title: l.title, module: m.title };
        }
      }
    }
  }

  const team = myTeam as unknown as { name: string; branches: { name: string } | { name: string }[] | null } | null;
  const branch = Array.isArray(team?.branches) ? team?.branches[0] : team?.branches;
  const teamLabel = team ? `${team.name}${branch?.name ? " · " + branch.name : ""}` : "No team yet";

  return (
    <>
      {error === "forbidden" && (
        <div className="mb-4">
          <Alert tone="danger">You don&apos;t have access to that page.</Alert>
        </div>
      )}
      <PageHeader title={`Hi, ${firstName}!`} description={teamLabel} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profile.role === "rep" && (
          <>
            <Card>
              <CardTitle>Your level</CardTitle>
              <p className="text-3xl font-bold text-brand">Level 0</p>
              <p className="text-sm text-muted-foreground">Trainee · hired {formatDate(profile.hire_date)}</p>
              <p className="mt-3 text-xs text-muted-foreground">Progress to the next level shows here from Phase 4.</p>
            </Card>
            <Card>
              <CardTitle>Next up</CardTitle>
              {nextLesson ? (
                <>
                  <p className="text-sm text-muted-foreground">{nextLesson.module}</p>
                  <p className="font-medium">{nextLesson.title}</p>
                  <Link href={`/learn/lessons/${nextLesson.id}`} className="mt-3 inline-block text-sm text-brand underline">Continue learning</Link>
                </>
              ) : onboarding && onboarding.total > 0 ? (
                <p className="text-sm">All lessons done! Check your <Link href="/quizzes" className="text-brand underline">quizzes</Link>.</p>
              ) : (
                <p className="text-sm">No learning path assigned yet. Ask your manager.</p>
              )}
              {onboarding && onboarding.total > 0 && (
                <div className="mt-4">
                  <ProgressBar value={onboarding.completed} max={onboarding.total} label="Onboarding" />
                </div>
              )}
            </Card>
          </>
        )}

        {profile.role !== "rep" && (
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
                <Link href="/admin/teams" className="mt-2 inline-block text-sm text-brand underline">Manage teams</Link>
              </Card>
            )}
            <Card>
              <CardTitle>Roleplays awaiting review</CardTitle>
              <p className="text-3xl font-bold text-brand">{awaitingReview}</p>
              <Link href="/reviews" className="mt-2 inline-block text-sm text-brand underline">Open review queue</Link>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
