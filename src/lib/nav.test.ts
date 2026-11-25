import { describe, expect, it } from "vitest";
import { buildNav } from "./nav";

const hrefs = (perms: string[], role: "owner" | "manager" | "rep" | null = null) => {
  const { sections, mobile } = buildNav(new Set(perms), role);
  return { all: sections.flatMap((s) => s.items.map((i) => i.href)), mobile: mobile.map((m) => m.href), titles: sections.map((s) => s.title) };
};

describe("buildNav", () => {
  it("shows a sales rep only their training pages", () => {
    const n = hrefs(["org.view", "academy.learn"], "rep");
    expect(n.all).toEqual(["/dashboard", "/learn", "/quizzes", "/roleplay"]);
    expect(n.mobile).toEqual(["/dashboard", "/learn", "/roleplay", "/quizzes", "/account"]);
  });
  it("shows a warehouse person no training pages", () => {
    const n = hrefs(["org.view"]);
    expect(n.all).toEqual(["/dashboard"]);
    expect(n.mobile).toContain("/account");
  });
  it("shows an auditor the audit log and users but no settings", () => {
    const n = hrefs(["readonly.all", "audit.view", "org.view", "admin.users.view", "academy.reports.view"]);
    expect(n.all).toContain("/admin/audit");
    expect(n.all).toContain("/admin/users");
    expect(n.all).not.toContain("/admin/settings");
  });
  it("shows upcoming modules only to role administrators", () => {
    expect(hrefs(["admin.roles.manage"]).titles).toContain("Coming soon");
    expect(hrefs(["admin.users.view"]).titles).not.toContain("Coming soon");
  });
  it("labels the team page 'All reps' for Academy admins", () => {
    const { sections } = buildNav(new Set(["academy.admin"]), "owner");
    expect(sections.flatMap((s) => s.items).find((i) => i.href === "/team")?.label).toBe("All reps");
  });
});
