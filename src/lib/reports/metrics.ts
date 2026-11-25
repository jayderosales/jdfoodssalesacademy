/**
 * Reporting metrics: levels, time to Field Ready, at-risk flags, quiz and roleplay stats.
 * Pure functions (no database), unit-tested.
 */

// ---------------------------------------------------------------- inputs

export interface LevelRule {
  level: number;
  name: string;
  requires_signoff: boolean;
  requirements: {
    modules_completed_categories?: string[];
    quiz_min_pct?: number;
    certification_passed?: boolean;
    roleplays?: { difficulty: string; count: number; min_score?: number; avg_min?: number };
    kpi?: unknown; // field KPIs are not tracked yet → rule can't be met
  };
}

export interface RepActivity {
  hireDate: string | null; // YYYY-MM-DD
  createdAt: string;
  lastActiveAt: string | null;
  /** category → date all its modules were completed (absent = not complete) */
  categoryDoneAt: Record<string, string>;
  /** module quizzes: category of the module, and the attempts (submitted) */
  quizzes: { quizId: string; category: string; attempts: { at: string; score: number | null; passed: boolean | null }[] }[];
  certification: { at: string; passed: boolean | null }[];
  roleplays: { difficulty: string; overall: number; at: string }[];
  signoffs: Record<number, string>; // level → date
}

export interface LevelResult {
  level: number;
  name: string;
  achievedAt: Record<number, string>; // level → ISO date it was reached
  next: { level: number; name: string; missing: string[] } | null;
}

const maxDate = (dates: (string | null | undefined)[]) => {
  const valid = dates.filter((d): d is string => !!d);
  return valid.length ? valid.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)) : null;
};

/** Evaluates one level's own conditions. Returns the date they were all met, or the reasons they aren't. */
export function evaluateRule(rule: LevelRule, a: RepActivity): { metAt: string | null; missing: string[] } {
  const r = rule.requirements;
  const dates: string[] = [];
  const missing: string[] = [];

  if (r.modules_completed_categories?.length) {
    const notDone = r.modules_completed_categories.filter((c) => !a.categoryDoneAt[c]);
    if (notDone.length) missing.push(`Finish modules: ${notDone.join(", ")}`);
    else dates.push(maxDate(r.modules_completed_categories.map((c) => a.categoryDoneAt[c]))!);
  }

  if (r.quiz_min_pct != null) {
    const cats = new Set(r.modules_completed_categories ?? []);
    const relevant = a.quizzes.filter((q) => cats.size === 0 || cats.has(q.category));
    const firstReach = relevant.map((q) =>
      q.attempts
        .filter((t) => t.score != null && t.score >= r.quiz_min_pct!)
        .map((t) => t.at)
        .sort()[0],
    );
    if (!relevant.length || firstReach.some((d) => !d)) missing.push(`Score ${r.quiz_min_pct}%+ on the module quizzes`);
    else dates.push(maxDate(firstReach)!);
  }

  if (r.certification_passed) {
    const pass = a.certification.filter((c) => c.passed).map((c) => c.at).sort()[0];
    if (!pass) missing.push("Pass the certification exam");
    else dates.push(pass);
  }

  if (r.roleplays) {
    const { difficulty, count, min_score, avg_min } = r.roleplays;
    const sessions = a.roleplays.filter((s) => s.difficulty === difficulty).sort((x, y) => x.at.localeCompare(y.at));
    let metAt: string | null = null;
    // walk forward in time and find the first moment the condition holds
    for (let i = 0; i < sessions.length && !metAt; i++) {
      const sofar = sessions.slice(0, i + 1);
      if (min_score != null) {
        if (sofar.filter((s) => s.overall >= min_score).length >= count) metAt = sessions[i].at;
      } else if (avg_min != null && sofar.length >= count) {
        const best = sofar.map((s) => s.overall).sort((x, y) => y - x).slice(0, count);
        if (best.reduce((s, v) => s + v, 0) / count >= avg_min) metAt = sessions[i].at;
      }
    }
    if (!metAt) {
      missing.push(
        min_score != null
          ? `${count} ${difficulty} roleplays scoring ${min_score}+ (${sessions.filter((s) => s.overall >= min_score).length}/${count})`
          : `${difficulty} roleplays averaging ${avg_min}+ over your best ${count}`,
      );
    } else dates.push(metAt);
  }

  if (r.kpi) missing.push("Field KPI targets (not tracked yet)");

  if (rule.requires_signoff) {
    if (!a.signoffs[rule.level]) missing.push("Manager sign-off");
    else dates.push(a.signoffs[rule.level]);
  }

  return missing.length ? { metAt: null, missing } : { metAt: maxDate(dates) ?? a.hireDate ?? a.createdAt, missing: [] };
}

