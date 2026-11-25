import Link from "next/link";
import { CheckCircle2, Circle, ListChecks, Lock } from "lucide-react";
import { ProgressBar } from "@/components/progress-bar";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadLearnerState, loadPathTrees } from "@/lib/learning/load";
import { computeAccess } from "@/lib/learning/unlock";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Learn" };

export default async function LearnPage({ searchParams }: { searchParams: Promise<{ locked?: string }> }) {
  const { locked } = await searchParams;
  const profile = await requireUser();

  // Staff browse every published path (no progress); reps see their assigned + default paths.
  let state;
  if (profile.role === "rep") {
    state = await loadLearnerState(profile.id);
  } else {
    const { data } = await createAdminClient().from("learning_paths").select("id").eq("published", true);
    const trees = await loadPathTrees((data ?? []).map((p: { id: string }) => ({ id: p.id, due_date: null })));
    const all = new Set(trees.flatMap((t) => t.modules.flatMap((m) => m.lessons.map((l) => l.id))));
    state = { trees, access: new Map(trees.map((t) => [t.id, computeAccess(t.modules, all)])), completed: new Set<string>() };
  }

  const { data: quizzes } = await createAdminClient().from("quizzes").select("id, title, module_id").eq("published", true).eq("kind", "module");
  const quizByModule = new Map((quizzes ?? []).map((q: { id: string; title: string; module_id: string }) => [q.module_id, q]));

  return (
    <>
      <PageHeader title="Learn" description={profile.role === "rep" ? "Work through each module in order. Your progress saves automatically." : "Preview of the published learning content."} />
      {locked && <div className="mb-4"><Alert>That lesson is still locked. Finish the lessons before it first.</Alert></div>}
      {state.trees.length === 0 && <Card><p className="text-sm text-muted-foreground">No learning path has been assigned to you yet. Please ask your manager.</p></Card>}

      <div className="space-y-6">
        {state.trees.map((tree) => {
          const access = state.access.get(tree.id)!;
          return (
            <section key={tree.id} aria-labelledby={`path-${tree.id}`}>
              <Card className="mb-3">
                <h2 id={`path-${tree.id}`} className="text-lg font-bold">{tree.title}</h2>
                {tree.description && <p className="mb-3 text-sm text-muted-foreground">{tree.description}</p>}
                {profile.role === "rep" && <ProgressBar value={access.completed} max={access.total} label="Lessons completed" />}
                {tree.due_date && <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(tree.due_date)}</p>}
              </Card>

              <ol className="space-y-3">
                {tree.modules.map((m, i) => {
                  const ma = access.modules.get(m.id)!;
                  const quiz = quizByModule.get(m.id);
                  return (
                    <li key={m.id}>
                      <Card className={ma.locked ? "opacity-70" : undefined}>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Module {i + 1}</p>
                            <h3 className="font-semibold">{m.title}</h3>
                          </div>
                          {ma.locked ? (
                            <Badge><Lock className="mr-1 size-3" aria-hidden />Locked</Badge>
                          ) : ma.done && profile.role === "rep" ? (
                            <Badge tone="success">Done</Badge>
                          ) : profile.role === "rep" ? (
                            <Badge tone="brand">{ma.completed}/{ma.total}</Badge>
                          ) : null}
                        </div>
                        <ul className="divide-y">
                          {m.lessons.map((l) => {
                            const la = access.lessons.get(l.id)!;
                            const Icon = la.locked ? Lock : la.completed && profile.role === "rep" ? CheckCircle2 : Circle;
                            return (
                              <li key={l.id}>
                                {la.locked ? (
                                  <span className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
                                    <Icon className="size-4 shrink-0" aria-label="Locked" />
                                    <span className="flex-1">{l.title}</span>
                                    <span className="text-xs">{l.est_minutes} min</span>
                                  </span>
                                ) : (
                                  <Link href={`/learn/lessons/${l.id}`} className="flex min-h-11 items-center gap-3 text-sm hover:text-brand">
                                    <Icon className={`size-4 shrink-0 ${la.completed && profile.role === "rep" ? "text-success" : "text-muted-foreground"}`} aria-label={la.completed ? "Completed" : "Not started"} />
                                    <span className="flex-1">{l.title}</span>
                                    <span className="text-xs text-muted-foreground">{l.est_minutes} min</span>
                                  </Link>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {quiz && (
                          <Link
                            href={`/quizzes/${quiz.id}`}
                            className={`mt-2 flex min-h-11 items-center gap-3 border-t pt-2 text-sm ${ma.done || profile.role !== "rep" ? "font-medium text-brand" : "pointer-events-none text-muted-foreground"}`}
                            aria-disabled={!ma.done && profile.role === "rep"}
                          >
                            <ListChecks className="size-4" aria-hidden />
                            Quiz: {quiz.title}
                            {!ma.done && profile.role === "rep" && <span className="text-xs">(after the lessons)</span>}
                          </Link>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </>
  );
}
