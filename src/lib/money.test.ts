import { describe, expect, it } from "vitest";
import { formatMoney, fromCentavos, parseMoney, toCentavos } from "./money";

describe("parseMoney", () => {
  it("accepts common ways people type amounts", () => {
    expect(parseMoney("1234")).toBe("1234.00");
    expect(parseMoney("₱1,234.5")).toBe("1234.50");
    expect(parseMoney(" 50 000.25 ")).toBe("50000.25");
    expect(parseMoney("PHP 0.10")).toBe("0.10");
  });
  it("rejects negatives, more than 2 decimals and junk", () => {
    for (const bad of ["-5", "1.234", "abc", "", "1e5", "12,34.5.6"]) expect(parseMoney(bad), bad).toBeNull();
  });
});

describe("centavos", () => {
  it("round-trips exactly (no floating point)", () => {
    expect(toCentavos("0.10") + toCentavos("0.20")).toBe(30n);
    expect(fromCentavos(toCentavos("50000.01"))).toBe("50000.01");
    expect(fromCentavos(-150n)).toBe("-1.50");
  });
});

describe("formatMoney", () => {
  it("formats pesos", () => {
    expect(formatMoney("1234567.5")).toBe("₱1,234,567.50");
    expect(formatMoney(50000)).toBe("₱50,000.00");
    expect(formatMoney(null)).toBe("—");
  });
});
