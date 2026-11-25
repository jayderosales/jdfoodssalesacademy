import "server-only";
import { getSettings } from "@/lib/auth";
import { CRITERIA_KEYS } from "@/lib/ai/prompts/grader";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { manilaMonthStart, manilaToday } from "@/lib/utils";
import {
  atRiskReasons, competencyAverages, computeLevel, daysBetween, hardestQuestions, median, quizStats,
  type LevelResult, type LevelRule, type RepActivity,
} from "./metrics";

export interface RepRow {
  id: string;
  name: string;
  email: string;
  team: string;
  status: "active" | "inactive";
  hireDate: string | null;
  lastActiveAt: string | null;
  onboardingPct: number;
  lessonsDone: number;
  lessonsTotal: number;
  quizzesPassed: number;
  quizzesTotal: number;
  roleplays: number;
  roleplayAvg: number | null;
  level: LevelResult;
  daysToFieldReady: number | null;
  atRisk: string[];
  competencies: Record<string, number | null>;
  exitDate: string | null;
  exitReason: string | null;
  exitStageLevel: number | null;
}

export interface Report {
  generatedAt: string;
  scopeLabel: string;
  isOwner: boolean;
  reps: RepRow[];
  overview: {
    activeReps: number;
    avgOnboardingPct: number | null;
    fieldReadyCount: number;
    medianDaysToFieldReady: number | null;
    onboardingTargetDays: number;
    quizFirstAttemptPassRate: number | null;
    roleplaysThisMonth: number;
    roleplayAvgThisMonth: number | null;
    atRiskCount: number;
    aiCostThisMonthUsd: number;
  };
  quizzes: { quizId: string; title: string; kind: string; attempts: number; takers: number; passRate: number; firstAttemptPassRate: number; avgScore: number | null }[];
  hardest: { questionId: string; prompt: string; quiz: string; answers: number; correctRate: number }[];
  teamCompetencies: Record<string, number | null>;
  scenarios: { title: string; difficulty: string; sessions: number; avg: number | null; goalRate: number | null }[];
  aiByMonth: { month: string; byFeature: Record<string, number>; total: number }[];
  levelCounts: { level: number; name: string; count: number }[];
}

/** Fetch `.in()` in chunks so long ID lists don't exceed URL limits. */
async function inChunks<T>(ids: string[], size: number, fetch: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fetch(ids.slice(i, i + size))));
  return out;
}

