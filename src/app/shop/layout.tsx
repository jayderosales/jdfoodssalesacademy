import Link from "next/link";
import { Logo } from "@/components/logo";
import { getSettings } from "@/lib/auth";
import { CartLink } from "./cart";
import { ShopFooter } from "./footer";

export const metadata = { title: { default: "Shop", template: "%s · JD Foods Shop" } };

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings().catch(() => null);
  const name = s?.company_name ?? "JD Foods";
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Logo size={32} />
            <span>{name}</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/shop" className="rounded-lg px-3 py-2 font-medium hover:bg-muted">Products</Link>
            <Link href="/shop/track" className="rounded-lg px-3 py-2 font-medium hover:bg-muted">Track order</Link>
            <CartLink />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <ShopFooter name={name} />
    </div>
  );
}
