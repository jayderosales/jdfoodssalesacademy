import { describe, expect, it } from "vitest";
import { totp } from "./helpers";

describe("totp", () => {
  // RFC 6238 test vector: secret "12345678901234567890" (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ), T=59s → 94287082 (8 digits) → 287082
  it("matches the RFC 6238 SHA-1 test vector", () => {
    expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
  });
});
