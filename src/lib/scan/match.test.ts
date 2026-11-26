import { describe, expect, it } from "vitest";
import { bestMatch, cleanAmount, cleanDate, cleanQty, similarity } from "./match";

const products = [
  { id: "1", name: "ThyChef Sweet BBQ Sauce 1L", code: "P1-1L", alt: ["4800001112223"] },
  { id: "2", name: "ThyChef Sweet BBQ Sauce 3.8L", code: "P1-GAL" },
  { id: "3", name: "Arkadia Cheese Powder 1kg", code: "CP-1K" },
];

describe("matching", () => {
  it("prefers an exact code or barcode", () => {
    expect(bestMatch({ code: "p1-gal", name: "something else" }, products).candidate?.id).toBe("2");
    expect(bestMatch({ code: "4800001112223" }, products)).toMatchObject({ how: "code", candidate: { id: "1" } });
  });

  it("falls back to the closest name, and gives up below the threshold", () => {
    expect(bestMatch({ name: "Cheese powder 1 kg Arkadia" }, products).candidate?.id).toBe("3");
    expect(bestMatch({ name: "Sweet BBQ 3.8L" }, products).candidate?.id).toBe("2");
    expect(bestMatch({ name: "Garlic oil" }, products).candidate).toBeNull();
  });

  it("matches suppliers by TIN even when the name is written differently", () => {
    const sups = [{ id: "a", name: "Sauce Bottler Inc.", tin: "123-456-789-000" }, { id: "b", name: "Box Makers Corp" }];
    expect(bestMatch({ name: "SB Packaging", tin: "123456789" }, sups)).toMatchObject({ how: "tin", candidate: { id: "a" } });
    expect(bestMatch({ name: "SAUCE BOTTLER" }, sups).candidate?.id).toBe("a");
    expect(similarity("Box Makers Corporation", "Box Makers Corp")).toBe(1);
  });
});

describe("cleaning what the AI read", () => {
  it("normalises amounts, quantities and dates and rejects junk", () => {
    expect(cleanAmount("₱12,500.5")).toBe("12500.50");
    expect(cleanAmount("1250")).toBe("1250.00");
    expect(cleanAmount("about 500")).toBe("");
    expect(cleanQty("1,200")).toBe("1200");
    expect(cleanQty("0")).toBe("");
    expect(cleanDate("11/26/2026")).toBe("2026-11-26");
    expect(cleanDate("2026-02-30")).toBe("");
  });
});
