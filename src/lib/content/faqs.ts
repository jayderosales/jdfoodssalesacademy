/** "Q: …\nA: …" blocks separated by blank lines → [{q, a}] */
export function parseFaqs(raw: string): { q: string; a: string }[] {
  return raw
    .split(/\n\s*\n/)
    .map((block) => {
      const q = block.match(/^\s*Q:\s*([\s\S]*?)(?=\n\s*A:|$)/i)?.[1]?.trim() ?? "";
      const a = block.match(/\n\s*A:\s*([\s\S]*)$/i)?.[1]?.trim() ?? "";
      return { q, a };
    })
    .filter((f) => f.q);
}
