import { describe, expect, it } from "vitest";
import { buildNav, trainingTabs } from "./nav";

const hrefs = (perms: string[], role: "owner" | "manager" | "rep" | null = null) => {
  const { sections, mobile } = buildNav(new Set(perms), role);
  return { all: sections.flatMap((s) => s.items.map((i) => i.href)), mobile: mobile.map((m) => m.href), titles: sections.map((s) => s.title) };
};

describe("buildNav", () => {
  it("shows Training as one sidebar item, with the rep's pages as tabs", () => {
    const n = hrefs(["org.view", "academy.learn"], "rep");
    expect(n.all).toEqual(["/dashboard", "/accounting/transmittals", "/learn"]);
    const { sections } = buildNav(new Set(["org.view", "academy.learn"]), "rep");
    const training = sections[0].items.find((i) => i.label === "Training");
    expect(training?.match).toEqual(["/learn", "/quizzes", "/roleplay"]);
    expect(n.mobile).toEqual(["/dashboard", "/learn", "/account"]);
    expect(trainingTabs(new Set(["academy.learn"]), "rep").map((t) => t.label)).toEqual(["Learn", "Quizzes", "Roleplay"]);
  });
  it("gives Academy admins every Training tab", () => {
    expect(trainingTabs(new Set(["academy.admin", "academy.learn"]), "owner").map((t) => t.href)).toEqual([
      "/learn", "/quizzes", "/roleplay", "/team", "/reviews", "/reports", "/signup-links", "/admin/content",
    ]);
  });
  it("shows a warehouse person no training pages", () => {
    const n = hrefs(["org.view"]);
    expect(n.all).toEqual(["/dashboard", "/accounting/transmittals"]); // everyone can send transmittals
    expect(n.mobile).toContain("/account");
  });
  it("shows an auditor the audit log and users but no settings", () => {
    const n = hrefs(["readonly.all", "audit.view", "org.view", "admin.users.view", "academy.reports.view"]);
    expect(n.all).toContain("/admin/audit");
    expect(n.all).toContain("/admin/users");
    expect(n.all).not.toContain("/admin/settings");
  });
  it("shows upcoming modules only to role administrators, and hides the section when nothing is upcoming", () => {
    expect(hrefs(["admin.roles.manage"]).titles).not.toContain("Coming soon"); // every planned module is built
    expect(hrefs(["admin.users.view"]).titles).not.toContain("Coming soon");
  });
  it("labels the team tab 'All reps' for Academy admins", () => {
    expect(trainingTabs(new Set(["academy.admin"]), "owner").find((i) => i.href === "/team")?.label).toBe("All reps");
  });
});
