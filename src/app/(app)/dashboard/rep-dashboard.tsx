import Link from "next/link";
import { CheckCircle2, Circle, Flame, Lightbulb, MessageSquare } from "lucide-react";
import { ProgressBar } from "@/components/progress-bar";
import { DifficultyBadge, ScoreBadge } from "@/components/roleplay-badges";
import { Badge, Card, CardTitle, buttonVariants } from "@/components/ui";
import { CRITERIA_KEYS } from "@/lib/ai/prompts/grader";
import { loadLearnerState } from "@/lib/learning/load";
import { buildReport } from "@/lib/reports/load";
import { practiceStreak, weakestSkill } from "@/lib/reports/streak";
import { CRITERIA_LABEL } from "@/lib/roleplay/scoring";
import { listSessions } from "@/lib/roleplay/queries";
import { createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const TIPS: Record<string, string> = {
  opening: "Greet, introduce yourself and JD Foods in one line, then ask about their business before pitching.",
  discovery: "Ask two or three open questions (volume, best sellers, current supplier) before recommending anything.",
  product: "Review the product lessons. Quote only facts you're sure of, and say you'll check the rest.",
  value: "Connect each product to what the customer told you: more sales, less prep, consistent taste.",
  objections: "Use LAER: Listen, Acknowledge, Explore, Respond. Ask what's behind the objection before answering.",
  closing: "Always ask for a clear next step: a trial order, a sampling visit, or a callback time.",
  communication: "Keep it short and polite, use \"po\" naturally, and let the customer finish talking.",
};

const DIFFICULTY_FOR_LEVEL = (level: number) => (level < 2 ? "easy" : level < 3 ? "medium" : "hard");

export async function RepDashboard({ profile }: { profile: Profile }) {
  const admin = createAdminClient();
  const [report, state, sessions, { data: scenarios }, { data: progress }, { data: attempts }] = await Promise.all([
    buildReport(profile),
    loadLearnerState(profile.id),
    listSessions({ userId: profile.id, limit: 100 }),
    admin.from("scenarios").select("id, title, difficulty").eq("active", true).eq("is_prehire", false),
    admin.from("lesson_progress").select("completed_at, started_at").eq("user_id", profile.id),
    admin
      .from("quiz_attempts")
      .select("id, submitted_at, score_pct, passed, needs_review, quizzes(title)")
      .eq("user_id", profile.id)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(20),
  ]);
  const me = report.reps.find((r) => r.id === profile.id);
  const level = me?.level;
  const levels = report.levelCounts; // all level names in order

  // next lesson + onboarding progress
  let nextLesson: { id: string; title: string; module: string } | null = null;
  let completed = 0;
  let total = 0;
  for (const tree of state.trees) {
    const access = state.access.get(tree.id)!;
    completed += access.completed;
    total += access.total;
    for (const m of tree.modules) for (const l of m.lessons) {
      const la = access.lessons.get(l.id)!;
      if (!nextLesson && !la.completed && !la.locked) nextLesson = { id: l.id, title: l.title, module: m.title };
    }
  }

  // streak from any learning activity
  type AttemptRow = { id: string; submitted_at: string; score_pct: number | null; passed: boolean | null; needs_review: boolean; quizzes: { title: string } | null };
  const quizRows = (attempts ?? []) as unknown as AttemptRow[];
  const streak = practiceStreak([
    ...(progress ?? []).flatMap((p: { completed_at: string | null; started_at: string }) => [p.completed_at, p.started_at]),
    ...quizRows.map((a) => a.submitted_at),
    ...sessions.map((s) => s.ended_at ?? s.started_at),
  ]);

  // recommendation: weakest skill + a scenario at the right difficulty (unplayed first, then lowest best score)
  const skills = me?.competencies ?? {};
  const weakest = weakestSkill(skills, CRITERIA_KEYS);
  const target = DIFFICULTY_FOR_LEVEL(level?.level ?? 0);
  const best = new Map<string, number>();
  sessions.forEach((s) => s.overall != null && best.set(s.scenario_id, Math.max(best.get(s.scenario_id) ?? 0, s.overall)));
  const pick = ((scenarios ?? []) as { id: string; title: string; difficulty: string }[])
    .filter((s) => s.difficulty === target)
    .sort((a, b) => (best.get(a.id) ?? -1) - (best.get(b.id) ?? -1))[0];
  const graded = sessions.filter((s) => s.overall != null);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ---------------------------------------------------------- level */}
      <Card className="lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="mb-1">Your level</CardTitle>
            <p className="text-3xl font-bold text-brand">Level {level?.level ?? 0}</p>
            <p className="text-sm text-muted-foreground">{level?.name ?? "Trainee"} · hired {formatDate(profile.hire_date)}</p>
          </div>
          <ol className="flex items-center gap-1" aria-label="Level progress">
            {levels.map((l) => (
              <li
                key={l.level}
                title={`L${l.level} · ${l.name}`}
                className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold ${
                  (level?.level ?? 0) >= l.level ? "bg-brand text-white" : "border bg-card text-muted-foreground"
                }`}
              >
                <span className="sr-only">{(level?.level ?? 0) >= l.level ? "Reached" : "Not yet"}: </span>
                {l.level}
              </li>
            ))}
          </ol>
        </div>
        {level?.next ? (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">To reach Level {level.next.level} · {level.next.name}:</p>
            <ul className="space-y-1.5 text-sm">
              {level.next.missing.map((m) => (
                <li key={m} className="flex items-start gap-2">
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> {m}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden /> You&apos;ve reached the top level. Great work!</p>
        )}
      </Card>

      {/* ---------------------------------------------------------- next up */}
      <Card>
        <CardTitle>Next up</CardTitle>
        {nextLesson ? (
          <>
            <p className="text-sm text-muted-foreground">{nextLesson.module}</p>
            <p className="font-medium">{nextLesson.title}</p>
            <Link href={`/learn/lessons/${nextLesson.id}`} className={buttonVariants({ size: "sm", className: "mt-3" })}>Continue learning</Link>
          </>
        ) : total > 0 ? (
          <p className="text-sm">All lessons done! Check your <Link href="/quizzes" className="text-brand underline">quizzes</Link>.</p>
        ) : (
          <p className="text-sm">No learning path assigned yet. Ask your manager.</p>
        )}
        {total > 0 && <div className="mt-4"><ProgressBar value={completed} max={total} label="Onboarding" /></div>}
      </Card>

      {/* ---------------------------------------------------------- practice */}
      <Card>
        <CardTitle>Practice</CardTitle>
        <p className="mb-3 flex items-center gap-2 text-sm">
          <Flame className={`size-5 ${streak ? "text-brand-2" : "text-muted-foreground"}`} aria-hidden />
          {streak ? <span><strong>{streak}-day</strong> practice streak</span> : "Start a streak: learn or practice today."}
        </p>
        {weakest ? (
          <div className="mb-3 rounded-lg bg-muted p-3 text-sm">
            <p className="mb-1 flex items-center gap-1 font-medium"><Lightbulb className="size-4 text-brand-2" aria-hidden /> Work on: {CRITERIA_LABEL[weakest as keyof typeof CRITERIA_LABEL]}</p>
            <p className="text-muted-foreground">{TIPS[weakest]}</p>
          </div>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">Do your first roleplay to get personal coaching tips.</p>
        )}
        {pick && (
          <Link href="/roleplay" className="flex items-center gap-2 text-sm text-brand underline">
            <MessageSquare className="size-4 shrink-0" aria-hidden /> Try: {pick.title} <DifficultyBadge difficulty={pick.difficulty} />
          </Link>
        )}
      </Card>

      {/* ---------------------------------------------------------- skills */}
      <Card>
        <CardTitle>Your roleplay skills</CardTitle>
        {graded.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your average score for each skill (1–5) appears here after your first scored roleplay.</p>
        ) : (
          <ul className="space-y-2">
            {CRITERIA_KEYS.map((k) => {
              const v = skills[k];
              return (
                <li key={k}>
                  <div className="flex justify-between text-xs"><span>{CRITERIA_LABEL[k]}</span><span className="font-semibold tabular-nums">{v == null ? "—" : v.toFixed(1)}</span></div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-muted" aria-hidden>
                    <div className={`h-full rounded-full ${k === weakest ? "bg-brand" : "bg-brand-2"}`} style={{ width: `${v == null ? 0 : (v / 5) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ---------------------------------------------------------- history */}
      <Card>
        <CardTitle>Recent results</CardTitle>
        {quizRows.length === 0 && graded.length === 0 && <p className="text-sm text-muted-foreground">Your quiz and roleplay results will show here.</p>}
        <ul className="space-y-2 text-sm">
          {graded.slice(0, 3).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <Link href={`/roleplay/session/${s.id}`} className="truncate text-brand underline">{s.scenario_title}</Link>
              <ScoreBadge overall={s.overall} />
            </li>
          ))}
          {quizRows.slice(0, 4).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <Link href={`/quizzes/attempt/${a.id}`} className="truncate text-brand underline">{a.quizzes?.title ?? "Quiz"}</Link>
              {a.needs_review ? <Badge tone="warning">reviewing</Badge> : (
                <Badge tone={a.passed ? "success" : "danger"}>{a.score_pct != null ? `${Math.round(Number(a.score_pct))}%` : "—"}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
