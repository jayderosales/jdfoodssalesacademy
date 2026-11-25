import { describe, expect, it } from "vitest";
import { generateHTML } from "@tiptap/html/server";
import { lessonExtensions } from "./extensions";
import { sanitizeDoc, type TiptapNode } from "./sanitize";

// render.ts = sanitizeDoc + generateHTML (it imports "server-only", so it is tested through its parts)
const render = (doc: TiptapNode) => generateHTML(sanitizeDoc(doc)!, lessonExtensions);

describe("lesson rendering", () => {
  it("renders headings, lists, safe links and YouTube embeds", () => {
    const html = render({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Flow" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Greet" }] }] }] },
        { type: "paragraph", content: [{ type: "text", text: "site", marks: [{ type: "link", attrs: { href: "https://jdfoods.ph" } }] }] },
        { type: "youtube", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
      ],
    });
    expect(html).toContain("<h2>Flow</h2>");
    expect(html).toContain("<li><p>Greet</p></li>");
    expect(html).toContain('href="https://jdfoods.ph"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("escapes text that looks like HTML", () => {
    const html = render({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] }] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
