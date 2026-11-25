import { describe, expect, it } from "vitest";
import { accessFromRows, can, NO_ACCESS } from "./access";

describe("accessFromRows", () => {
  it("collects permissions and MFA state", () => {
    const a = accessFromRows([
      { permission: "org.view", mfa_required: true, mfa_ok: true, is_internal: true },
      { permission: "academy.learn", mfa_required: true, mfa_ok: true, is_internal: true },
      { permission: null, mfa_required: true, mfa_ok: true, is_internal: true },
    ]);
    expect([...a.permissions].sort()).toEqual(["academy.learn", "org.view"]);
    expect(a.mfaRequired && a.mfaOk && a.isInternal).toBe(true);
    expect(can(a, "org.view")).toBe(true);
    expect(can(a, ["admin.users.manage", "academy.learn"])).toBe(true);
    expect(can(a, "admin.users.manage")).toBe(false);
  });
  it("treats no rows as no access", () => {
    expect(accessFromRows([])).toBe(NO_ACCESS);
    expect(can(NO_ACCESS, "org.view")).toBe(false);
  });
});
