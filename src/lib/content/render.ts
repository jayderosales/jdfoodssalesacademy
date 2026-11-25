import "server-only";
import { generateHTML } from "@tiptap/html/server";
import { lessonExtensions } from "./extensions";
import { sanitizeDoc, type TiptapNode } from "./sanitize";

/** Sanitize editor JSON and render it to HTML (stored as lessons.content_html). */
export function renderLesson(json: unknown): { json: TiptapNode; html: string } {
  const clean = sanitizeDoc(json as TiptapNode) ?? { type: "doc", content: [] };
  if (clean.type !== "doc") return { json: { type: "doc", content: [] }, html: "" };
  return { json: clean, html: generateHTML(clean, lessonExtensions) };
}
