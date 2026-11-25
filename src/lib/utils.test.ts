import { describe, expect, it } from "vitest";
import { formatPHP, isHexColor, manilaToday } from "./utils";
import { safeNext } from "./safe-redirect";
import { buildNav } from "./nav";

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

describe("buildNav (phone bar)", () => {
  it("keeps the phone bar at 5 items or fewer and always includes My account", () => {
    const sets = [
      ["academy.admin", "admin.users.view", "admin.roles.manage", "admin.settings.manage", "audit.view", "org.view"],
      ["academy.team.manage", "academy.reports.view", "academy.learn", "org.view"],
      ["academy.learn", "org.view"],
      [],
    ];
    for (const perms of sets) {
      const { mobile } = buildNav(new Set(perms), null);
      expect(mobile.length).toBeLessThanOrEqual(5);
      expect(mobile.some((i) => i.href === "/account")).toBe(true);
    }
  });
  it("never shows admin links to reps", () => {
    const { sections } = buildNav(new Set(["academy.learn", "org.view"]), "rep");
    expect(sections.flatMap((s) => s.items).some((i) => i.href.startsWith("/admin") && i.href !== "/admin/org")).toBe(false);
  });
});
