import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, logAiUsage, MODELS } from "./client";
import {
  QUIZ_GRADE_SYSTEM,
  QUIZ_GRADE_VERSION,
  QuizGradeSchema,
  VERDICT_POINTS,
  quizGradeUserMessage,
} from "./prompts/quiz-grade";

export interface ShortAnswerResult {
  points: number;
  is_correct: boolean;
  feedback: string;
  needs_review: boolean;
  prompt_version: string;
}

/**
 * Grades one free-text answer. Never throws: if the AI is unavailable or the output is invalid,
 * the answer is flagged for manager review (0 points for now) instead of being marked wrong.
 */
export async function gradeShortAnswer(input: {
  userId: string | null;
  attemptId: string;
  type: "short" | "scenario";
  question: string;
  modelAnswer: string | null;
  explanation?: string | null;
  answer: string;
}): Promise<ShortAnswerResult> {
  const review = (feedback: string): ShortAnswerResult => ({
    points: 0,
    is_correct: false,
    feedback,
    needs_review: true,
    prompt_version: QUIZ_GRADE_VERSION,
  });

  if (!input.answer.trim()) {
    return { points: 0, is_correct: false, feedback: "No answer given.", needs_review: false, prompt_version: QUIZ_GRADE_VERSION };
  }
  if (!input.modelAnswer) return review("This question has no model answer yet. Your manager will review it.");

  try {
    const model = MODELS.quiz;
    const response = await anthropic().beta.messages.parse({
      model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(QuizGradeSchema) },
      system: QUIZ_GRADE_SYSTEM,
      messages: [{ role: "user", content: quizGradeUserMessage({ ...input, modelAnswer: input.modelAnswer }) }],
    });
    await logAiUsage({ userId: input.userId, feature: "quiz_grade", model, usage: response.usage, refId: input.attemptId });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return review("This answer couldn't be graded automatically. Your manager will review it.");
    }
    const { verdict, feedback } = response.parsed_output;
    const points = VERDICT_POINTS[verdict];
    return { points, is_correct: verdict === "correct", feedback, needs_review: false, prompt_version: QUIZ_GRADE_VERSION };
  } catch (e) {
    console.error("gradeShortAnswer failed", e);
    return review("Automatic grading is unavailable right now. Your manager will review this answer.");
  }
}
