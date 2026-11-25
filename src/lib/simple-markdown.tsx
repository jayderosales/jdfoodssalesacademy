import * as React from "react";

/**
 * Tiny, safe renderer for short admin-written notices: paragraphs, **bold**, _italic_.
 * Produces React elements (no HTML injection). Rich lesson content uses the Phase 2 editor instead.
 */
export function SimpleMarkdown({ text }: { text: string }) {
  const paragraphs = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {paragraphs.map((p, i) => (
        <p key={i}>{inline(p.replace(/\n/g, " "))}</p>
      ))}
    </div>
  );
}

function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] ? <strong key={m.index}>{m[1]}</strong> : <em key={m.index}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
