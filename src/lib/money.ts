/**
 * Money helpers. Amounts travel as decimal STRINGS ("1234.50") between the browser, server and Postgres numeric
 * columns, so no floating-point rounding ever touches them. Arithmetic on money belongs in SQL or uses centavos.
 */

const MAX = 10_000_000_000; // ₱10 billion, generous upper bound for input sanity

/** "₱1,234.5" / "1234.50" / " 1 234 " → "1234.50"; null if not a valid non-negative amount with ≤ 2 decimals. */
export function parseMoney(input: string | null | undefined): string | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[₱,\s]/g, "").replace(/^PHP/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const normalized = `${BigInt(whole).toString()}.${frac.padEnd(2, "0")}`;
  if (Number(normalized) > MAX) return null;
  return normalized;
}

/** Decimal string → integer centavos (exact). */
export function toCentavos(amount: string): bigint {
  const parsed = parseMoney(amount);
  if (parsed == null) throw new Error(`Not a money amount: ${amount}`);
  const [w, f] = parsed.split(".");
  return BigInt(w) * 100n + BigInt(f);
}

/** Integer centavos → "1234.50". */
export function fromCentavos(c: bigint): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/** "1234.5" | 1234.5 → "₱1,234.50" (display only). */
export function formatMoney(amount: string | number | null | undefined): string {
  if (amount == null || amount === "") return "—";
  const s = typeof amount === "number" ? amount.toFixed(2) : (parseMoney(amount) ?? String(amount));
  const [w, f = "00"] = s.replace("-", "").split(".");
  return `${s.startsWith("-") ? "-" : ""}₱${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f.padEnd(2, "0").slice(0, 2)}`;
}
