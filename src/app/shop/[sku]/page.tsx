import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { familyKey, familyRank, groupFamilies } from "@/lib/sales/families";
import { getCatalog, getShopPrices } from "@/lib/sales/shop";
import { AddToCart } from "../cart";
import { FamilyCard, ProductImage } from "../product-card";

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const p = (await getCatalog()).find((x) => x.sku === decodeURIComponent(sku).toUpperCase());
  return { title: p?.name ?? "Product" };
}

/** One flavour with a size picker. Each size is its own SKU (own price, stock and cart line). */
export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const all = await getCatalog();
  const p = all.find((x) => x.sku === decodeURIComponent(sku).toUpperCase());
  if (!p) notFound();
  const key = familyKey(p);
  const families = groupFamilies(all.filter((x) => x.category === p.category));
  const fam = families.find((f) => f.key === key)!;
  const related = families.filter((f) => f.key !== key && f.inStock).sort((a, b) => familyRank(a) - familyRank(b)).slice(0, 4);
  const prices = await getShopPrices([...fam.variants, ...related.flatMap((f) => f.variants)].map((v) => v.id));
  const price = prices.get(p.id) ?? p.srp;

  return (
    <div className="space-y-10">
      <nav className="text-sm text-muted-foreground">
        <Link href="/shop" className="underline">Products</Link> / {p.brand} / {p.category}
      </nav>
      <div className="grid gap-6 md:grid-cols-2">
        <ProductImage name={fam.name} brand={p.brand} category={p.category} size={p.size_label} image={p.image_url || fam.image} className="max-w-md" />
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">{p.brand}</p>
            <h1 className="text-2xl font-bold">{fam.name}</h1>
            <p className="text-sm text-muted-foreground">SKU {p.sku}{p.size_label ? ` · ${p.size_label}` : ""}</p>
          </div>

          {fam.variants.length > 1 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Size</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Choose a size">
                {fam.variants.map((v) => {
                  const selected = v.id === p.id;
                  return (
                    <Link
                      key={v.id}
                      href={`/shop/${encodeURIComponent(v.sku)}`}
                      scroll={false}
                      role="radio"
                      aria-checked={selected}
                      className={`rounded-xl border px-3 py-2 text-sm ${selected ? "border-brand bg-brand/5 font-semibold ring-1 ring-brand" : "hover:border-brand"} ${v.in_stock ? "" : "text-muted-foreground"}`}
                    >
                      <span className="block">{v.size_label || v.sku}</span>
                      <span className="block text-xs">{formatMoney(prices.get(v.id) ?? v.srp)}{v.in_stock ? "" : " · out of stock"}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-3xl font-bold">{formatMoney(price)}</p>
          {price !== p.srp && <p className="text-sm text-green-700">Your price (SRP {formatMoney(p.srp)})</p>}
          {p.pre_order && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pre-order item: we&apos;ll confirm the lead time after you order.</p>}
          {p.description && <p className="whitespace-pre-line text-sm">{p.description}</p>}
          <AddToCart key={p.sku} item={{ sku: p.sku, name: p.name, price, size: p.size_label }} disabled={!p.in_stock} />
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
            {related.map((f) => <FamilyCard key={f.key} f={f} prices={prices} />)}
          </div>
        </section>
      )}
    </div>
  );
}
