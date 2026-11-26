import Link from "next/link";
import { familyRank, groupFamilies } from "@/lib/sales/families";
import { getCatalog, getShopPrices, slugify } from "@/lib/sales/shop";
import { FamilyCard } from "./product-card";

export const metadata = { title: "Products" };

const PAGE = 48;

/**
 * Public catalog: one card per flavour (all its sizes together), search, filter by brand and category.
 * Guests see SRP; signed-in customers see their prices.
 */
export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const brand = sp.brand ?? "";
  const cat = sp.cat ?? "";
  const stockOnly = sp.stock === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const all = await getCatalog();

  const brands = [...new Set(all.map((p) => p.brand).filter(Boolean))] as string[];
  const inBrand = brand ? all.filter((p) => p.brand && slugify(p.brand) === brand) : all;
  const cats = [...new Set(inBrand.map((p) => p.category).filter(Boolean))] as string[];
  const families = groupFamilies(inBrand.filter((p) => !cat || (p.category && slugify(p.category) === cat)))
    .filter((f) => !stockOnly || f.inStock)
    .filter((f) => !q || `${f.name} ${f.category ?? ""} ${f.brand ?? ""} ${f.variants.map((v) => v.sku).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => familyRank(a) - familyRank(b) || a.name.localeCompare(b.name));
  const shown = families.slice((page - 1) * PAGE, page * PAGE);
  const prices = await getShopPrices(shown.flatMap((f) => f.variants.map((v) => v.id)));

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(brand && { brand }), ...(cat && { cat }), ...(stockOnly && { stock: "1" }), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `/shop?${s}` : "/shop";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">{families.length} products · choose the size on each product · no minimum order</p>
        </div>
        <form action="/shop" className="flex w-full gap-2 sm:w-auto">
          {brand && <input type="hidden" name="brand" value={brand} />}
          <input name="q" defaultValue={q} placeholder="Search sauces, powders, syrups…" className="h-10 flex-1 rounded-lg border px-3 sm:w-72" aria-label="Search products" />
          <button className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">Search</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={href({ brand: "", cat: "", page: "" })} className={`rounded-full border px-3 py-1 ${!brand ? "border-brand bg-brand text-white" : "hover:bg-muted"}`}>All brands</Link>
        {brands.map((b) => (
          <Link key={b} href={href({ brand: slugify(b), cat: "", page: "" })} className={`rounded-full border px-3 py-1 ${brand === slugify(b) ? "border-brand bg-brand text-white" : "hover:bg-muted"}`}>{b}</Link>
        ))}
        <Link href={href({ stock: stockOnly ? "" : "1", page: "" })} className={`rounded-full border px-3 py-1 ${stockOnly ? "border-green-700 bg-green-700 text-white" : "hover:bg-muted"}`}>In stock only</Link>
      </div>
      {cats.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
          <Link href={href({ cat: "", page: "" })} className={`whitespace-nowrap rounded-full px-3 py-1 ${!cat ? "bg-foreground text-background" : "bg-muted"}`}>All</Link>
          {cats.map((c) => (
            <Link key={c} href={href({ cat: slugify(c), page: "" })} className={`whitespace-nowrap rounded-full px-3 py-1 ${cat === slugify(c) ? "bg-foreground text-background" : "bg-muted"}`}>{c}</Link>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No products match. Try another search.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((f) => <FamilyCard key={f.key} f={f} prices={prices} />)}
        </div>
      )}

      {families.length > PAGE && (
        <div className="flex justify-center gap-2 text-sm">
          {page > 1 && <Link href={href({ page: String(page - 1) })} className="rounded-lg border px-3 py-2">← Previous</Link>}
          <span className="px-3 py-2 text-muted-foreground">Page {page} of {Math.ceil(families.length / PAGE)}</span>
          {page * PAGE < families.length && <Link href={href({ page: String(page + 1) })} className="rounded-lg border px-3 py-2">Next →</Link>}
        </div>
      )}
    </div>
  );
}
