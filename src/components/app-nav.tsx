"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, BookOpen, Building2, ClipboardCheck, Clock, FileText, Home, KeyRound, Link2, ListChecks, MessageSquare,
  Settings, ShieldCheck, User, Users, UsersRound, type LucideIcon,
} from "lucide-react";
import type { IconName, NavItem, NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<IconName, LucideIcon> = {
  home: Home, book: BookOpen, quiz: ListChecks, chat: MessageSquare, user: User, users: Users,
  team: UsersRound, review: ClipboardCheck, content: FileText, chart: BarChart3, settings: Settings, audit: ShieldCheck,
  org: Building2, key: KeyRound, link: Link2, soon: Clock,
};

export function SideNavSections({ sections }: { sections: NavSection[] }) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      {sections.map((s, i) => (
        <div key={s.title ?? i}>
          {s.title && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</p>}
          <SideNav items={s.items} />
        </div>
      ))}
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
              active ? "bg-brand text-white" : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const mobile = items.filter((i) => !!i.mobile).slice(0, 5);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobile.length}, minmax(0, 1fr))` }}>
        {mobile.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
                  active ? "font-semibold text-brand" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
