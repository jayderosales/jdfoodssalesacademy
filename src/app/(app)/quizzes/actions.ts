"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { gradeShortAnswer } from "@/lib/ai/grade-short-answer";
import { requireStaff, requireUser } from "@/lib/auth";
import { canManageUser } from "@/lib/learning/load";
import { drawQuestions, gradeObjective, scorePct, type DrawnQuestion } from "@/lib/quiz/engine";
import { getQuiz, questionPool, quizStatus, type FullQuestion } from "@/lib/quiz/service";
import { createAdminClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

export async function startAttempt(_: FormState, form: FormData): Promise<FormState> {
  const profile = await requireUser();
  const quizId = z.string().uuid().parse(form.get("quiz_id"));
  const quiz = await getQuiz(quizId);
  if (!quiz || (!quiz.published && profile.role === "rep") || quiz.kind === "prehire") return { error: "Quiz not available." };

  const status = await quizStatus(quiz, profile);
  if (!status.unlocked.open) return { error: status.unlocked.reason ?? "Quiz is locked." };
  if (status.availability.openAttemptId) redirect(`/quizzes/attempt/${status.availability.openAttemptId}`);
  if (!status.availability.canStart) return { error: status.availability.reason ?? "You can't start a new attempt right now." };

  const pool = await questionPool(quiz);
  if (!pool.length) return { error: "This quiz has no approved questions yet." };
  const lastOrder = (status.attempts[0]?.question_order as DrawnQuestion[] | undefined) ?? [];
  const drawn = drawQuestions(pool, quiz.questions_per_attempt, { shuffle: quiz.shuffle, avoidIds: lastOrder.map((q) => q.question_id) });

  const { data, error } = await createAdminClient()
    .from("quiz_attempts")
    .insert({ quiz_id: quiz.id, user_id: profile.id, question_order: drawn })
    .select("id")
    .single();
  if (error) return { error: error.message };
  redirect(`/quizzes/attempt/${data.id}`);
}

const answersSchema = z.record(z.string().uuid(), z.union([z.string().max(4000), z.array(z.string().max(10)), z.boolean()]));

export async function submitAttempt(_: FormState, form: FormData): Promise<FormState> {
  const profile = await requireUser();
  const attemptId = z.string().uuid().parse(form.get("attempt_id"));
  let answers: z.infer<typeof answersSchema>;
  try {
    answers = answersSchema.parse(JSON.parse(String(form.get("answers") ?? "{}")));
  } catch {
    return { error: "Couldn't read your answers. Please try again." };
  }

  const admin = createAdminClient();
  const { data: attempt } = await admin.from("quiz_attempts").select("id, quiz_id, user_id, submitted_at, question_order").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.user_id !== profile.id) return { error: "Attempt not found." };
  if (attempt.submitted_at) redirect(`/quizzes/attempt/${attemptId}`);

  // Claim the attempt first so a double-tap can't grade it twice.
  const { data: claimed } = await admin
    .from("quiz_attempts")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", attemptId)
    .is("submitted_at", null)
    .select("id");
  if (!claimed?.length) redirect(`/quizzes/attempt/${attemptId}`);

  try {
    await gradeAttempt(attemptId, attempt.quiz_id, attempt.question_order as DrawnQuestion[], answers, profile.id);
  } catch (e) {
    console.error("grading failed", e);
    // Keep the submission; flag it so a manager can grade it.
    await admin.from("quiz_attempts").update({ needs_review: true }).eq("id", attemptId);
  }
  revalidatePath(`/quizzes/${attempt.quiz_id}`);
  revalidatePath("/quizzes");
  redirect(`/quizzes/attempt/${attemptId}`);
}

async function gradeAttempt(
  attemptId: string,
  quizId: string,
  order: DrawnQuestion[],
  answers: Record<string, string | string[] | boolean>,
  userId: string,
) {
  const admin = createAdminClient();
  const quiz = (await getQuiz(quizId))!;
  const { data: qs } = await admin
    .from("questions")
    .select("id, quiz_id, type, prompt, options, correct, model_answer, explanation, competency_tag")
    .in("id", order.map((o) => o.question_id));
  const byId = new Map(((qs ?? []) as FullQuestion[]).map((q) => [q.id, q]));

  const rows = await Promise.all(
    order.map(async ({ question_id }) => {
      const q = byId.get(question_id);
      const response = answers[question_id] ?? null;
      if (!q) return { attempt_id: attemptId, question_id, response, is_correct: false, points: 0, ai_feedback: null, needs_review: false };
      const objective = gradeObjective(q, response);
      if (objective) return { attempt_id: attemptId, question_id, response, ...objective, ai_feedback: null, needs_review: false };
      const ai = await gradeShortAnswer({
        userId,
        attemptId,
        type: q.type as "short" | "scenario",
        question: q.prompt,
        modelAnswer: q.model_answer,
        explanation: q.explanation,
        answer: typeof response === "string" ? response : "",
      });
      return { attempt_id: attemptId, question_id, response, is_correct: ai.is_correct, points: ai.points, ai_feedback: ai.feedback, needs_review: ai.needs_review };
    }),
  );

  const { error } = await admin.from("quiz_answers").insert(rows);
  if (error) throw new Error(error.message);
  const score = scorePct(rows.map((r) => r.points), order.length);
  const needsReview = rows.some((r) => r.needs_review);
  await admin
    .from("quiz_attempts")
    .update({ score_pct: score, passed: score >= quiz.pass_pct, needs_review: needsReview })
    .eq("id", attemptId);
}

/** Manager/owner grades an answer the AI couldn't, then the attempt score is recalculated. */
export async function reviewAnswer(_: FormState, form: FormData): Promise<FormState> {
  await requireStaff();
  const parsed = z
    .object({
      attempt_id: z.string().uuid(),
      question_id: z.string().uuid(),
      points: z.enum(["0", "0.5", "1"]).transform(Number),
      feedback: z.string().trim().max(1000).default(""),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { attempt_id, question_id, points, feedback } = parsed.data;

  const admin = createAdminClient();
  const { data: attempt } = await admin.from("quiz_attempts").select("id, user_id, quiz_id, question_order").eq("id", attempt_id).maybeSingle();
  if (!attempt?.user_id || !(await canManageUser(attempt.user_id))) return { error: "Not allowed." };

  await admin
    .from("quiz_answers")
    .update({ points, is_correct: points === 1, needs_review: false, ...(feedback ? { ai_feedback: `Manager: ${feedback}` } : {}) })
    .eq("attempt_id", attempt_id)
    .eq("question_id", question_id);

  const { data: all } = await admin.from("quiz_answers").select("points, needs_review").eq("attempt_id", attempt_id);
  const quiz = (await getQuiz(attempt.quiz_id))!;
  const score = scorePct((all ?? []).map((a: { points: number }) => Number(a.points)), (attempt.question_order as unknown[]).length);
  await admin
    .from("quiz_attempts")
    .update({ score_pct: score, passed: score >= quiz.pass_pct, needs_review: (all ?? []).some((a: { needs_review: boolean }) => a.needs_review) })
    .eq("id", attempt_id);

  revalidatePath(`/quizzes/attempt/${attempt_id}`);
  return { message: "Saved. Score updated." };
}
