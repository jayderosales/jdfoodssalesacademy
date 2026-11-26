/**
 * Fuzzy matching of what's written on a paper document to records in the system (products, suppliers, customers,
 * locations, PO lines). Pure functions; the person reviewing confirms or changes every match.
 */

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\b(inc|corp|corporation|co|ltd|company|enterprises?|trading|the)\b\.?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (s: string) => new Set(normalize(s).split(" ").filter((t) => t.length > 1 || /\d/.test(t)));

/** 0..1 similarity between two names (token overlap, with a bonus when one contains the other). */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const dice = (2 * common) / (ta.size + tb.size);
  const contains = na.includes(nb) || nb.includes(na) ? 0.15 : 0;
  return Math.min(1, dice + contains);
}

export const digits = (s: string) => s.replace(/\D/g, "");

export interface Candidate {
  id: string;
  name: string;
  code?: string; // SKU / supplier code / order number
  alt?: string[]; // barcodes, other names
  tin?: string;
}

export interface Match<C extends Candidate = Candidate> {
  candidate: C | null;
  score: number; // 0..1
  how: "code" | "tin" | "name" | "none";
}

/**
 * Best candidate for something read from a document. An exact code/barcode or TIN wins; otherwise the closest name
 * above `min` (default 0.5). Below that there's no match and the person picks one.
 */
export function bestMatch<C extends Candidate>(read: { code?: string; name?: string; tin?: string }, candidates: C[], min = 0.5): Match<C> {
  const code = (read.code ?? "").trim().toUpperCase();
  if (code) {
    const c = candidates.find((x) => x.code?.toUpperCase() === code || x.alt?.some((a) => a.toUpperCase() === code));
    if (c) return { candidate: c, score: 1, how: "code" };
  }
  const tin = digits(read.tin ?? "");
  if (tin.length >= 9) {
    const c = candidates.find((x) => x.tin && digits(x.tin).slice(0, 9) === tin.slice(0, 9));
    if (c) return { candidate: c, score: 1, how: "tin" };
  }
  const name = read.name ?? "";
  let best: C | null = null;
  let score = 0;
  for (const c of candidates) {
    const sc = Math.max(similarity(name, c.name), ...(c.alt ?? []).map((a) => similarity(name, a)), c.code ? similarity(name, c.code) : 0);
    if (sc > score) {
      score = sc;
      best = c;
    }
  }
  return score >= min && best ? { candidate: best, score, how: "name" } : { candidate: null, score, how: "none" };
}

/** "12,500.00" / "₱ 1 250" / "1250" → "12500.00"; anything else → "". */
export function cleanAmount(s: string | undefined | null): string {
  const v = String(s ?? "").replace(/[₱,\s]|PHP/gi, "");
  if (!/^\d+(\.\d+)?$/.test(v)) return "";
  const [w, f = ""] = v.split(".");
  return `${BigInt(w).toString()}.${(f + "00").slice(0, 2)}`;
}

/** "24" / "24.5" / "1,200" → number string; else "". */
export function cleanQty(s: string | undefined | null): string {
  const v = String(s ?? "").replace(/[,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(v) && Number(v) > 0 ? String(Number(v)) : "";
}

/** YYYY-MM-DD that is a real date, else "". Also accepts MM/DD/YYYY. */
export function cleanDate(s: string | undefined | null): string {
  let v = String(s ?? "").trim();
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) v = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? "" : v;
}
