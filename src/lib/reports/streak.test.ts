import { describe, expect, it } from "vitest";
import { practiceStreak, weakestSkill } from "./streak";

// "now" = 2026-11-26 10:00 Manila (02:00 UTC)
const now = new Date("2026-11-26T02:00:00Z");

describe("practiceStreak", () => {
  it("counts consecutive Manila days ending today", () => {
    expect(practiceStreak(["2026-11-26T01:00:00Z", "2026-11-25T03:00:00Z", "2026-11-24T05:00:00Z"], now)).toBe(3);
  });
  it("keeps yesterday's streak alive before today's practice", () => {
    expect(practiceStreak(["2026-11-25T03:00:00Z", "2026-11-24T05:00:00Z"], now)).toBe(2);
  });
  it("breaks on a missed day", () => {
    expect(practiceStreak(["2026-11-26T01:00:00Z", "2026-11-24T05:00:00Z"], now)).toBe(1);
    expect(practiceStreak(["2026-11-23T05:00:00Z"], now)).toBe(0);
  });
  it("uses the Manila day, not UTC", () => {
    // 2026-11-25 17:00 UTC = Nov 26, 01:00 in Manila → counts as today
    expect(practiceStreak(["2026-11-25T17:00:00Z"], now)).toBe(1);
  });
  it("handles no activity", () => expect(practiceStreak([], now)).toBe(0));
});

describe("weakestSkill", () => {
  it("returns the lowest average, ignoring skills with no data", () => {
    expect(weakestSkill({ opening: 4, closing: 2.5, value: null, objections: 3 }, ["opening", "value", "objections", "closing"])).toBe("closing");
  });
  it("null when there are no scores", () => expect(weakestSkill({}, ["opening"])).toBeNull());
});
