import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getAuthState } from "@/lib/auth";
import { BRAND_BLURBS, getCatalog, slugify } from "@/lib/sales/shop";
import { CartLink } from "./shop/cart";
import { ShopFooter } from "./shop/footer";
import { ProductCard } from "./shop/product-card";

export const metadata = {
  title: "JD Foods: sauces, powders and café supplies",
  description: "Order JD Foods, ThyChef and Arkadia products online. No minimum order. Pay by bank transfer, GCash or Maya.",
};

/** Public landing page. Signed-in staff go straight to their dashboard. */
export default async function Home() {
  const { signedIn } = await getAuthState();
  if (signedIn) redirect("/dashboard");

  const all = await getCatalog();
  const featured = all.filter((p) => p.in_stock && !p.pre_order).slice(0, 8);
  const fallback = featured.length ? featured : all.slice(0, 8);
  const brands = Object.keys(BRAND_BLURBS).filter((b) => all.some((p) => p.brand === b));
  const count = all.length;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold"><Logo size={32} /><span>JD Foods</span></Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/shop" className="rounded-lg px-3 py-2 font-medium hover:bg-muted">Shop</Link>
            <Link href="/shop/track" className="hidden rounded-lg px-3 py-2 font-medium hover:bg-muted sm:inline">Track order</Link>
            <CartLink />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))" }}>
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 text-white md:grid-cols-2 md:py-20">
            <div className="space-y-5">
              <p className="inline-block rounded-full bg-white/15 px-3 py-1 text-sm font-medium">Food business supplies · Plaridel, Bulacan</p>
              <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">Sauces, powders and café supplies that keep customers coming back.</h1>
              <p className="text-lg text-white/90">{count > 0 ? `${count} products` : "Our full range"} from JD Foods, ThyChef, Arkadia and more. Order a single piece or a full box, with no minimum.</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/shop" className="rounded-xl bg-white px-5 py-3 font-bold text-brand shadow hover:bg-white/90">Shop now</Link>
                <Link href="/shop/track" className="rounded-xl border border-white/60 px-5 py-3 font-semibold hover:bg-white/10">Track an order</Link>
              </div>
            </div>
            <div className="hidden grid-cols-2 gap-3 md:grid" aria-hidden>
              {["Premium Sauces", "Flavored Powders", "Frappe Powders", "Premium Syrups"].map((c, i) => (
                <div key={c} className={`flex items-end rounded-2xl bg-white/15 p-4 text-lg font-bold backdrop-blur ${i % 2 ? "translate-y-6" : ""}`} style={{ minHeight: 140 }}>{c}</div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="mb-6 text-2xl font-bold">How ordering works</h2>
          <ol className="grid gap-4 md:grid-cols-4">
            {[
              ["1", "Add to cart", "Browse the catalog and pick what you need, even just one piece."],
              ["2", "Place your order", "Enter your name, mobile and address. No account needed."],
              ["3", "Pay", "Bank transfer, GCash or Maya, then send your reference number on the order page."],
              ["4", "We pack, you book the courier", "Once payment is confirmed we pack your order and hand it to the courier you book. You pay the courier directly."],
            ].map(([n, t, d]) => (
              <li key={n} className="rounded-2xl border p-4">
                <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand font-bold text-white">{n}</span>
                <p className="font-semibold">{t}</p>
                <p className="text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {fallback.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-12">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="text-2xl font-bold">Popular picks</h2>
              <Link href="/shop" className="text-sm font-semibold text-brand underline">See all products</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {fallback.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </section>
        )}

        {brands.length > 0 && (
          <section className="bg-muted/40">
            <div className="mx-auto max-w-6xl px-4 py-12">
              <h2 className="mb-6 text-2xl font-bold">Our brands</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {brands.map((b) => (
                  <Link key={b} href={`/shop?brand=${slugify(b)}`} className="rounded-2xl border bg-white p-5 transition hover:shadow-md">
                    <p className="text-lg font-bold">{b}</p>
                    <p className="text-sm text-muted-foreground">{BRAND_BLURBS[b]}</p>
                    <p className="mt-3 text-sm font-semibold text-brand">{all.filter((p) => p.brand === b).length} products →</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="grid gap-4 rounded-3xl border p-6 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-2xl font-bold">Starting or growing a food business?</h2>
              <p className="text-muted-foreground">Distributors, resellers and corporate accounts get their own price lists. Create an account to see your prices when you shop.</p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link href="/register" className="rounded-xl bg-brand px-5 py-3 font-bold text-white">Create a business account</Link>
              <Link href="/shop" className="rounded-xl border px-5 py-3 font-semibold">Browse first</Link>
            </div>
          </div>
        </section>
      </main>
      <ShopFooter name="JD Foods" />
    </div>
  );
}
