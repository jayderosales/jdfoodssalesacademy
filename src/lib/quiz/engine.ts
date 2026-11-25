/**
 * Quiz engine: drawing questions, grading objective answers, attempt rules. Pure + unit-tested.
 */

export type QuestionType = "mcq" | "multi" | "tf" | "short" | "scenario";

export interface Option {
  id: string;
  text: string;
}

export interface QuestionForDraw {
  id: string;
  type: QuestionType;
  options: Option[];
}

export interface DrawnQuestion {
  question_id: string;
  option_order: string[]; // option ids in display order (empty for tf / free text)
}

export type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick `count` questions from the bank. When the bank is big enough, questions from the previous
 * attempt are avoided so retakes differ.
 */
export function drawQuestions(
  pool: QuestionForDraw[],
  count: number,
  opts: { shuffle: boolean; avoidIds?: string[]; rng?: Rng } = { shuffle: true },
): DrawnQuestion[] {
  const rng = opts.rng ?? Math.random;
  const n = Math.min(count, pool.length);
  let candidates = pool;
  if (opts.shuffle && opts.avoidIds?.length) {
    const avoid = new Set(opts.avoidIds);
    const fresh = pool.filter((q) => !avoid.has(q.id));
    if (fresh.length >= n) candidates = fresh;
    else candidates = [...fresh, ...shuffle(pool.filter((q) => avoid.has(q.id)), rng)].slice(0, Math.max(n, fresh.length));
  }
  const picked = opts.shuffle ? shuffle(candidates, rng).slice(0, n) : candidates.slice(0, n);
  return picked.map((q) => ({
    question_id: q.id,
    option_order:
      q.type === "mcq" || q.type === "multi"
        ? (opts.shuffle ? shuffle(q.options, rng) : q.options).map((o) => o.id)
        : [],
  }));
}

export interface GradableQuestion {
  type: QuestionType;
  correct: unknown; // mcq/multi: string[] of option ids; tf: boolean
}

/** Grades mcq / multi / tf. Multi-select is all-or-nothing. Free-text types return null (AI-graded). */
export function gradeObjective(q: GradableQuestion, response: unknown): { is_correct: boolean; points: number } | null {
  switch (q.type) {
    case "mcq": {
      const correct = Array.isArray(q.correct) ? q.correct : [];
      const ok = typeof response === "string" && correct.length === 1 && correct[0] === response;
      return { is_correct: ok, points: ok ? 1 : 0 };
    }
    case "multi": {
      const correct = new Set(Array.isArray(q.correct) ? (q.correct as string[]) : []);
      const given = new Set(Array.isArray(response) ? (response as string[]) : []);
      const ok = correct.size > 0 && correct.size === given.size && [...correct].every((c) => given.has(c));
      return { is_correct: ok, points: ok ? 1 : 0 };
    }
    case "tf": {
      const ok = typeof q.correct === "boolean" && response === q.correct;
      return { is_correct: ok, points: ok ? 1 : 0 };
    }
    default:
      return null;
  }
}

export function scorePct(points: number[], questionCount: number): number {
  if (questionCount === 0) return 0;
  const total = points.reduce((s, p) => s + p, 0);
  return Math.round((total / questionCount) * 10000) / 100;
}

export interface AttemptRules {
  max_attempts: number | null;
  cooldown_hours: number;
}

export interface AttemptLite {
  id: string;
  started_at: string;
  submitted_at: string | null;
  passed: boolean | null;
}

export interface Availability {
  canStart: boolean;
  openAttemptId: string | null;
  attemptsUsed: number;
  attemptsLeft: number | null; // null = unlimited
  cooldownEndsAt: Date | null;
  passed: boolean;
  reason?: string;
}

export function attemptAvailability(rules: AttemptRules, attempts: AttemptLite[], now = new Date()): Availability {
  const open = attempts.find((a) => !a.submitted_at) ?? null;
  const used = attempts.length;
  const attemptsLeft = rules.max_attempts == null ? null : Math.max(0, rules.max_attempts - used);
  const passed = attempts.some((a) => a.passed);
  const base = { openAttemptId: open?.id ?? null, attemptsUsed: used, attemptsLeft, passed, cooldownEndsAt: null as Date | null };

  if (open) return { ...base, canStart: true }; // resume the unfinished attempt
  if (attemptsLeft === 0) return { ...base, canStart: false, reason: "No attempts left. Ask your manager for help." };

  const lastSubmitted = attempts
    .filter((a) => a.submitted_at)
    .sort((a, b) => new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime())[0];
  if (lastSubmitted && !lastSubmitted.passed && rules.cooldown_hours > 0) {
    const ends = new Date(new Date(lastSubmitted.submitted_at!).getTime() + rules.cooldown_hours * 3600_000);
    if (ends > now) return { ...base, canStart: false, cooldownEndsAt: ends, reason: "Cooling down before your next try." };
  }
  return { ...base, canStart: true };
}

/** Normalises a YouTube/Vimeo link to an embeddable URL, or null if it isn't one we allow. */
export function toEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const id = u.searchParams.get("v") ?? u.pathname.match(/\/(embed|shorts)\/([\w-]+)/)?.[2];
      return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.match(/^\/(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
