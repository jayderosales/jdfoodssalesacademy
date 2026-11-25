import { describe, expect, it } from "vitest";
import { parseFaqs } from "./faqs";

describe("parseFaqs", () => {
  it("parses Q/A blocks", () => {
    expect(parseFaqs("Q: Is it halal?\nA: TODO verify\n\nQ: Shelf life?\nA: 12 months\nafter opening 3")).toEqual([
      { q: "Is it halal?", a: "TODO verify" },
      { q: "Shelf life?", a: "12 months\nafter opening 3" },
    ]);
  });
  it("ignores empty input", () => expect(parseFaqs("")).toEqual([]));
});
