/**
 * Receivables / payables aging. Open items (invoices, opening balances) are reduced by payments linked to them,
 * then unapplied payments (on account) settle the oldest items first. Money is integer centavos.
 */

export interface OpenItem {
  key: string; // invoice id or "opening"
  party: string; // customer or supplier id
  label: string;
  date: string; // YYYY-MM-DD issued
  due: string; // YYYY-MM-DD due (= date when cash)
  amount: bigint;
  paid: bigint; // payments linked to this item
}

export interface Unapplied {
  party: string;
  amount: bigint;
}

export const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type Bucket = (typeof BUCKETS)[number];

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function bucketFor(due: string, asOf: string): Bucket {
  const late = daysBetween(due, asOf);
  if (late <= 0) return "current";
  if (late <= 30) return "1-30";
  if (late <= 60) return "31-60";
  if (late <= 90) return "61-90";
  return "90+";
}

export interface PartyAging {
  party: string;
  buckets: Record<Bucket, bigint>;
  total: bigint;
  credit: bigint; // unapplied money left after settling everything (customer deposit / supplier advance)
  items: (OpenItem & { open: bigint; bucket: Bucket; daysLate: number })[];
}

export function ageItems(items: OpenItem[], unapplied: Unapplied[], asOf: string): PartyAging[] {
  const byParty = new Map<string, PartyAging>();
  const get = (party: string) => {
    let p = byParty.get(party);
    if (!p) {
      p = { party, buckets: { current: 0n, "1-30": 0n, "31-60": 0n, "61-90": 0n, "90+": 0n }, total: 0n, credit: 0n, items: [] };
      byParty.set(party, p);
    }
    return p;
  };
  // overpayment on an item becomes on-account money for that party
  const extra = new Map<string, bigint>();
  for (const u of unapplied) extra.set(u.party, (extra.get(u.party) ?? 0n) + u.amount);
  const open = items
    .map((i) => {
      const o = i.amount - i.paid;
      if (o < 0n) extra.set(i.party, (extra.get(i.party) ?? 0n) - o);
      return { ...i, open: o > 0n ? o : 0n };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.date.localeCompare(b.date));
  for (const i of open) {
    let left = extra.get(i.party) ?? 0n;
    if (left > 0n && i.open > 0n) {
      const use = left < i.open ? left : i.open;
      i.open -= use;
      left -= use;
      extra.set(i.party, left);
    }
    const p = get(i.party);
    if (i.open > 0n) {
      const b = bucketFor(i.due, asOf);
      p.buckets[b] += i.open;
      p.total += i.open;
      p.items.push({ ...i, bucket: b, daysLate: Math.max(0, daysBetween(i.due, asOf)) });
    }
  }
  for (const [party, left] of extra) if (left > 0n) get(party).credit += left;
  return [...byParty.values()].filter((p) => p.total > 0n || p.credit > 0n).sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
}

export function totals(rows: PartyAging[]): { buckets: Record<Bucket, bigint>; total: bigint; credit: bigint } {
  const t = { buckets: { current: 0n, "1-30": 0n, "31-60": 0n, "61-90": 0n, "90+": 0n } as Record<Bucket, bigint>, total: 0n, credit: 0n };
  for (const r of rows) {
    for (const b of BUCKETS) t.buckets[b] += r.buckets[b];
    t.total += r.total;
    t.credit += r.credit;
  }
  return t;
}
