/**
 * Which orders on the fulfilment board are incomplete: items (or bundle components) not yet reserved in full,
 * usually pre-order products waiting for production or stock that ran out. Pure function; quantities in base units.
 */

export interface ShortLineInput {
  lineId: string;
  productId: string;
  qty: number;
  itemType: string; // finished_good, bundle, service…
}
export interface Allocation {
  lineId: string;
  productId: string;
  qty: number;
}
export interface Shortage {
  productId: string;
  needed: number;
  reserved: number;
  short: number;
}

/** Shortages for one order. Bundles are checked per component; services never need stock. */
export function orderShortages(lines: ShortLineInput[], allocations: Allocation[], components: Map<string, { componentId: string; qty: number }[]>): Shortage[] {
  const need = new Map<string, { lineId: string; productId: string; needed: number }>();
  for (const l of lines) {
    if (l.itemType === "service") continue;
    const parts = l.itemType === "bundle" ? (components.get(l.productId) ?? []).map((c) => ({ productId: c.componentId, qty: l.qty * c.qty })) : [{ productId: l.productId, qty: l.qty }];
    for (const p of parts) {
      const key = `${l.lineId}|${p.productId}`;
      need.set(key, { lineId: l.lineId, productId: p.productId, needed: (need.get(key)?.needed ?? 0) + p.qty });
    }
  }
  const got = new Map<string, number>();
  for (const a of allocations) got.set(`${a.lineId}|${a.productId}`, (got.get(`${a.lineId}|${a.productId}`) ?? 0) + a.qty);
  const byProduct = new Map<string, Shortage>();
  for (const [key, n] of need) {
    const reserved = got.get(key) ?? 0;
    const short = round(n.needed - reserved);
    if (short <= 0) continue;
    const e = byProduct.get(n.productId) ?? { productId: n.productId, needed: 0, reserved: 0, short: 0 };
    e.needed = round(e.needed + n.needed);
    e.reserved = round(e.reserved + reserved);
    e.short = round(e.short + short);
    byProduct.set(n.productId, e);
  }
  return [...byProduct.values()];
}

/** Totals across orders: how much of each product the incomplete orders still need. */
export function totalShort(perOrder: Shortage[][]): Map<string, number> {
  const t = new Map<string, number>();
  for (const list of perOrder) for (const s of list) t.set(s.productId, round((t.get(s.productId) ?? 0) + s.short));
  return t;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
