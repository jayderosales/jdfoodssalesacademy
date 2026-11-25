import { describe, expect, it } from "vitest";
import { formatPHP, isHexColor, manilaToday } from "./utils";
import { safeNext } from "./safe-redirect";
import { navFor } from "./nav";

describe("safeNext", () => {
  it("allows same-site paths", () => expect(safeNext("/learn/abc")).toBe("/learn/abc"));
  it("blocks absolute and protocol-relative URLs", () => {
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
  });
  it("falls back when empty", () => expect(safeNext(null)).toBe("/dashboard"));
});

describe("manilaToday", () => {
  it("uses Asia/Manila day boundary (UTC+8)", () => {
    // 2026-11-25 17:30 UTC is already 2026-11-26 01:30 in Manila
    expect(manilaToday(new Date("2026-11-25T17:30:00Z"))).toBe("2026-11-26");
    expect(manilaToday(new Date("2026-11-25T15:30:00Z"))).toBe("2026-11-25");
  });
});

describe("manilaDayStart / manilaMonthStart", () => {
  it("returns Manila midnight as a UTC instant", async () => {
    const { manilaDayStart, manilaMonthStart } = await import("./utils");
    const now = new Date("2026-11-30T17:30:00Z"); // = Dec 1, 01:30 in Manila
    expect(manilaDayStart(now).toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(manilaMonthStart(now).toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(manilaMonthStart(new Date("2026-11-15T03:00:00Z")).toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });
});

describe("formatPHP", () => {
  it("formats pesos", () => expect(formatPHP(26728)).toMatch(/₱\s?26,728/));
  it("handles null", () => expect(formatPHP(null)).toBe("—"));
});

describe("isHexColor", () => {
  it("accepts hex", () => expect(isHexColor("#c8102e")).toBe(true));
  it("rejects CSS injection", () => expect(isHexColor("red;}body{display:none")).toBe(false));
});

describe("navFor", () => {
  it("keeps the phone bar at 5 items or fewer for every role", () => {
    for (const role of ["owner", "manager", "rep"] as const) {
      expect(navFor(role).filter((i) => i.mobile).length).toBeLessThanOrEqual(5);
    }
  });
  it("never shows admin links to reps", () => {
    expect(navFor("rep").some((i) => i.href.startsWith("/admin"))).toBe(false);
  });
});
