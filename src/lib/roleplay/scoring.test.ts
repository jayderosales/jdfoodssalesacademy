import { describe, expect, it } from "vitest";
import { parseCustomerReply } from "@/lib/ai/prompts/customer";
import { formatProductFacts } from "@/lib/ai/product-facts";
import { computeOverall, normalizeGrade, parseOverrideScores } from "./scoring";

const rubric = ["opening", "discovery", "product", "value", "objections", "closing", "communication"].map((key) => ({ key, weight: 1 }));
const all = (n: number) => Object.fromEntries(rubric.map((r) => [r.key, n]));

describe("computeOverall", () => {
  it("maps the 1–5 average to 0–100 (5 = 100, 4 = 80)", () => {
    expect(computeOverall(all(5), rubric)).toBe(100);
    expect(computeOverall(all(4), rubric)).toBe(80);
    expect(computeOverall(all(1), rubric)).toBe(20);
  });
  it("applies rubric weights", () => {
    const weighted = rubric.map((r) => ({ ...r, weight: r.key === "closing" ? 3 : 1 }));
    const scores = { ...all(4), closing: 1 };
    // (6*4 + 3*1) / 9 = 3 → 60
    expect(computeOverall(scores, weighted)).toBe(60);
  });
  it("ignores criteria missing from scores and zero weights", () => {
    expect(computeOverall({ opening: 5 }, [{ key: "opening", weight: 1 }, { key: "x", weight: 1 }, { key: "y", weight: 0 }])).toBe(100);
    expect(computeOverall({}, rubric)).toBe(0);
  });
});

describe("normalizeGrade", () => {
  const raw = {
    scores: { opening: 4, discovery: 7, product: 0, value: 3, objections: 3, closing: 2, communication: 5 },
    goal_achieved: false,
    strengths: ["Good greeting", "Asked about volume", "Polite", "Extra one"],
    improvements: [
      { issue: "No close", better_line: "Pwede po ba nating i-schedule ang sampling sa Thursday?" },
      { issue: "", better_line: "" },
    ],
    factual_errors: [{ claim: "Chili garlic is 250 g", correction: "It is 120 g" }],
    summary: "You built rapport but did not ask for the next step.",
  };
  it("clamps scores into 1–5 and trims lists", () => {
    const g = normalizeGrade(raw)!;
    expect(g.scores.discovery).toBe(5);
    expect(g.scores.product).toBe(1);
    expect(g.strengths).toHaveLength(3);
    expect(g.improvements).toHaveLength(1);
  });
  it("rejects malformed output", () => {
    expect(normalizeGrade({ scores: {} })).toBeNull();
    expect(normalizeGrade({ ...raw, improvements: [] })).toBeNull();
  });
});

describe("parseOverrideScores", () => {
  it("accepts 1–5 for every criterion", () => {
    const form = Object.fromEntries(rubric.map((r) => [`score_${r.key}`, "3"]));
    expect(parseOverrideScores(form)!.closing).toBe(3);
  });
  it("rejects out-of-range or missing", () => {
    expect(parseOverrideScores({ score_opening: "6" })).toBeNull();
  });
});

describe("parseCustomerReply", () => {
  it("strips end markers and reports the reason", () => {
    expect(parseCustomerReply("Sige, subukan natin.\n[[END:AGREED]]")).toEqual({ text: "Sige, subukan natin.", end: "agreed" });
    expect(parseCustomerReply("Busy ako. Bye.\n[[END:LEFT]]")).toEqual({ text: "Busy ako. Bye.", end: "left" });
  });
  it("hides a cut-off marker", () => {
    expect(parseCustomerReply("Okay po.\n[[END:AGR")).toEqual({ text: "Okay po.", end: null });
  });
  it("leaves normal replies alone", () => {
    expect(parseCustomerReply("Magkano ba yan?")).toEqual({ text: "Magkano ba yan?", end: null });
  });
});

describe("customerSystemPrompt", () => {
  it("includes persona, hidden-need rules, language and end markers", async () => {
    const { customerSystemPrompt, END_MARKERS } = await import("@/lib/ai/prompts/customer");
    const prompt = customerSystemPrompt({
      scenarioTitle: "t",
      briefing: "After lunch rush.",
      persona: { name: "Aling Nena", business_type: "Carinderia", location: "QC", personality: "warm", budget: "tight", current_supplier: "cheap brand", hidden_needs: "customers complain", objections: ["Mas mura sa iba."] },
      goal: "Trial order",
      difficulty: "easy",
      language: "taglish",
      maxTurns: 14,
      productFacts: "### All Purpose Chili Garlic",
    });
    expect(prompt).toContain("Aling Nena");
    expect(prompt).toContain("Mas mura sa iba.");
    expect(prompt).toContain("Taglish");
    expect(prompt).toContain("Never coach");
    for (const m of Object.values(END_MARKERS)) expect(prompt).toContain(m);
  });
});

describe("formatProductFacts", () => {
  it("omits TODO fields and labels unverified products", () => {
    const text = formatProductFacts([
      {
        brand: "JD Foods", line: "Sauces", name: "All Purpose Chili Garlic", category: "Sauce", sizes: ["120 g"], price_php: 150,
        ingredients: "TODO", allergens: "TODO", shelf_life: "TODO", storage: "TODO", use_cases: "Siomai condiment.", recipes: "TODO",
        target_customers: "Carinderias", selling_points: "Consistent heat. TODO: verify.", competitor_notes: "TODO", faqs: [{ q: "Halal?", a: "TODO" }], verified: false,
      },
    ]);
    expect(text).toContain("[UNVERIFIED placeholder data]");
    expect(text).toContain("Sizes: 120 g");
    expect(text).toContain("₱150 (approximate)");
    expect(text).toContain("Selling points: Consistent heat.");
    expect(text).not.toMatch(/TODO|Ingredients|Halal/);
  });
});
