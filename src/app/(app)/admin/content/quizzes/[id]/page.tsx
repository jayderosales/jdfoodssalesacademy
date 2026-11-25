import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, CardTitle, PageHeader, buttonVariants } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { moduleOptions, pathOptions } from "@/lib/content/queries";
import { QUESTION_TYPE_LABEL } from "@/lib/quiz/constants";
import { createClient } from "@/lib/supabase/server";
import { setQuestionStatus, updateQuiz } from "../actions";
import { QuizFields } from "../quiz-fields";

export const metadata = { title: "Edit quiz" };

interface QRow {
  id: string;
  type: keyof typeof QUESTION_TYPE_LABEL;
  prompt: string;
  status: "draft" | "approved" | "archived";
  difficulty: string;
  competency_tag: string | null;
  source: string;
}

export default async function QuizAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; show?: string }> }) {
  const { id } = await params;
  const { saved, show = "active" } = await searchParams;
  await requireOwner();
  const supabase = await createClient();
  const [{ data: quiz }, { data: qs }, modules, paths] = await Promise.all([
    supabase.from("quizzes").select("*").eq("id", id).maybeSingle(),
    supabase.from("questions").select("id, type, prompt, status, difficulty, competency_tag, source").eq("quiz_id", id).order("created_at"),
    moduleOptions(),
    pathOptions(),
  ]);
  if (!quiz) notFound();
  const all = (qs ?? []) as QRow[];
  const questions = show === "archived" ? all.filter((q) => q.status === "archived") : all.filter((q) => q.status !== "archived");
  const approved = all.filter((q) => q.status === "approved").length;

  return (
    <>
      <PageHeader title={quiz.title} actions={<Link href="/admin/content/quizzes" className="text-sm text-brand underline">All quizzes</Link>} />
      {saved && <div className="mb-4"><Alert tone="success">Question saved.</Alert></div>}
      {quiz.kind !== "certification" && approved < quiz.questions_per_attempt && (
        <div className="mb-4">
          <Alert>
            Only {approved} approved questions, but each attempt asks {quiz.questions_per_attempt}. Retakes will repeat questions. Add more for variety.
          </Alert>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <CardTitle className="mb-0">Question bank</CardTitle>
            <Link href={`/admin/content/questions/new?quiz=${id}`} className={buttonVariants({ size: "sm" })}>Add question</Link>
          </div>
          <div className="mb-3 flex gap-3 text-sm">
            <Link href={`?show=active`} className={show !== "archived" ? "font-semibold" : "text-muted-foreground underline"}>Active</Link>
            <Link href={`?show=archived`} className={show === "archived" ? "font-semibold" : "text-muted-foreground underline"}>Archived</Link>
          </div>
          <ul className="divide-y">
            {questions.map((q) => (
              <li key={q.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <Link href={`/admin/content/questions/${q.id}`} className="text-sm text-brand underline">
                    {q.prompt.length > 160 ? q.prompt.slice(0, 160) + "…" : q.prompt}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge>{QUESTION_TYPE_LABEL[q.type]}</Badge>
                    <Badge>{q.difficulty}</Badge>
                    {q.competency_tag && <Badge>{q.competency_tag}</Badge>}
                    {q.source === "ai" && <Badge tone="brand">AI draft</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={q.status === "approved" ? "success" : q.status === "draft" ? "warning" : "neutral"}>{q.status}</Badge>
                  {q.status !== "approved" && (
                    <form action={setQuestionStatus}>
                      <input type="hidden" name="id" value={q.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button className="rounded px-2 py-1 text-xs text-success underline">Approve</button>
                    </form>
                  )}
                  {q.status !== "archived" && (
                    <form action={setQuestionStatus}>
                      <input type="hidden" name="id" value={q.id} />
                      <input type="hidden" name="status" value="archived" />
                      <button className="rounded px-2 py-1 text-xs text-muted-foreground underline">Archive</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {questions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No questions here.</p>}
        </Card>
        <Card className="h-fit">
          <CardTitle>Quiz settings</CardTitle>
          <ActionForm action={updateQuiz} submitLabel="Save settings">
            <input type="hidden" name="id" value={id} />
            <QuizFields q={quiz} modules={modules} paths={paths} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
