import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { getCatalog, getShopPrices } from "@/lib/sales/shop";
import { AddToCart } from "../cart";
import { ProductCard, ProductImage } from "../product-card";

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const p = (await getCatalog()).find((x) => x.sku === decodeURIComponent(sku).toUpperCase());
  return { title: p?.name ?? "Product" };
}

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const all = await getCatalog();
  const p = all.find((x) => x.sku === decodeURIComponent(sku).toUpperCase());
  if (!p) notFound();
  const related = all.filter((x) => x.id !== p.id && x.category === p.category && x.in_stock).slice(0, 4);
  const prices = await getShopPrices([p.id, ...related.map((r) => r.id)]);
  const price = prices.get(p.id) ?? p.srp;

  return (
    <div className="space-y-10">
      <nav className="text-sm text-muted-foreground">
        <Link href="/shop" className="underline">Products</Link> / {p.brand} / {p.category}
      </nav>
      <div className="grid gap-6 md:grid-cols-2">
        <ProductImage p={p} className="max-w-md" />
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">{p.brand}</p>
            <h1 className="text-2xl font-bold">{p.name}</h1>
            <p className="text-sm text-muted-foreground">SKU {p.sku}{p.size_label ? ` · ${p.size_label}` : ""}</p>
          </div>
          <p className="text-3xl font-bold">{formatMoney(price)}</p>
          {price !== p.srp && <p className="text-sm text-green-700">Your price (SRP {formatMoney(p.srp)})</p>}
          {p.pre_order && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pre-order item: we&apos;ll confirm the lead time after you order.</p>}
          {p.description && <p className="whitespace-pre-line text-sm">{p.description}</p>}
          <AddToCart item={{ sku: p.sku, name: p.name, price, size: p.size_label }} disabled={!p.in_stock} />
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Order a single piece, no minimum.</li>
            <li>• Pay by bank transfer, GCash or Maya.</li>
            <li>• You book and pay the courier; we pack it and hand it over.</li>
          </ul>
        </div>
      </div>
      {related.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">More {p.category}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {related.map((r) => <ProductCard key={r.id} p={r} price={prices.get(r.id)} />)}
          </div>
        </section>
      )}
    </div>
  );
}
