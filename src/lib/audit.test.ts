import { describe, expect, it } from "vitest";
import { describeAuditEntry, type AuditEntry } from "./audit";

const base: AuditEntry = { id: 1, at: "2026-12-01T00:00:00Z", actor_id: null, action: "update", entity: "departments", entity_id: "d1", before: null, after: null, diff: null, is_restricted: false };

describe("describeAuditEntry", () => {
  it("lists changed fields in plain words and hides internal ones", () => {
    const d = describeAuditEntry({
      ...base,
      after: { name: "Sales" },
      diff: { name: ["Sale", "Sales"], head_employee_id: [null, "e1"], updated_at: ["a", "b"], active: [true, false] },
    });
    expect(d.summary).toBe("changed department “Sales”");
    expect(d.changes).toEqual([
      { field: "name", label: "name", from: "Sale", to: "Sales" },
      { field: "head_employee_id", label: "head employee", from: "—", to: "e1" },
      { field: "active", label: "active", from: "yes", to: "no" },
    ]);
  });
  it("describes role grants with the role name", () => {
    const d = describeAuditEntry({ ...base, entity: "user_roles", action: "insert", after: { role_id: "r1", user_id: "u1" } }, { roleName: () => "CEO" });
    expect(d.summary).toBe("granted CEO");
    expect(describeAuditEntry({ ...base, entity: "user_roles", action: "delete", before: { role_id: "r1" } }, { roleName: () => "CEO" }).summary).toBe("removed CEO");
  });
  it("doesn't print long text blobs", () => {
    const d = describeAuditEntry({ ...base, entity: "lessons", after: { title: "Intro" }, diff: { content: [{ a: 1 }, { a: 2 }] } });
    expect(d.changes[0]).toMatchObject({ from: "(text)", to: "(text)" });
  });
});