export async function buildReport(viewer: Profile, opts: { teamId?: string } = {}): Promise<Report> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const settings = (await getSettings())!;

  // RLS decides which reps the viewer may see (owner: all; manager: their teams).
  let pq = supabase.from("profiles").select("*").eq("role", "rep");
  if (opts.teamId) pq = pq.eq("team_id", opts.teamId);
  const { data: profileRows } = await pq;
  const profiles = (profileRows ?? []) as Profile[];
  const ids = profiles.map((p) => p.id);

  const [{ data: teams }, { data: levelRows }, { data: paths }, { data: quizRows }] = await Promise.all([
    admin.from("teams").select("id, name"),
    admin.from("levels").select("level, name, requires_signoff, requirements").order("level"),
    admin
      .from("learning_paths")
      .select("id, is_default, modules(id, category, lessons(id, published))")
      .eq("published", true),
    admin.from("quizzes").select("id, title, kind, module_id, path_id, modules(category)").eq("published", true),
  ]);
  const teamName = new Map((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  const rules = (levelRows ?? []) as LevelRule[];

  const [assignments, progress, attempts, sessions, signoffs, usage] = await Promise.all([
    inChunks(ids, 150, async (c) => (await admin.from("path_assignments").select("user_id, path_id").in("user_id", c)).data ?? []),
    inChunks(ids, 150, async (c) =>
      (await admin.from("lesson_progress").select("user_id, lesson_id, completed_at").eq("status", "completed").in("user_id", c)).data ?? [],
    ),
    inChunks(ids, 150, async (c) =>
      (await admin.from("quiz_attempts").select("id, quiz_id, user_id, submitted_at, score_pct, passed").not("submitted_at", "is", null).in("user_id", c)).data ?? [],
    ),
    inChunks(ids, 150, async (c) =>
      (
        await admin
          .from("roleplay_sessions")
          .select("id, user_id, ended_at, started_at, scenarios(title, difficulty), roleplay_scores(overall, scores, goal_achieved, is_current)")
          .eq("status", "graded")
          .in("user_id", c)
      ).data ?? [],
    ),
    inChunks(ids, 150, async (c) => (await admin.from("level_signoffs").select("user_id, level, created_at").in("user_id", c)).data ?? []),
    viewer.role === "owner"
      ? admin.from("ai_usage").select("feature, cost_usd, created_at").gte("created_at", new Date(Date.now() - 183 * 86_400_000).toISOString()).then((r) => r.data ?? [])
      : inChunks(ids, 150, async (c) =>
          (await admin.from("ai_usage").select("feature, cost_usd, created_at").gte("created_at", new Date(Date.now() - 183 * 86_400_000).toISOString()).in("user_id", c)).data ?? [],
        ),
  ]);

  type PathRow = { id: string; is_default: boolean; modules: { id: string; category: string; lessons: { id: string; published: boolean }[] }[] };
  const pathList = (paths ?? []) as unknown as PathRow[];
  const defaultPath = pathList.find((p) => p.is_default);
  type QuizRow = { id: string; title: string; kind: string; module_id: string | null; path_id: string | null; modules: { category: string } | null };
  const quizzes = (quizRows ?? []) as unknown as QuizRow[];
  const moduleQuizzes = quizzes.filter((q) => q.kind === "module" && q.module_id);

  type SessionRow = {
    id: string; user_id: string; ended_at: string | null; started_at: string;
    scenarios: { title: string; difficulty: string } | null;
    roleplay_scores: { overall: number; scores: Record<string, number>; goal_achieved: boolean; is_current: boolean }[];
  };
  const graded = (sessions as unknown as SessionRow[])
    .map((s) => ({ ...s, score: s.roleplay_scores.find((x) => x.is_current) ?? null }))
    .filter((s) => s.score);

  const now = new Date();
  const reps: RepRow[] = profiles.map((p) => {
    // learning paths for this rep: assigned + default
    const myPathIds = new Set([...(defaultPath ? [defaultPath.id] : []), ...assignments.filter((a) => a.user_id === p.id).map((a) => a.path_id)]);
    const myModules = pathList.filter((pa) => myPathIds.has(pa.id)).flatMap((pa) => pa.modules);
    const myLessons = myModules.flatMap((m) => m.lessons.filter((l) => l.published).map((l) => ({ id: l.id, moduleId: m.id, category: m.category })));
    const done = new Map(progress.filter((r) => r.user_id === p.id).map((r) => [r.lesson_id, r.completed_at as string]));

    const categoryDoneAt: Record<string, string> = {};
    const cats = new Set(myModules.map((m) => m.category));
    cats.forEach((c) => {
      const ls = myLessons.filter((l) => l.category === c);
      if (ls.length && ls.every((l) => done.has(l.id))) categoryDoneAt[c] = ls.map((l) => done.get(l.id)!).sort().at(-1)!;
    });

    const myAttempts = attempts.filter((t) => t.user_id === p.id);
    const myModuleIds = new Set(myModules.map((m) => m.id));
    const myQuizzes = moduleQuizzes.filter((q) => myModuleIds.has(q.module_id!));
    const activityQuizzes = myQuizzes.map((q) => ({
      quizId: q.id,
      category: q.modules?.category ?? "general",
      attempts: myAttempts.filter((t) => t.quiz_id === q.id).map((t) => ({ at: t.submitted_at as string, score: t.score_pct == null ? null : Number(t.score_pct), passed: t.passed })),
    }));
    const certIds = new Set(quizzes.filter((q) => q.kind === "certification").map((q) => q.id));
    const myRoleplays = graded.filter((s) => s.user_id === p.id);

    const activity: RepActivity = {
      hireDate: p.hire_date,
      createdAt: p.created_at,
      lastActiveAt: p.last_active_at,
      categoryDoneAt,
      quizzes: activityQuizzes,
      certification: myAttempts.filter((t) => certIds.has(t.quiz_id)).map((t) => ({ at: t.submitted_at as string, passed: t.passed })),
      roleplays: myRoleplays.map((s) => ({ difficulty: s.scenarios?.difficulty ?? "", overall: Number(s.score!.overall), at: s.ended_at ?? s.started_at })),
      signoffs: Object.fromEntries(signoffs.filter((s) => s.user_id === p.id).map((s) => [s.level, s.created_at as string])),
    };
    const level = computeLevel(rules, activity);
    const start = p.hire_date ?? p.created_at;
    const lessonsDone = myLessons.filter((l) => done.has(l.id)).length;
    const rpScores = myRoleplays.map((s) => Number(s.score!.overall));

    return {
      id: p.id,
      name: p.full_name || p.email,
      email: p.email,
      team: p.team_id ? teamName.get(p.team_id) ?? "—" : "—",
      status: p.status,
      hireDate: p.hire_date,
      lastActiveAt: p.last_active_at,
      onboardingPct: myLessons.length ? Math.round((lessonsDone / myLessons.length) * 100) : 0,
      lessonsDone,
      lessonsTotal: myLessons.length,
      quizzesPassed: activityQuizzes.filter((q) => q.attempts.some((a) => a.passed)).length,
      quizzesTotal: activityQuizzes.length,
      roleplays: myRoleplays.length,
      roleplayAvg: rpScores.length ? rpScores.reduce((a, b) => a + b, 0) / rpScores.length : null,
      level,
      daysToFieldReady: level.achievedAt[2] ? Math.max(0, daysBetween(start, level.achievedAt[2])) : null,
      atRisk: p.status === "active" ? atRiskReasons(activity, level.level, settings, now) : [],
      competencies: competencyAverages(myRoleplays.map((s) => s.score!.scores)),
      exitDate: p.exit_date,
      exitReason: p.exit_reason,
      exitStageLevel: p.exit_stage_level,
    };
  });

  const active = reps.filter((r) => r.status === "active");
  const monthStart = manilaMonthStart(now);
  const visibleGraded = graded;
  const thisMonth = visibleGraded.filter((s) => new Date(s.ended_at ?? s.started_at) >= monthStart);

  // quizzes
  const attemptRows = attempts.map((t) => ({ quizId: t.quiz_id, userId: t.user_id, submittedAt: t.submitted_at as string, passed: t.passed, score: t.score_pct == null ? null : Number(t.score_pct) }));
  const qStats = quizStats(attemptRows);
  const quizTitle = new Map(quizzes.map((q) => [q.id, q]));
  const firstAttempts = qStats.reduce((acc, q) => ({ n: acc.n + q.takers, pass: acc.pass + q.firstAttemptPassRate * q.takers }), { n: 0, pass: 0 });

  // hardest questions
  const attemptIds = attempts.map((t) => t.id as string);
  const answers = await inChunks(attemptIds, 150, async (c) => (await admin.from("quiz_answers").select("question_id, points").in("attempt_id", c)).data ?? []);
  const hard = hardestQuestions(answers.map((a) => ({ questionId: a.question_id, points: Number(a.points) })));
  const { data: qRows } = hard.length
    ? await admin.from("questions").select("id, prompt, quiz_id").in("id", hard.map((h) => h.questionId))
    : { data: [] };
  const qMap = new Map((qRows ?? []).map((q: { id: string; prompt: string; quiz_id: string }) => [q.id, q]));

  // scenarios
  const byScenario = new Map<string, { title: string; difficulty: string; scores: number[]; goals: number }>();
  visibleGraded.forEach((s) => {
    const key = s.scenarios?.title ?? "?";
    const cur = byScenario.get(key) ?? { title: key, difficulty: s.scenarios?.difficulty ?? "", scores: [], goals: 0 };
    cur.scores.push(Number(s.score!.overall));
    if (s.score!.goal_achieved) cur.goals++;
    byScenario.set(key, cur);
  });

  // AI cost by Manila month
  const months = new Map<string, Record<string, number>>();
  (usage as { feature: string; cost_usd: number; created_at: string }[]).forEach((u) => {
    const m = manilaToday(new Date(u.created_at)).slice(0, 7);
    const rec = months.get(m) ?? {};
    rec[u.feature] = (rec[u.feature] ?? 0) + Number(u.cost_usd);
    months.set(m, rec);
  });
  const thisMonthKey = manilaToday(now).slice(0, 7);

  const fieldReadyDays = active.map((r) => r.daysToFieldReady).filter((d): d is number => d != null);
  const rpThisMonth = thisMonth.map((s) => Number(s.score!.overall));

  return {
    generatedAt: now.toISOString(),
    scopeLabel: opts.teamId ? teamName.get(opts.teamId) ?? "Team" : viewer.role === "owner" ? "All teams" : "My teams",
    isOwner: viewer.role === "owner",
    reps,
    overview: {
      activeReps: active.length,
      avgOnboardingPct: active.length ? Math.round(active.reduce((s, r) => s + r.onboardingPct, 0) / active.length) : null,
      fieldReadyCount: active.filter((r) => r.level.level >= 2).length,
      medianDaysToFieldReady: median(fieldReadyDays),
      onboardingTargetDays: settings.onboarding_target_days,
      quizFirstAttemptPassRate: firstAttempts.n ? firstAttempts.pass / firstAttempts.n : null,
      roleplaysThisMonth: thisMonth.length,
      roleplayAvgThisMonth: rpThisMonth.length ? rpThisMonth.reduce((a, b) => a + b, 0) / rpThisMonth.length : null,
      atRiskCount: active.filter((r) => r.atRisk.length).length,
      aiCostThisMonthUsd: Object.values(months.get(thisMonthKey) ?? {}).reduce((a, b) => a + b, 0),
    },
    quizzes: qStats
      .map((q) => ({ ...q, title: quizTitle.get(q.quizId)?.title ?? "Quiz", kind: quizTitle.get(q.quizId)?.kind ?? "module" }))
      .sort((a, b) => a.firstAttemptPassRate - b.firstAttemptPassRate),
    hardest: hard.map((h) => ({ ...h, prompt: qMap.get(h.questionId)?.prompt ?? "?", quiz: quizTitle.get(qMap.get(h.questionId)?.quiz_id ?? "")?.title ?? "" })),
    teamCompetencies: Object.fromEntries(
      CRITERIA_KEYS.map((k) => [k, competencyAverages(visibleGraded.map((s) => s.score!.scores))[k] ?? null]),
    ),
    scenarios: [...byScenario.values()]
      .map((s) => ({ title: s.title, difficulty: s.difficulty, sessions: s.scores.length, avg: s.scores.reduce((a, b) => a + b, 0) / s.scores.length, goalRate: s.goals / s.scores.length }))
      .sort((a, b) => b.sessions - a.sessions),
    aiByMonth: [...months]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, byFeature]) => ({ month, byFeature, total: Object.values(byFeature).reduce((a, b) => a + b, 0) })),
    levelCounts: rules.map((r) => ({ level: r.level, name: r.name, count: active.filter((x) => x.level.level === r.level).length })),
  };
}
