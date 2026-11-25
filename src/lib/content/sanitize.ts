/**
 * Cleans Tiptap JSON before it is stored or rendered: only known node/mark types survive, and
 * link / image / video URLs must use safe protocols and hosts. Pure, unit-tested.
 */

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

const NODES = new Set([
  "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote",
  "horizontalRule", "hardBreak", "codeBlock", "image", "youtube",
]);
const MARKS = new Set(["bold", "italic", "strike", "underline", "code", "link"]);

export function isSafeHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  return /^(https?:|mailto:|tel:)/i.test(href.trim());
}

/** Images must be https (uploaded images are served from Supabase Storage over https). */
export function isSafeImageSrc(src: unknown): src is string {
  if (typeof src !== "string") return false;
  try {
    return new URL(src).protocol === "https:";
  } catch {
    return false;
  }
}

export function isSafeVideoSrc(src: unknown): src is string {
  if (typeof src !== "string") return false;
  try {
    const u = new URL(src);
    const host = u.hostname.replace(/^www\./, "");
    return u.protocol === "https:" && ["youtube.com", "youtube-nocookie.com", "youtu.be", "m.youtube.com"].includes(host);
  } catch {
    return false;
  }
}

export function sanitizeDoc(node: TiptapNode): TiptapNode | null {
  if (!node || typeof node !== "object" || !NODES.has(node.type)) return null;

  if (node.type === "image" && !isSafeImageSrc(node.attrs?.src)) return null;
  if (node.type === "youtube" && !isSafeVideoSrc(node.attrs?.src)) return null;

  const out: TiptapNode = { type: node.type };
  if (node.attrs) {
    const a: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node.attrs)) {
      if (k.toLowerCase().startsWith("on")) continue; // never keep event-handler-like attrs
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) a[k] = v;
    }
    out.attrs = a;
  }
  if (typeof node.text === "string") out.text = node.text;
  if (node.marks) {
    out.marks = node.marks
      .filter((m) => MARKS.has(m.type))
      .filter((m) => m.type !== "link" || isSafeHref(m.attrs?.href))
      .map((m) => (m.type === "link" ? { type: "link", attrs: { href: m.attrs!.href } } : { type: m.type }));
  }
  if (Array.isArray(node.content)) {
    out.content = node.content.map(sanitizeDoc).filter((n): n is TiptapNode => n !== null);
  }
  return out;
}
