/**
 * Roleplay scoring (pure, unit-tested). The overall score is computed in code from the rubric
 * weights, not by the model, so it is consistent and explainable:
 *   overall = weighted average of the 1–5 criterion scores, scaled to 0–100 (5/5 = 100, 4/5 = 80).
 */
import { CRITERIA_KEYS, GraderOutputSchema, RoleplayGradeSchema, type CriterionKey, type RoleplayGrade, type RubricCriterion } from "@/lib/ai/prompts/grader";

export function computeOverall(scores: Record<string, number>, rubric: Pick<RubricCriterion, "key" | "weight">[]): number {
  let sum = 0;
  let weights = 0;
  for (const c of rubric) {
    const s = scores[c.key];
    if (typeof s !== "number" || c.weight <= 0) continue;
    sum += s * c.weight;
    weights += c.weight;
  }
  if (!weights) return 0;
  return Math.round((sum / weights / 5) * 10000) / 100;
}

const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

/**
 * Turns raw model output into a validated grade: clamps scores into 1–5, trims lists to 3,
 * then validates strictly with Zod. Returns null if the output is unusable.
 */
export function normalizeGrade(raw: unknown): RoleplayGrade | null {
  const parsed = GraderOutputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const g = parsed.data;
  const scores = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, clamp(g.scores[k])])) as Record<CriterionKey, number>;
  const candidate = {
    scores,
    goal_achieved: g.goal_achieved,
    strengths: g.strengths.map((s) => s.trim()).filter(Boolean).slice(0, 3),
    improvements: g.improvements.filter((i) => i.issue.trim() && i.better_line.trim()).slice(0, 3),
    factual_errors: g.factual_errors.slice(0, 10),
    summary: g.summary.trim(),
  };
  if (!candidate.strengths.length) candidate.strengths = ["You completed the practice conversation."];
  const strict = RoleplayGradeSchema.safeParse(candidate);
  return strict.success ? strict.data : null;
}

/** Manager override: scores from the form (strings "1"–"5"). */
export function parseOverrideScores(form: Record<string, unknown>): Record<CriterionKey, number> | null {
  const out: Partial<Record<CriterionKey, number>> = {};
  for (const k of CRITERIA_KEYS) {
    const n = Number(form[`score_${k}`]);
    if (!Number.isInteger(n) || n < 1 || n > 5) return null;
    out[k] = n;
  }
  return out as Record<CriterionKey, number>;
}

export const CRITERIA_LABEL: Record<CriterionKey, string> = {
  opening: "Opening & rapport",
  discovery: "Needs discovery",
  product: "Product knowledge accuracy",
  value: "Value & benefit presentation",
  objections: "Objection handling",
  closing: "Closing & next step",
  communication: "Professionalism & communication",
};
