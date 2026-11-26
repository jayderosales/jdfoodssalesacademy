import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { onShelf, priceRange, type Family } from "@/lib/sales/families";
import type { ShopProduct } from "@/lib/sales/shop";

const PALETTE = ["#c8102e", "#f26b1d", "#b45309", "#15803d", "#0e7490", "#7c3aed"];

/** Product photo, or a coloured tile with the name until a photo is added. */
export function ProductImage({ name, brand, category, size, image, className = "" }: { name: string; brand: string | null; category: string | null; size?: string; image: string; className?: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name} className={`aspect-square w-full rounded-xl bg-white object-contain ${className}`} loading="lazy" />;
  }
  const color = PALETTE[[...(category ?? name)].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <div className={`flex aspect-square w-full flex-col items-center justify-center rounded-xl p-3 text-center text-white ${className}`} style={{ background: color }} aria-hidden>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{brand}</span>
      <span className="mt-1 line-clamp-3 text-sm font-bold leading-tight">{name}</span>
      {size && <span className="mt-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">{size}</span>}
    </div>
  );
}

/** One card per flavour: price range and number of sizes; opens the product page with a size picker. */
export function FamilyCard({ f, prices }: { f: Family<ShopProduct>; prices?: Map<string, string> }) {
  const shown = f.variants.map((v) => prices?.get(v.id) ?? v.srp);
  const { min, max } = priceRange(shown);
  const first = f.variants.find(onShelf) ?? f.variants.find((v) => v.in_stock) ?? f.variants[0];
  const sizes = f.variants.length;
  return (
    <Link href={`/shop/${encodeURIComponent(first.sku)}`} className="group flex flex-col gap-2 rounded-2xl border p-3 transition hover:shadow-md">
      <ProductImage name={f.name} brand={f.brand} category={f.category} size={sizes === 1 ? first.size_label : undefined} image={f.image} />
      <div className="flex-1">
        <p className="line-clamp-2 text-sm font-semibold group-hover:text-brand">{f.name}</p>
        <p className="text-xs text-muted-foreground">{sizes > 1 ? `${sizes} sizes: ${f.variants.map((v) => v.size_label).filter(Boolean).join(", ")}` : first.size_label || f.category}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">{min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`}</span>
        {!f.inStock ? (
          <span className="text-xs font-medium text-muted-foreground">Out of stock</span>
        ) : f.variants.every((v) => v.pre_order) ? (
          <span className="text-xs font-medium text-amber-700">Pre-order</span>
        ) : null}
      </div>
    </Link>
  );
}
