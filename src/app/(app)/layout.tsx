import Link from "next/link";
import { BottomNav, SideNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { getSettings, requireUser } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/types";

const ACTIVITY_THROTTLE_MS = 10 * 60 * 1000;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  const settings = await getSettings();
  const items = navFor(profile.role);

  // "last active" feeds the at-risk flag; update at most every 10 minutes.
  if (!profile.last_active_at || Date.now() - new Date(profile.last_active_at).getTime() > ACTIVITY_THROTTLE_MS) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", profile.id);
  }

  const logoUrl = settings?.logo_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/${settings.logo_path}`
    : null;

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card p-4 md:sticky md:top-0 md:flex md:h-dvh">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2">
          <Logo size={36} src={logoUrl} />
          <span className="font-bold leading-tight">
            {settings?.company_name ?? "JD Foods"}
            <span className="block text-xs font-normal text-muted-foreground">Sales Academy</span>
          </span>
        </Link>
        <SideNav items={items} />
        <div className="mt-auto border-t pt-4 text-sm">
          <p className="truncate font-medium">{profile.full_name || profile.email}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[profile.role]}</p>
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="text-xs text-muted-foreground underline">Sign out</button>
          </form>
        </div>
      </aside>

      {/* Phone header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/95 px-4 py-2 backdrop-blur md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo size={28} src={logoUrl} />
          <span className="text-sm font-bold">Sales Academy</span>
        </Link>
        <span className="text-xs text-muted-foreground">{ROLE_LABEL[profile.role]}</span>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8">
        {children}
      </main>

      <BottomNav items={items} />
    </div>
  );
}
