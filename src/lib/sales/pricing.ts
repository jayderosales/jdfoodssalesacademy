/**
 * Sales pricing rules (mirrors public.resolve_price and the sales_order_lines trigger in Postgres, which are the
 * source of truth). Used for previews in the order form and shop cart. All money is integer centavos.
 */

export interface PriceListItem {
  minQty: number;
  priceCentavos: bigint;
  validFrom: string; // YYYY-MM-DD
  validTo: string | null;
}

export interface PriceInputs {
  customerPrices: { priceCentavos: bigint; validFrom: string; validTo: string | null }[];
  listCode: string | null;
  listItems: PriceListItem[];
  srpCentavos: bigint | null;
}

const activeOn = (d: string, from: string, to: string | null) => from <= d && (to == null || to >= d);

/** Customer price → price list (highest min qty ≤ qty) → SRP. */
export function resolvePrice(p: PriceInputs, qty: number, date: string): { priceCentavos: bigint; source: string } {
  const cp = p.customerPrices.filter((c) => activeOn(date, c.validFrom, c.validTo)).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
  if (cp) return { priceCentavos: cp.priceCentavos, source: "customer" };
  if (p.listCode) {
    const li = p.listItems
      .filter((i) => i.minQty <= qty && activeOn(date, i.validFrom, i.validTo))
      .sort((a, b) => b.minQty - a.minQty || b.validFrom.localeCompare(a.validFrom))[0];
    if (li) return { priceCentavos: li.priceCentavos, source: p.listCode };
  }
  if (p.srpCentavos == null) throw new Error("This product has no price yet.");
  return { priceCentavos: p.srpCentavos, source: "SRP" };
}

/**
 * Line total = round(qty × unit price × (1 − discount%/100)) to the centavo, half away from zero like Postgres round().
 * qty may have up to 4 decimals; discount up to 2 decimals.
 */
export function lineTotalCentavos(qty: number, unitCentavos: bigint, discountPct = 0): bigint {
  if (qty <= 0) throw new Error("Quantity must be more than zero.");
  if (discountPct < 0 || discountPct > 100) throw new Error("Discount must be 0 to 100%.");
  const q = BigInt(Math.round(qty * 10_000)); // 4 dp
  const keep = BigInt(Math.round((100 - discountPct) * 100)); // basis points of 100%
  const num = q * unitCentavos * keep; // scale 10^4 * 10^4
  const den = 100_000_000n;
  return (num + den / 2n) / den;
}

export interface CartLine {
  sku: string;
  qty: number;
  unitCentavos: bigint;
}

export function cartTotalCentavos(lines: CartLine[]): bigint {
  return lines.reduce((s, l) => s + lineTotalCentavos(l.qty, l.unitCentavos), 0n);
}

/** Merge a quantity into a cart (by SKU), capped at 999 like the shop function. Removes lines that drop to 0. */
export function addToCart<T extends { sku: string; qty: number }>(cart: T[], item: T, maxQty = 999): T[] {
  const i = cart.findIndex((c) => c.sku === item.sku);
  if (i < 0) return item.qty > 0 ? [...cart, { ...item, qty: Math.min(item.qty, maxQty) }] : cart;
  const qty = Math.min(Math.max(0, cart[i].qty + item.qty), maxQty);
  return qty === 0 ? cart.filter((_, j) => j !== i) : cart.map((c, j) => (j === i ? { ...c, qty } : c));
}

/** PH mobile check used by checkout (same pattern as place_shop_order). */
export function normalizePhMobile(input: string): string | null {
  const m = input.replace(/[^0-9+]/g, "");
  return /^(09|\+639)\d{9}$/.test(m) ? m : null;
}
