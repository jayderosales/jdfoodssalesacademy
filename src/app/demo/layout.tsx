import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav, SideNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import type { NavItem } from "@/lib/nav";

export const metadata = { title: { default: "Preview", template: "%s · Preview · JD Foods Sales Academy" } };

// Sample-data preview. Only available on the local dev server (or if ENABLE_DEMO=1 is set on purpose).
const enabled = process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO === "1";

const repNav: NavItem[] = [
  { href: "/demo/rep", label: "Home", icon: "home", mobile: true },
  { href: "/demo/learn", label: "Learn", icon: "book", mobile: true },
  { href: "/demo/quiz", label: "Quizzes", icon: "quiz" },
  { href: "/demo/roleplay", label: "Roleplay", icon: "chat", mobile: true },
];
const staffNav: NavItem[] = [
  { href: "/demo/manager", label: "Manager view", icon: "team", mobile: true },
  { href: "/demo/owner", label: "Owner view", icon: "content", mobile: true },
];

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!enabled) notFound();
  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card p-4 md:sticky md:top-0 md:flex md:h-dvh">
        <Link href="/demo/rep" className="mb-6 flex items-center gap-2">
          <Logo size={36} />
          <span className="font-bold leading-tight">
            JD Foods
            <span className="block text-xs font-normal text-muted-foreground">Sales Academy</span>
          </span>
        </Link>
        <p className="mb-1 px-3 text-xs font-semibold uppercase text-muted-foreground">Salesperson</p>
        <SideNav items={repNav} />
        <p className="mb-1 mt-5 px-3 text-xs font-semibold uppercase text-muted-foreground">Staff</p>
        <SideNav items={staffNav} />
        <div className="mt-auto border-t pt-4 text-xs text-muted-foreground">Sample-data preview. Not connected to a database.</div>
      </aside>

      <div className="flex-1">
        <div role="note" className="bg-brand-3/40 px-4 py-1.5 text-center text-xs font-medium">
          Preview with sample data. Buttons that save are disabled. <Link href="/login" className="underline">Real app</Link>
        </div>
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card/95 px-4 py-2 backdrop-blur md:hidden">
          <Logo size={28} />
          <span className="text-sm font-bold">Sales Academy</span>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      <BottomNav items={[...repNav, ...staffNav]} />
    </div>
  );
}
