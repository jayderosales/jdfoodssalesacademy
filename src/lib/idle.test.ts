import { describe, expect, it } from "vitest";
import { idleState, serverSessionExpired } from "./idle";

describe("idleState", () => {
  const limit = 30 * 60_000;
  it("is fine while active", () => {
    expect(idleState(0, 10 * 60_000, limit)).toEqual({ expired: false, warn: false, remainingMs: 20 * 60_000 });
  });
  it("warns in the last minute", () => {
    expect(idleState(0, limit - 30_000, limit)).toMatchObject({ warn: true, expired: false });
  });
  it("expires at the limit", () => {
    expect(idleState(0, limit, limit)).toMatchObject({ expired: true, warn: false });
  });
});

describe("serverSessionExpired", () => {
  it("expires sessions idle longer than the limit", () => {
    const t0 = Date.UTC(2026, 11, 1);
    expect(serverSessionExpired(String(t0), "30", t0 + 31 * 60_000)).toBe(true);
    expect(serverSessionExpired(String(t0), "30", t0 + 29 * 60_000)).toBe(false);
  });
  it("never expires on missing or garbage cookies", () => {
    expect(serverSessionExpired(undefined, "30", 1e12)).toBe(false);
    expect(serverSessionExpired("abc", "30", 1e12)).toBe(false);
    expect(serverSessionExpired("5", undefined, 1e12)).toBe(false);
  });
});
