import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export interface SessionSummary {
  id: string;
  user_id: string;
  scenario_id: string;
  scenario_title: string;
  difficulty: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  reviewed_at: string | null;
  overall: number | null;
  goal_achieved: boolean | null;
  score_source: string | null;
}

/** Sessions with their current score. Caller must have checked access to these users. */
export async function listSessions(filter: { userIds?: string[]; userId?: string; limit?: number; status?: string[] }): Promise<SessionSummary[]> {
  const admin = createAdminClient();
  let q = admin
    .from("roleplay_sessions")
    .select("id, user_id, scenario_id, status, started_at, ended_at, reviewed_at, scenarios(title, difficulty), roleplay_scores(overall, goal_achieved, source, is_current)")
    .order("started_at", { ascending: false })
    .limit(filter.limit ?? 50);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.userIds) q = q.in("user_id", filter.userIds.length ? filter.userIds : ["00000000-0000-0000-0000-000000000000"]);
  if (filter.status) q = q.in("status", filter.status);
  const { data } = await q;
  type Row = {
    id: string; user_id: string; scenario_id: string; status: string; started_at: string; ended_at: string | null; reviewed_at: string | null;
    scenarios: { title: string; difficulty: string } | null;
    roleplay_scores: { overall: number; goal_achieved: boolean; source: string; is_current: boolean }[];
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const cur = r.roleplay_scores.find((s) => s.is_current);
    return {
      id: r.id,
      user_id: r.user_id,
      scenario_id: r.scenario_id,
      scenario_title: r.scenarios?.title ?? "Scenario",
      difficulty: r.scenarios?.difficulty ?? "",
      status: r.status,
      started_at: r.started_at,
      ended_at: r.ended_at,
      reviewed_at: r.reviewed_at,
      overall: cur ? Number(cur.overall) : null,
      goal_achieved: cur?.goal_achieved ?? null,
      score_source: cur?.source ?? null,
    };
  });
}
