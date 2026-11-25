import { describe, expect, it } from "vitest";
import { atRiskReasons, competencyAverages, computeLevel, hardestQuestions, median, quizStats, toCsv, type LevelRule, type RepActivity } from "./metrics";

// Same rules as the seeded `levels` table
const rules: LevelRule[] = [
  { level: 0, name: "Trainee", requires_signoff: false, requirements: {} },
  { level: 1, name: "Product Ready", requires_signoff: false, requirements: { modules_completed_categories: ["company", "product"], quiz_min_pct: 80 } },
  { level: 2, name: "Field Ready", requires_signoff: false, requirements: { modules_completed_categories: ["customers", "scripts", "objections", "sop"], roleplays: { difficulty: "easy", count: 3, min_score: 70 } } },
  { level: 3, name: "Competent", requires_signoff: false, requirements: { certification_passed: true, roleplays: { difficulty: "medium", count: 3, avg_min: 75 } } },
  { level: 4, name: "Advanced", requires_signoff: true, requirements: { roleplays: { difficulty: "hard", count: 3, avg_min: 80 } } },
];

const base: RepActivity = {
  hireDate: "2026-11-01",
  createdAt: "2026-11-01T00:00:00Z",
  lastActiveAt: "2026-11-20T00:00:00Z",
  categoryDoneAt: {},
  quizzes: [],
  certification: [],
  roleplays: [],
  signoffs: {},
};

const productReady: RepActivity = {
  ...base,
  categoryDoneAt: { company: "2026-11-03T00:00:00Z", product: "2026-11-06T00:00:00Z" },
  quizzes: [
    { quizId: "q1", category: "company", attempts: [{ at: "2026-11-03T10:00:00Z", score: 92, passed: true }] },
    { quizId: "q2", category: "product", attempts: [
      { at: "2026-11-06T10:00:00Z", score: 67, passed: false },
      { at: "2026-11-07T10:00:00Z", score: 83, passed: true },
    ] },
  ],
};

describe("computeLevel", () => {
  it("new hire is Trainee and is told what is missing", () => {
    const r = computeLevel(rules, base);
    expect(r.level).toBe(0);
    expect(r.next?.missing[0]).toMatch(/company, product/);
  });

  it("Product Ready on the day the last quiz reached 80%", () => {
    const r = computeLevel(rules, productReady);
    expect(r.level).toBe(1);
    expect(r.achievedAt[1]).toBe("2026-11-07T10:00:00Z");
  });

  it("Field Ready needs 3 easy roleplays at 70+, dated at the third", () => {
    const a: RepActivity = {
      ...productReady,
      categoryDoneAt: { ...productReady.categoryDoneAt, customers: "2026-11-09T00:00:00Z", scripts: "2026-11-10T00:00:00Z", objections: "2026-11-11T00:00:00Z", sop: "2026-11-12T00:00:00Z" },
      roleplays: [
        { difficulty: "easy", overall: 72, at: "2026-11-13T00:00:00Z" },
        { difficulty: "easy", overall: 60, at: "2026-11-14T00:00:00Z" },
        { difficulty: "easy", overall: 78, at: "2026-11-15T00:00:00Z" },
        { difficulty: "easy", overall: 81, at: "2026-11-16T00:00:00Z" },
      ],
    };
    const r = computeLevel(rules, a);
    expect(r.level).toBe(2);
    expect(r.achievedAt[2]).toBe("2026-11-16T00:00:00Z");
    expect(r.next?.missing).toContain("Pass the certification exam");
  });

  it("levels are cumulative: hard roleplays alone don't skip levels", () => {
    const a = { ...base, roleplays: [1, 2, 3].map((i) => ({ difficulty: "hard", overall: 95, at: `2026-11-1${i}T00:00:00Z` })) };
    expect(computeLevel(rules, a).level).toBe(0);
  });

  it("sign-off levels wait for the manager", () => {
    const allDone: RepActivity = {
      ...productReady,
      categoryDoneAt: { company: "2026-11-03", product: "2026-11-06", customers: "2026-11-09", scripts: "2026-11-10", objections: "2026-11-11", sop: "2026-11-12" },
      certification: [{ at: "2026-11-18", passed: true }],
      roleplays: [
        ...[1, 2, 3].map((i) => ({ difficulty: "easy", overall: 80, at: `2026-11-1${i}` })),
        ...[4, 5, 6].map((i) => ({ difficulty: "medium", overall: 80, at: `2026-11-1${i}` })),
        ...[7, 8, 9].map((i) => ({ difficulty: "hard", overall: 85, at: `2026-11-1${i}` })),
      ],
    };
    expect(computeLevel(rules, allDone).level).toBe(3);
    expect(computeLevel(rules, { ...allDone, signoffs: { 4: "2026-11-25" } }).level).toBe(4);
  });
});

describe("atRiskReasons", () => {
  const s = { at_risk_inactive_days: 3, at_risk_failed_attempts: 3, onboarding_target_days: 30 };
  const now = new Date("2026-11-25T00:00:00Z");
  it("flags inactivity", () => {
    expect(atRiskReasons({ ...base, lastActiveAt: "2026-11-20T00:00:00Z" }, 0, s, now)).toEqual(["Inactive 5 days"]);
  });
  it("flags repeated quiz failures without a pass", () => {
    const quizzes = [{ quizId: "q", category: "sop", attempts: [1, 2, 3].map(() => ({ at: "2026-11-24", score: 50, passed: false })) }];
    expect(atRiskReasons({ ...base, lastActiveAt: "2026-11-24", quizzes }, 1, s, now)).toEqual(["Failed a quiz 3 times"]);
  });
  it("flags reps behind the onboarding schedule", () => {
    expect(atRiskReasons({ ...base, hireDate: "2026-10-01", lastActiveAt: "2026-11-24" }, 1, s, now)).toEqual(["Not Field Ready after 55 days"]);
  });
  it("no flags for an on-track rep", () => {
    expect(atRiskReasons({ ...base, lastActiveAt: "2026-11-24" }, 0, s, now)).toEqual([]);
  });
});

describe("quizStats & hardestQuestions", () => {
  it("computes pass rate per person and first-attempt pass rate", () => {
    const [st] = quizStats([
      { quizId: "q", userId: "a", submittedAt: "1", passed: false, score: 60 },
      { quizId: "q", userId: "a", submittedAt: "2", passed: true, score: 90 },
      { quizId: "q", userId: "b", submittedAt: "1", passed: true, score: 80 },
    ]);
    expect(st.passRate).toBe(1);
    expect(st.firstAttemptPassRate).toBe(0.5);
    expect(st.avgScore).toBeCloseTo(76.67, 1);
  });
  it("ranks questions by lowest correct rate, ignoring rarely answered ones", () => {
    const answers = [
      ...[1, 0, 0, 0].map((p) => ({ questionId: "hard", points: p })),
      ...[1, 1, 1, 0].map((p) => ({ questionId: "easy", points: p })),
      { questionId: "rare", points: 0 },
    ];
    expect(hardestQuestions(answers).map((q) => q.questionId)).toEqual(["hard", "easy"]);
  });
});

describe("helpers", () => {
  it("competencyAverages", () => {
    expect(competencyAverages([{ opening: 4, closing: 2 }, { opening: 2 }])).toEqual({ opening: 3, closing: 2 });
  });
  it("median", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("toCsv quotes and blocks formula injection", () => {
    expect(toCsv([{ name: 'Ana "A" Reyes', note: "=HYPERLINK(1)" }])).toBe('name,note\r\n"Ana ""A"" Reyes",\'=HYPERLINK(1)');
  });
});
