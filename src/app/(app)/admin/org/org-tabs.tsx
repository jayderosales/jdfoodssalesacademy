"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/org/locations", label: "Locations" },
  { href: "/admin/org/departments", label: "Departments" },
  { href: "/admin/org/positions", label: "Positions" },
  { href: "/admin/org/employees", label: "Employees" },
  { href: "/admin/org/teams", label: "Sales teams" },
];

export function OrgTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Organization" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm", active ? "border-brand font-semibold text-brand" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
