import { describe, expect, it } from "vitest";
import { orderShortages, totalShort } from "./shortage";

describe("orderShortages", () => {
  it("finds items not reserved in full and ignores complete lines and services", () => {
    const s = orderShortages(
      [
        { lineId: "l1", productId: "sauce", qty: 10, itemType: "finished_good" },
        { lineId: "l2", productId: "powder", qty: 4, itemType: "finished_good" },
        { lineId: "l3", productId: "delivery", qty: 1, itemType: "service" },
      ],
      [{ lineId: "l1", productId: "sauce", qty: 10 }, { lineId: "l2", productId: "powder", qty: 1 }],
      new Map(),
    );
    expect(s).toEqual([{ productId: "powder", needed: 4, reserved: 1, short: 3 }]);
  });

  it("checks bundles per component", () => {
    const s = orderShortages(
      [{ lineId: "l1", productId: "gift-box", qty: 2, itemType: "bundle" }],
      [{ lineId: "l1", productId: "sauce", qty: 2 }],
      new Map([["gift-box", [{ componentId: "sauce", qty: 1 }, { componentId: "powder", qty: 3 }]]]),
    );
    expect(s).toEqual([{ productId: "powder", needed: 6, reserved: 0, short: 6 }]);
  });

  it("adds up what all incomplete orders still need", () => {
    const t = totalShort([[{ productId: "a", needed: 5, reserved: 0, short: 5 }], [{ productId: "a", needed: 2.5, reserved: 0, short: 2.5 }]]);
    expect(t.get("a")).toBe(7.5);
  });
});
