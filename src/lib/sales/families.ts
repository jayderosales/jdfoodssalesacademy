/**
 * Shop "families": every size of one flavour shown as one product (e.g. Premium Sweet Barbecue in 350 ml, 500 ml,
 * 1 liter and 1 gallon). Each size stays its own SKU with its own price and stock; this only groups them for display.
 */

export interface FamilyMember {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  size_label: string;
  srp: string;
  image_url: string;
  item_type: string;
  pre_order: boolean;
  in_stock: boolean;
}

export interface Family<T extends FamilyMember = FamilyMember> {
  key: string;
  name: string;
  brand: string | null;
  category: string | null;
  /** sizes, cheapest (smallest) first */
  variants: T[];
  image: string;
  inStock: boolean;
}

/** Product name without its size: "Premium Sweet Barbecue 1 gallon" → "Premium Sweet Barbecue". */
export function familyName(p: Pick<FamilyMember, "name" | "size_label">): string {
  let n = p.name.trim();
  const size = p.size_label.trim();
  if (size && n.toLowerCase().endsWith(size.toLowerCase())) n = n.slice(0, -size.length).trim();
  return n.replace(/\s+(box of|-)$/i, "").trim() || p.name;
}

export function familyKey(p: Pick<FamilyMember, "name" | "size_label" | "brand" | "category">): string {
  return [p.brand ?? "", p.category ?? "", familyName(p)].join("|").toLowerCase();
}

/** On the shelf now (not a service or pre-order that is always "available"). */
export const onShelf = (p: Pick<FamilyMember, "in_stock" | "item_type" | "pre_order">) => p.in_stock && p.item_type !== "service" && !p.pre_order;

export function groupFamilies<T extends FamilyMember>(products: T[]): Family<T>[] {
  const map = new Map<string, Family<T>>();
  for (const p of products) {
    const key = familyKey(p);
    let f = map.get(key);
    if (!f) {
      f = { key, name: familyName(p), brand: p.brand, category: p.category, variants: [], image: "", inStock: false };
      map.set(key, f);
    }
    f.variants.push(p);
  }
  for (const f of map.values()) {
    f.variants.sort((a, b) => Number(a.srp) - Number(b.srp) || a.sku.localeCompare(b.sku));
    f.image = f.variants.find((v) => v.image_url)?.image_url ?? "";
    f.inStock = f.variants.some((v) => v.in_stock);
  }
  return [...map.values()];
}

/** Shelf items first, then services / pre-order, then out of stock; then by name. */
export function familyRank(f: Family): number {
  if (f.variants.some(onShelf)) return 0;
  return f.inStock ? 1 : 2;
}

/** "₱99" or "₱99 – ₱850" from a list of decimal-string prices. */
export function priceRange(prices: string[]): { min: string; max: string } {
  const sorted = prices.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return { min: (sorted[0] ?? 0).toFixed(2), max: (sorted[sorted.length - 1] ?? 0).toFixed(2) };
}