/** Levels are cumulative: level N needs N-1 and its own conditions. */
export function computeLevel(rules: LevelRule[], a: RepActivity): LevelResult {
  const sorted = [...rules].sort((x, y) => x.level - y.level);
  const achievedAt: Record<number, string> = {};
  let current = sorted[0] ?? { level: 0, name: "Trainee" };
  achievedAt[current.level] = a.hireDate ?? a.createdAt;

  for (const rule of sorted.slice(1)) {
    const { metAt, missing } = evaluateRule(rule, a);
    if (!metAt) return { level: current.level, name: current.name, achievedAt, next: { level: rule.level, name: rule.name, missing } };
    achievedAt[rule.level] = maxDate([metAt, achievedAt[current.level]])!;
    current = rule;
  }
  return { level: current.level, name: current.name, achievedAt, next: null };
}

export function daysBetween(from: string | Date, to: string | Date) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

// ---------------------------------------------------------------- at-risk

export interface RiskSettings {
  at_risk_inactive_days: number;
  at_risk_failed_attempts: number;
  onboarding_target_days: number;
}

export function atRiskReasons(
  a: Pick<RepActivity, "hireDate" | "createdAt" | "lastActiveAt" | "quizzes" | "certification">,
  level: number,
  s: RiskSettings,
  now = new Date(),
): string[] {
  const reasons: string[] = [];
  const start = a.hireDate ?? a.createdAt;
  const lastSeen = a.lastActiveAt ?? null;
  const inactiveDays = lastSeen ? daysBetween(lastSeen, now) : daysBetween(start, now);
  if (inactiveDays >= s.at_risk_inactive_days) reasons.push(lastSeen ? `Inactive ${inactiveDays} days` : "Never signed in");

  for (const q of [...a.quizzes, { quizId: "cert", category: "cert", attempts: a.certification.map((c) => ({ ...c, score: null })) }]) {
    if (q.attempts.some((t) => t.passed)) continue;
    const fails = q.attempts.filter((t) => t.passed === false).length;
    if (fails >= s.at_risk_failed_attempts) {
      reasons.push(`Failed a quiz ${fails} times`);
      break;
    }
  }

  if (level < 2 && daysBetween(start, now) > s.onboarding_target_days) reasons.push(`Not Field Ready after ${daysBetween(start, now)} days`);
  return reasons;
}

// ---------------------------------------------------------------- quiz stats

export interface AttemptRow {
  quizId: string;
  userId: string;
  submittedAt: string;
  passed: boolean | null;
  score: number | null;
}

export function quizStats(attempts: AttemptRow[]) {
  const byQuiz = new Map<string, AttemptRow[]>();
  attempts.forEach((t) => byQuiz.set(t.quizId, [...(byQuiz.get(t.quizId) ?? []), t]));
  return [...byQuiz].map(([quizId, rows]) => {
    const firsts = new Map<string, AttemptRow>();
    [...rows].sort((x, y) => x.submittedAt.localeCompare(y.submittedAt)).forEach((r) => !firsts.has(r.userId) && firsts.set(r.userId, r));
    const scored = rows.filter((r) => r.score != null);
    const takers = new Set(rows.map((r) => r.userId));
    const passers = new Set(rows.filter((r) => r.passed).map((r) => r.userId));
    return {
      quizId,
      attempts: rows.length,
      takers: takers.size,
      passRate: takers.size ? passers.size / takers.size : 0,
      firstAttemptPassRate: firsts.size ? [...firsts.values()].filter((r) => r.passed).length / firsts.size : 0,
      avgScore: scored.length ? scored.reduce((s, r) => s + Number(r.score), 0) / scored.length : null,
    };
  });
}

export function hardestQuestions(answers: { questionId: string; points: number }[], minAnswers = 3, limit = 10) {
  const agg = new Map<string, { n: number; pts: number }>();
  answers.forEach((a) => {
    const cur = agg.get(a.questionId) ?? { n: 0, pts: 0 };
    agg.set(a.questionId, { n: cur.n + 1, pts: cur.pts + Number(a.points) });
  });
  return [...agg]
    .filter(([, v]) => v.n >= minAnswers)
    .map(([questionId, v]) => ({ questionId, answers: v.n, correctRate: v.pts / v.n }))
    .sort((x, y) => x.correctRate - y.correctRate)
    .slice(0, limit);
}

// ---------------------------------------------------------------- roleplay stats

export function competencyAverages(scores: Record<string, number>[]): Record<string, number | null> {
  const keys = new Set(scores.flatMap((s) => Object.keys(s)));
  return Object.fromEntries(
    [...keys].map((k) => {
      const vals = scores.map((s) => s[k]).filter((v): v is number => typeof v === "number");
      return [k, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null];
    }),
  );
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** CSV with RFC-4180 quoting; also neutralises spreadsheet formula injection. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length && !columns) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}
