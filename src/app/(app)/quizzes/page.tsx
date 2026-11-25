import Link from "next/link";
import { Award, ListChecks, Lock } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadLearnerState } from "@/lib/learning/load";
import { quizStatus, type QuizRow } from "@/lib/quiz/service";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Quizzes" };

export default async function QuizzesPage() {
  const profile = await requireUser();
  const admin = createAdminClient();
  const { data } = await admin.from("quizzes").select("*").eq("published", true).neq("kind", "prehire").order("created_at");
  let quizzes = (data ?? []) as QuizRow[];

  const state = profile.role === "rep" ? await loadLearnerState(profile.id) : undefined;
  if (state) {
    // Only quizzes that belong to the rep's learning paths.
    const moduleIds = new Set(state.trees.flatMap((t) => t.modules.map((m) => m.id)));
    const pathIds = new Set(state.trees.map((t) => t.id));
    quizzes = quizzes.filter((q) => (q.module_id && moduleIds.has(q.module_id)) || (q.path_id && pathIds.has(q.path_id)));
    // Order by module position in the path, certification last.
    const pos = new Map(state.trees.flatMap((t) => t.modules.map((m, i) => [m.id, i] as const)));
    quizzes.sort((a, b) => (a.kind === "certification" ? 1e6 : pos.get(a.module_id ?? "") ?? 1e5) - (b.kind === "certification" ? 1e6 : pos.get(b.module_id ?? "") ?? 1e5));
  }
  const statuses = await Promise.all(quizzes.map((q) => quizStatus(q, profile, state)));

  return (
    <>
      <PageHeader title="Quizzes" description="Each module has a short quiz. Pass them all to unlock the certification exam." />
      <div className="grid gap-3 sm:grid-cols-2">
        {statuses.map(({ quiz, unlocked, bestScore, availability }) => (
          <Link key={quiz.id} href={`/quizzes/${quiz.id}`}>
            <Card className={`h-full hover:border-brand ${!unlocked.open ? "opacity-70" : ""}`}>
              <div className="flex items-start gap-3">
                {quiz.kind === "certification" ? <Award className="size-6 text-brand-2" aria-hidden /> : <ListChecks className="size-6 text-brand" aria-hidden />}
                <div className="flex-1">
                  <p className="font-semibold">{quiz.title}</p>
                  <p className="text-xs text-muted-foreground">Pass mark {quiz.pass_pct}% · {quiz.questions_per_attempt} questions</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {!unlocked.open && <Badge><Lock className="mr-1 size-3" aria-hidden />Locked</Badge>}
                    {availability.passed && <Badge tone="success">Passed</Badge>}
                    {bestScore != null && <Badge tone="brand">Best {bestScore}%</Badge>}
                    {availability.openAttemptId && <Badge tone="warning">In progress</Badge>}
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {statuses.length === 0 && <Card><p className="text-sm text-muted-foreground">No quizzes yet.</p></Card>}
    </>
  );
}
