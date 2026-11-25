import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, Field, PageHeader, Select, Textarea, buttonVariants } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { canManageUser, canViewUser } from "@/lib/learning/load";
import type { DrawnQuestion } from "@/lib/quiz/engine";
import { getQuiz, type FullQuestion } from "@/lib/quiz/service";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { reviewAnswer } from "../../actions";
import { TakeQuiz, type TakeQuestion } from "./take-quiz";

export const metadata = { title: "Quiz attempt" };
// Submitting grades written answers with AI in a server action on this page.
export const maxDuration = 60;

interface AnswerRow {
  question_id: string;
  response: unknown;
  is_correct: boolean | null;
  points: number;
  ai_feedback: string | null;
  needs_review: boolean;
}

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  const admin = createAdminClient();
  const { data: attempt } = await admin.from("quiz_attempts").select("*").eq("id", id).maybeSingle();
  if (!attempt || !attempt.user_id) notFound();
  const isMine = attempt.user_id === profile.id;
  if (!isMine && !(await canViewUser(attempt.user_id))) notFound();

  const quiz = (await getQuiz(attempt.quiz_id))!;
  const order = attempt.question_order as DrawnQuestion[];
  const { data: qs } = await admin
    .from("questions")
    .select("id, quiz_id, type, prompt, options, correct, model_answer, explanation, competency_tag")
    .in("id", order.map((o) => o.question_id));
  const byId = new Map(((qs ?? []) as FullQuestion[]).map((q) => [q.id, q]));

  // ---- taking the quiz (answer keys are never sent to the browser)
  if (!attempt.submitted_at) {
    if (!isMine) return <Alert>This attempt is still in progress.</Alert>;
    const questions: TakeQuestion[] = order
      .map(({ question_id, option_order }) => {
        const q = byId.get(question_id);
        if (!q) return null;
        const opts = option_order.length ? option_order.map((oid) => q.options.find((o) => o.id === oid)).filter((o): o is { id: string; text: string } => !!o) : q.options;
        return { id: q.id, type: q.type, prompt: q.prompt, options: opts };
      })
      .filter((q): q is TakeQuestion => q !== null);
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={quiz.title} description={`Pass mark ${quiz.pass_pct}%. Your answers are saved on this device as you go.`} />
        <TakeQuiz attemptId={id} questions={questions} />
      </div>
    );
  }

  // ---- results
  const { data: ans } = await admin.from("quiz_answers").select("*").eq("attempt_id", id);
  const answers = new Map(((ans ?? []) as AnswerRow[]).map((a) => [a.question_id, a]));
  const canReview = !isMine && (await canManageUser(attempt.user_id));
  const { data: owner } = isMine ? { data: null } : await admin.from("profiles").select("full_name").eq("id", attempt.user_id).maybeSingle();

  const optionText = (q: FullQuestion, oid: unknown) => q.options.find((o) => o.id === oid)?.text ?? String(oid);
  const showResponse = (q: FullQuestion, r: unknown) => {
    if (r === null || r === undefined || r === "") return <em className="text-muted-foreground">No answer</em>;
    if (q.type === "mcq") return optionText(q, r);
    if (q.type === "multi") return (r as string[]).map((x) => optionText(q, x)).join("; ");
    if (q.type === "tf") return r ? "True" : "False";
    return <span className="whitespace-pre-line">{String(r)}</span>;
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={quiz.title}
        description={`${owner ? owner.full_name + " · " : ""}Submitted ${formatDate(attempt.submitted_at, true)}`}
        actions={<Link href={`/quizzes/${quiz.id}`} className="text-sm text-brand underline">Back to quiz</Link>}
      />

      <Card className="mb-4 text-center">
        {attempt.score_pct == null ? (
          <p className="text-sm">Your answers were saved, but grading didn&apos;t finish. Your manager will review this attempt.</p>
        ) : (
          <>
            <p className="text-5xl font-bold text-brand">{attempt.score_pct}%</p>
            <p className="mt-2">
              {attempt.needs_review ? (
                <Badge tone="warning">Some answers are waiting for manager review</Badge>
              ) : attempt.passed ? (
                <Badge tone="success">Passed: nice work!</Badge>
              ) : (
                <Badge tone="danger">Not passed yet (need {quiz.pass_pct}%)</Badge>
              )}
            </p>
            {isMine && !attempt.passed && !attempt.needs_review && (
              <p className="mt-3 text-sm text-muted-foreground">Read the explanations below, review the lessons, then try again.</p>
            )}
          </>
        )}
      </Card>

      <ol className="space-y-3">
        {order.map(({ question_id }, i) => {
          const q = byId.get(question_id);
          const a = answers.get(question_id);
          if (!q) return null;
          const Icon = a?.needs_review ? CircleAlert : a?.is_correct ? CheckCircle2 : a && Number(a.points) > 0 ? CircleAlert : XCircle;
          const tone = a?.needs_review ? "text-brand-2" : a?.is_correct ? "text-success" : a && Number(a.points) > 0 ? "text-brand-2" : "text-danger";
          return (
            <li key={question_id}>
              <Card>
                <div className="flex gap-3">
                  <Icon className={`mt-0.5 size-5 shrink-0 ${tone}`} aria-hidden />
                  <div className="flex-1 space-y-2 text-sm">
                    <p className="font-medium">
                      <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                      <span className="whitespace-pre-line">{q.prompt}</span>
                    </p>
                    <p><span className="text-muted-foreground">Your answer: </span>{showResponse(q, a?.response)}</p>
                    {a?.needs_review && <Badge tone="warning">Waiting for manager review</Badge>}
                    {(q.type === "short" || q.type === "scenario") && a && !a.needs_review && (
                      <p className="text-xs text-muted-foreground">Score: {Number(a.points) === 1 ? "full" : Number(a.points) === 0.5 ? "half" : "no"} credit</p>
                    )}
                    {a?.ai_feedback && <p className="rounded-lg bg-muted px-3 py-2">{a.ai_feedback}</p>}
                    {!a?.is_correct && q.explanation && (
                      <p className="rounded-lg border-l-4 border-brand-2 bg-brand-2/5 px-3 py-2"><strong>Explanation: </strong>{q.explanation}</p>
                    )}

                    {canReview && (q.type === "short" || q.type === "scenario") && (
                      <details open={a?.needs_review}>
                        <summary className="cursor-pointer text-xs text-brand underline">Grade this answer (manager)</summary>
                        <p className="my-2 rounded bg-muted p-2 text-xs"><strong>Model answer: </strong>{q.model_answer}</p>
                        <ActionForm action={reviewAnswer} submitLabel="Save grade" variant="outline">
                          <input type="hidden" name="attempt_id" value={id} />
                          <input type="hidden" name="question_id" value={question_id} />
                          <Field label="Credit" htmlFor={`pts-${question_id}`}>
                            <Select id={`pts-${question_id}`} name="points" defaultValue={String(Number(a?.points ?? 0))}>
                              <option value="1">Full (correct)</option>
                              <option value="0.5">Half (partly correct)</option>
                              <option value="0">None</option>
                            </Select>
                          </Field>
                          <Field label="Feedback to the rep (optional)" htmlFor={`fb-${question_id}`}>
                            <Textarea id={`fb-${question_id}`} name="feedback" rows={2} />
                          </Field>
                        </ActionForm>
                      </details>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      {isMine && (
        <div className="mt-6 flex gap-2">
          <Link href={`/quizzes/${quiz.id}`} className={buttonVariants({ variant: "outline" })}>Quiz overview</Link>
          <Link href="/learn" className={buttonVariants()}>Back to lessons</Link>
        </div>
      )}
    </div>
  );
}
