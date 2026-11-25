import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { loadLearnerState, pathForModule, type LearnerState } from "@/lib/learning/load";
import { quizUnlocked } from "@/lib/learning/unlock";
import type { Profile } from "@/lib/types";
import { attemptAvailability, type AttemptLite, type Availability, type Option, type QuestionType } from "./engine";

export interface QuizRow {
  id: string;
  title: string;
  kind: "module" | "certification" | "prehire";
  module_id: string | null;
  path_id: string | null;
  pass_pct: number;
  max_attempts: number | null;
  cooldown_hours: number;
  questions_per_attempt: number;
  shuffle: boolean;
  published: boolean;
}

export interface FullQuestion {
  id: string;
  quiz_id: string;
  type: QuestionType;
  prompt: string;
  options: Option[];
  correct: unknown;
  model_answer: string | null;
  explanation: string;
  competency_tag: string | null;
}

export async function getQuiz(id: string): Promise<QuizRow | null> {
  const { data } = await createAdminClient().from("quizzes").select("*").eq("id", id).maybeSingle();
  return (data as QuizRow | null) ?? null;
}

/** Approved questions this quiz can draw from. Certification = its own + every module quiz in its path. */
export async function questionPool(quiz: QuizRow): Promise<FullQuestion[]> {
  const admin = createAdminClient();
  let quizIds = [quiz.id];
  if (quiz.kind === "certification" && quiz.path_id) {
    const { data: mods } = await admin.from("modules").select("id").eq("path_id", quiz.path_id);
    const moduleIds = (mods ?? []).map((m: { id: string }) => m.id);
    if (moduleIds.length) {
      const { data: qz } = await admin.from("quizzes").select("id").in("module_id", moduleIds).eq("kind", "module");
      quizIds = [...quizIds, ...(qz ?? []).map((q: { id: string }) => q.id)];
    }
  }
  const { data } = await admin
    .from("questions")
    .select("id, quiz_id, type, prompt, options, correct, model_answer, explanation, competency_tag")
    .in("quiz_id", quizIds)
    .eq("status", "approved");
  return (data as FullQuestion[] | null) ?? [];
}

export async function userAttempts(quizId: string, userId: string): Promise<(AttemptLite & { score_pct: number | null; question_order: unknown; needs_review: boolean })[]> {
  const { data } = await createAdminClient()
    .from("quiz_attempts")
    .select("id, started_at, submitted_at, passed, score_pct, question_order, needs_review")
    .eq("quiz_id", quizId)
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  return (data ?? []) as never;
}

export interface QuizStatus {
  quiz: QuizRow;
  unlocked: { open: boolean; reason?: string };
  availability: Availability;
  attempts: Awaited<ReturnType<typeof userAttempts>>;
  bestScore: number | null;
}

/** Everything the quiz overview page needs, including unlock + attempt rules. Staff are never locked out (preview). */
export async function quizStatus(quiz: QuizRow, profile: Profile, state?: LearnerState): Promise<QuizStatus> {
  const attempts = await userAttempts(quiz.id, profile.id);
  let unlocked: { open: boolean; reason?: string } = { open: true };
  if (profile.role === "rep") {
    const s = state ?? (await loadLearnerState(profile.id));
    const tree = quiz.kind === "certification" ? s.trees.find((t) => t.id === quiz.path_id) ?? null : quiz.module_id ? pathForModule(s, quiz.module_id) : null;
    unlocked = quizUnlocked(quiz, tree ? s.access.get(tree.id)! : null);
  }
  const scores = attempts.map((a) => a.score_pct).filter((s): s is number => s != null).map(Number);
  return {
    quiz,
    unlocked,
    availability: attemptAvailability(quiz, attempts),
    attempts,
    bestScore: scores.length ? Math.max(...scores) : null,
  };
}
