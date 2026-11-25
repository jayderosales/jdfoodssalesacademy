import Link from "next/link";
import { BottomNav, ModuleTabs, SideNavSections } from "@/components/app-nav";
import { CommandPalette } from "@/components/command-palette";
import { IdleTimeout } from "@/components/idle-timeout";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notification-bell";
import { getAccess, getSettings, requireUser } from "@/lib/auth";
import { buildNav, paletteItems, trainingTabs } from "@/lib/nav";
import { getMyRoleNames } from "@/lib/rbac/queries";
import { createClient, serviceKeyMissing } from "@/lib/supabase/server";

const ACTIVITY_THROTTLE_MS = 10 * 60 * 1000;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  const [settings, access, roleNames] = await Promise.all([getSettings(), getAccess(), getMyRoleNames(profile.id)]);
  const { sections, mobile } = buildNav(access.permissions, profile.role);
  const roleLabel = roleNames.join(", ") || "No role";

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
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card p-4 md:sticky md:top-0 md:flex md:h-dvh print:!hidden">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2">
          <Logo size={36} src={logoUrl} />
          <span className="font-bold leading-tight">
            {settings?.company_name ?? "JD Foods"}
            <span className="block text-xs font-normal text-muted-foreground">JD Foods OS</span>
          </span>
        </Link>
        <SideNavSections sections={sections} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-card/95 px-4 py-2 backdrop-blur print:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            <Logo size={28} src={logoUrl} />
            <span className="text-sm font-bold">JD Foods OS</span>
          </Link>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <CommandPalette items={paletteItems(access.permissions, profile.role)} />
            <NotificationBell userId={profile.id} />
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white" aria-hidden>
                  {(profile.full_name || profile.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-40 truncate lg:inline">{profile.full_name || profile.email}</span>
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border bg-card p-3 shadow-lg">
                <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
                <p className="mb-3 text-xs text-muted-foreground">{roleLabel}</p>
                <Link href="/account" className="block rounded px-2 py-1.5 text-sm hover:bg-muted">My account</Link>
                <form action="/auth/signout" method="post">
                  <button className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">Sign out</button>
                </form>
              </div>
            </details>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-8 print:max-w-none print:p-0">
          {serviceKeyMissing() && access.permissions.has("admin.settings.manage") && (
            <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Setup needed:</strong> the server key <code>SUPABASE_SERVICE_ROLE_KEY</code> isn&apos;t set on this deployment, so lessons, quizzes,
              roleplays, reviews, adding users and sign-in history won&apos;t work. Add it in Vercel → Settings → Environment Variables, then
              redeploy. (Only administrators see this message.)
            </div>
          )}
          <ModuleTabs items={trainingTabs(access.permissions, profile.role)} label="Training" />
          {children}
        </main>
      </div>

      <div className="print:hidden">
        <BottomNav items={mobile} />
      </div>
      <IdleTimeout minutes={access.isInternal ? (settings?.idle_timeout_internal_minutes ?? 30) : (settings?.idle_timeout_external_minutes ?? 10080)} />
    </div>
  );
}
