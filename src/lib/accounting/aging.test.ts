import { describe, expect, it } from "vitest";
import { ageItems, bucketFor, totals } from "./aging";

const item = (key: string, party: string, due: string, amount: number, paid = 0) => ({ key, party, label: key, date: due, due, amount: BigInt(amount), paid: BigInt(paid) });

describe("bucketFor", () => {
  it("puts items in the right age bucket", () => {
    expect(bucketFor("2026-12-31", "2026-12-31")).toBe("current");
    expect(bucketFor("2026-12-01", "2026-12-31")).toBe("1-30");
    expect(bucketFor("2026-11-30", "2026-12-31")).toBe("31-60");
    expect(bucketFor("2026-10-15", "2026-12-31")).toBe("61-90");
    expect(bucketFor("2026-09-01", "2026-12-31")).toBe("90+");
  });
});

describe("ageItems", () => {
  it("nets linked payments and settles the oldest items with unapplied money", () => {
    const rows = ageItems(
      [item("A", "c1", "2026-09-15", 10000), item("B", "c1", "2026-12-20", 5000, 1000), item("C", "c2", "2026-12-30", 2000)],
      [{ party: "c1", amount: 12000n }],
      "2026-12-31",
    );
    const c1 = rows.find((r) => r.party === "c1")!;
    // A (10,000) fully settled; 2,000 left reduces B's open 4,000 → 2,000
    expect(c1.total).toBe(2000n);
    expect(c1.buckets["1-30"]).toBe(2000n);
    expect(c1.items.map((i) => i.key)).toEqual(["B"]);
    const t = totals(rows);
    expect(t.total).toBe(4000n);
  });

  it("an overpayment shows as credit, not a negative balance", () => {
    const rows = ageItems([item("A", "c1", "2026-12-01", 1000, 1500)], [], "2026-12-31");
    expect(rows[0].total).toBe(0n);
    expect(rows[0].credit).toBe(500n);
  });
});
