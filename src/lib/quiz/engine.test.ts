import { describe, expect, it } from "vitest";
import { attemptAvailability, drawQuestions, gradeObjective, scorePct, toEmbedUrl, type QuestionForDraw } from "./engine";

/** deterministic RNG */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const pool: QuestionForDraw[] = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i}`,
  type: i % 3 === 0 ? "tf" : "mcq",
  options: i % 3 === 0 ? [] : [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }, { id: "d", text: "D" }],
}));

describe("drawQuestions", () => {
  it("draws the requested number without duplicates", () => {
    const d = drawQuestions(pool, 5, { shuffle: true, rng: seeded(1) });
    expect(d).toHaveLength(5);
    expect(new Set(d.map((q) => q.question_id)).size).toBe(5);
  });
  it("caps at bank size", () => {
    expect(drawQuestions(pool, 50, { shuffle: true, rng: seeded(2) })).toHaveLength(10);
  });
  it("avoids last attempt's questions when the bank is big enough", () => {
    const first = drawQuestions(pool, 5, { shuffle: true, rng: seeded(3) }).map((q) => q.question_id);
    const second = drawQuestions(pool, 5, { shuffle: true, avoidIds: first, rng: seeded(4) }).map((q) => q.question_id);
    expect(second.some((id) => first.includes(id))).toBe(false);
  });
  it("tops up with repeats when the bank is small", () => {
    const first = drawQuestions(pool, 8, { shuffle: true, rng: seeded(5) }).map((q) => q.question_id);
    const second = drawQuestions(pool, 8, { shuffle: true, avoidIds: first, rng: seeded(6) });
    expect(second).toHaveLength(8);
    expect(new Set(second.map((q) => q.question_id)).size).toBe(8);
  });
  it("shuffles options of choice questions but keeps all of them", () => {
    const d = drawQuestions(pool, 10, { shuffle: true, rng: seeded(7) });
    const mcq = d.find((q) => q.question_id === "q1")!;
    expect([...mcq.option_order].sort()).toEqual(["a", "b", "c", "d"]);
    expect(d.find((q) => q.question_id === "q0")!.option_order).toEqual([]);
  });
  it("keeps bank order when shuffle is off", () => {
    expect(drawQuestions(pool, 3, { shuffle: false }).map((q) => q.question_id)).toEqual(["q0", "q1", "q2"]);
  });
});

describe("gradeObjective", () => {
  it("mcq", () => {
    expect(gradeObjective({ type: "mcq", correct: ["b"] }, "b")).toEqual({ is_correct: true, points: 1 });
    expect(gradeObjective({ type: "mcq", correct: ["b"] }, "a")!.is_correct).toBe(false);
    expect(gradeObjective({ type: "mcq", correct: ["b"] }, undefined)!.is_correct).toBe(false);
  });
  it("multi is all-or-nothing", () => {
    expect(gradeObjective({ type: "multi", correct: ["a", "c"] }, ["c", "a"])!.is_correct).toBe(true);
    expect(gradeObjective({ type: "multi", correct: ["a", "c"] }, ["a"])!.is_correct).toBe(false);
    expect(gradeObjective({ type: "multi", correct: ["a", "c"] }, ["a", "b", "c"])!.is_correct).toBe(false);
  });
  it("true/false", () => {
    expect(gradeObjective({ type: "tf", correct: false }, false)!.is_correct).toBe(true);
    expect(gradeObjective({ type: "tf", correct: false }, "false")!.is_correct).toBe(false);
  });
  it("free text is left for the AI grader", () => {
    expect(gradeObjective({ type: "short", correct: null }, "anything")).toBeNull();
  });
});

describe("scorePct", () => {
  it("averages points over question count, 2 decimals", () => {
    expect(scorePct([1, 1, 0.5, 0], 4)).toBe(62.5);
    expect(scorePct([1, 1, 0], 3)).toBe(66.67);
    expect(scorePct([], 0)).toBe(0);
  });
});

describe("attemptAvailability", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  it("allows the first attempt", () => {
    expect(attemptAvailability({ max_attempts: 3, cooldown_hours: 24 }, [], now)).toMatchObject({ canStart: true, attemptsLeft: 3 });
  });
  it("resumes an unfinished attempt", () => {
    const a = attemptAvailability({ max_attempts: 1, cooldown_hours: 0 }, [{ id: "x", started_at: "2026-11-26T09:00:00Z", submitted_at: null, passed: null }], now);
    expect(a).toMatchObject({ canStart: true, openAttemptId: "x" });
  });
  it("enforces cooldown after a failed attempt", () => {
    const a = attemptAvailability(
      { max_attempts: null, cooldown_hours: 24 },
      [{ id: "x", started_at: "2026-11-26T08:00:00Z", submitted_at: "2026-11-26T08:30:00Z", passed: false }],
      now,
    );
    expect(a.canStart).toBe(false);
    expect(a.cooldownEndsAt?.toISOString()).toBe("2026-11-27T08:30:00.000Z");
  });
  it("no cooldown after a pass (retake to improve)", () => {
    const a = attemptAvailability(
      { max_attempts: null, cooldown_hours: 24 },
      [{ id: "x", started_at: "2026-11-26T08:00:00Z", submitted_at: "2026-11-26T08:30:00Z", passed: true }],
      now,
    );
    expect(a).toMatchObject({ canStart: true, passed: true });
  });
  it("stops at the attempt limit", () => {
    const done = { started_at: "2026-11-20T08:00:00Z", submitted_at: "2026-11-20T08:30:00Z", passed: false };
    const a = attemptAvailability({ max_attempts: 2, cooldown_hours: 0 }, [{ id: "1", ...done }, { id: "2", ...done }], now);
    expect(a).toMatchObject({ canStart: false, attemptsLeft: 0 });
  });
});

describe("toEmbedUrl", () => {
  it("converts YouTube links", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });
  it("rejects other hosts and javascript: URLs", () => {
    expect(toEmbedUrl("https://evil.com/watch?v=x")).toBeNull();
    expect(toEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(toEmbedUrl("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});
