import { describe, expect, it } from "vitest";
import { sanitizeDoc } from "./sanitize";

describe("sanitizeDoc", () => {
  it("keeps normal content", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }] }] }] };
    expect(sanitizeDoc(doc)).toEqual(doc);
  });
  it("drops javascript: links but keeps the text", () => {
    const out = sanitizeDoc({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
    });
    expect(out!.content![0].content![0]).toEqual({ type: "text", text: "click", marks: [] });
  });
  it("drops unknown nodes, non-https images and non-YouTube embeds", () => {
    const out = sanitizeDoc({
      type: "doc",
      content: [
        { type: "script" },
        { type: "image", attrs: { src: "data:image/svg+xml;base64,xxx" } },
        { type: "image", attrs: { src: "https://x.supabase.co/a.png", onerror: "alert(1)" } },
        { type: "youtube", attrs: { src: "https://evil.com/embed/x" } },
      ],
    });
    expect(out!.content).toEqual([{ type: "image", attrs: { src: "https://x.supabase.co/a.png" } }]);
  });
});
