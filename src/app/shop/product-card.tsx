import Link from "next/link";
import { formatMoney } from "@/lib/money";
import type { ShopProduct } from "@/lib/sales/shop";

const PALETTE = ["#c8102e", "#f26b1d", "#b45309", "#15803d", "#0e7490", "#7c3aed"];

/** Product photo, or a coloured tile with the size until photos are uploaded. */
export function ProductImage({ p, className = "" }: { p: ShopProduct; className?: string }) {
  if (p.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.image_url} alt={p.name} className={`aspect-square w-full rounded-xl object-cover ${className}`} loading="lazy" />;
  }
  const color = PALETTE[[...(p.category ?? p.sku)].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <div className={`flex aspect-square w-full flex-col items-center justify-center rounded-xl p-3 text-center text-white ${className}`} style={{ background: color }} aria-hidden>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{p.brand}</span>
      <span className="mt-1 line-clamp-3 text-sm font-bold leading-tight">{p.name.replace(p.size_label, "").trim()}</span>
      {p.size_label && <span className="mt-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">{p.size_label}</span>}
    </div>
  );
}

export function ProductCard({ p, price }: { p: ShopProduct; price?: string }) {
  return (
    <Link href={`/shop/${encodeURIComponent(p.sku)}`} className="group flex flex-col gap-2 rounded-2xl border p-3 transition hover:shadow-md">
      <ProductImage p={p} />
      <div className="flex-1">
        <p className="line-clamp-2 text-sm font-semibold group-hover:text-brand">{p.name}</p>
        <p className="text-xs text-muted-foreground">{p.category}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-bold">{formatMoney(price ?? p.srp)}</span>
        {!p.in_stock ? (
          <span className="text-xs font-medium text-muted-foreground">Out of stock</span>
        ) : p.pre_order ? (
          <span className="text-xs font-medium text-amber-700">Pre-order</span>
        ) : null}
      </div>
    </Link>
  );
}
