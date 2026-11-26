import { describe, expect, it } from "vitest";
import { addToCart, cartTotalCentavos, lineTotalCentavos, normalizePhMobile, resolvePrice } from "./pricing";

const base = {
  customerPrices: [],
  listCode: "DISTRIBUTOR",
  listItems: [
    { minQty: 1, priceCentavos: 20000n, validFrom: "2000-01-01", validTo: null },
    { minQty: 12, priceCentavos: 19000n, validFrom: "2000-01-01", validTo: null },
    { minQty: 1, priceCentavos: 21000n, validFrom: "2027-01-01", validTo: null },
  ],
  srpCentavos: 25600n,
};

describe("resolvePrice", () => {
  it("uses the highest quantity break that applies", () => {
    expect(resolvePrice(base, 5, "2026-11-26")).toEqual({ priceCentavos: 20000n, source: "DISTRIBUTOR" });
    expect(resolvePrice(base, 12, "2026-11-26")).toEqual({ priceCentavos: 19000n, source: "DISTRIBUTOR" });
  });
  it("respects effective dates (newest wins)", () => {
    expect(resolvePrice(base, 1, "2027-02-01").priceCentavos).toBe(21000n);
  });
  it("customer price beats the list; SRP is the fallback", () => {
    expect(resolvePrice({ ...base, customerPrices: [{ priceCentavos: 18000n, validFrom: "2026-01-01", validTo: null }] }, 1, "2026-11-26").source).toBe("customer");
    expect(resolvePrice({ ...base, listItems: [] }, 1, "2026-11-26")).toEqual({ priceCentavos: 25600n, source: "SRP" });
    expect(() => resolvePrice({ ...base, listItems: [], srpCentavos: null }, 1, "2026-11-26")).toThrow(/no price/);
  });
  it("ignores expired customer prices", () => {
    expect(resolvePrice({ ...base, customerPrices: [{ priceCentavos: 1n, validFrom: "2025-01-01", validTo: "2025-12-31" }] }, 1, "2026-11-26").source).toBe("DISTRIBUTOR");
  });
});

describe("totals", () => {
  it("rounds line totals to the centavo like Postgres", () => {
    expect(lineTotalCentavos(2, 25600n, 10)).toBe(46080n); // 512 × 0.9 = 460.80
    expect(lineTotalCentavos(3, 3333n, 0)).toBe(9999n);
    expect(lineTotalCentavos(1, 1n, 50)).toBe(1n); // 0.005 rounds half up
    expect(lineTotalCentavos(1.5, 10000n, 0)).toBe(15000n);
  });
  it("rejects bad quantities and discounts", () => {
    expect(() => lineTotalCentavos(0, 100n)).toThrow();
    expect(() => lineTotalCentavos(1, 100n, 101)).toThrow();
  });
  it("adds up a cart", () => {
    expect(cartTotalCentavos([{ sku: "A", qty: 3, unitCentavos: 25600n }, { sku: "B", qty: 1, unitCentavos: 61700n }])).toBe(138500n);
  });
});

describe("cart", () => {
  it("merges by SKU, caps at 999 and drops zero lines", () => {
    let c = addToCart([], { sku: "P1-1L", qty: 2 });
    c = addToCart(c, { sku: "P1-1L", qty: 3 });
    expect(c).toEqual([{ sku: "P1-1L", qty: 5 }]);
    c = addToCart(c, { sku: "P1-1L", qty: 5000 });
    expect(c[0].qty).toBe(999);
    c = addToCart(c, { sku: "P1-1L", qty: -999 });
    expect(c).toEqual([]);
  });
});

describe("normalizePhMobile", () => {
  it("accepts 09… and +639… numbers", () => {
    expect(normalizePhMobile("0917 123 4567")).toBe("09171234567");
    expect(normalizePhMobile("+63 917-123-4567")).toBe("+639171234567");
    expect(normalizePhMobile("12345")).toBeNull();
  });
});
