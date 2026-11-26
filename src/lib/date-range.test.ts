import { describe, expect, it } from "vitest";
import { presetRange } from "./date-range";

// Wed 2027-01-13 01:30 Manila = Tue 2027-01-12 17:30 UTC (Manila day must win)
const now = new Date("2027-01-12T17:30:00Z");

describe("presetRange", () => {
  it("uses the Manila calendar day", () => {
    expect(presetRange("today", now)).toEqual({ from: "2027-01-13", to: "2027-01-13" });
    expect(presetRange("yesterday", now)).toEqual({ from: "2027-01-12", to: "2027-01-12" });
  });
  it("starts weeks on Monday and handles month/quarter/year boundaries", () => {
    expect(presetRange("this_week", now)).toEqual({ from: "2027-01-11", to: "2027-01-13" });
    expect(presetRange("last_month", now)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(presetRange("this_quarter", now).from).toBe("2027-01-01");
    expect(presetRange("this_year", now).from).toBe("2027-01-01");
  });
});
