import type { Permission } from "@/lib/rbac/permissions";
import type { UserRole } from "@/lib/types";

export type IconName =
  | "home" | "book" | "quiz" | "chat" | "user" | "users" | "team" | "review"
  | "content" | "chart" | "settings" | "audit" | "org" | "key" | "link" | "soon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** shown in the phone bottom bar (number = priority, lower first) */
  mobile?: number | boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

interface ModuleEntry extends NavItem {
  section: string;
  /** any of these permissions shows the item; omitted = everyone signed in */
  perm?: Permission[];
  /** optional label override by Academy level */
  labelFor?: Partial<Record<UserRole, string>>;
}

const SECTIONS = ["", "Training", "Administration", "Coming soon"] as const;

/**
 * Module registry: every page in the sidebar and the permission that shows it. New modules add entries here.
 * This only decides what's SHOWN; pages still call requireUser/requirePermission and RLS enforces access.
 */
export const MODULES: ModuleEntry[] = [
  { section: "", href: "/dashboard", label: "Home", icon: "home", mobile: 1 },

  { section: "Training", href: "/learn", label: "Learn", icon: "book", perm: ["academy.learn", "academy.team.manage"], mobile: 2 },
  { section: "Training", href: "/quizzes", label: "Quizzes", icon: "quiz", perm: ["academy.learn"], mobile: 4 },
  { section: "Training", href: "/roleplay", label: "Roleplay", icon: "chat", perm: ["academy.learn", "academy.team.manage"], mobile: 3 },
  { section: "Training", href: "/team", label: "My team", icon: "team", perm: ["academy.team.manage", "academy.admin"], labelFor: { owner: "All reps" }, mobile: 2 },
  { section: "Training", href: "/reviews", label: "Reviews", icon: "review", perm: ["academy.team.manage", "academy.admin"], mobile: 3 },
  { section: "Training", href: "/reports", label: "Training reports", icon: "chart", perm: ["academy.reports.view", "academy.team.manage", "academy.admin"], mobile: 6 },
  { section: "Training", href: "/signup-links", label: "Sign-up links", icon: "link", perm: ["academy.team.manage", "academy.admin"] },
  { section: "Training", href: "/admin/content", label: "Training content", icon: "content", perm: ["academy.admin"] },

  { section: "Administration", href: "/admin/users", label: "Users", icon: "users", perm: ["admin.users.view"], mobile: 7 },
  { section: "Administration", href: "/admin/roles", label: "Roles & permissions", icon: "key", perm: ["admin.roles.manage", "admin.users.view"] },
  // Everyone internal can READ the directory (org.view), but only people who look after it get the menu item.
  { section: "Administration", href: "/admin/org", label: "Organization", icon: "org", perm: ["admin.org.manage", "employees.manage", "admin.users.view", "readonly.all"] },
  { section: "Administration", href: "/admin/settings", label: "Settings", icon: "settings", perm: ["admin.settings.manage", "admin.security.manage", "academy.admin"], mobile: 8 },
  { section: "Administration", href: "/admin/audit", label: "Audit log", icon: "audit", perm: ["audit.view"] },

  { section: "", href: "/account", label: "My account", icon: "user", mobile: 5 },
];

/** Modules planned in docs/MODULES.md, shown as "coming soon" to administrators only. */
export const UPCOMING_MODULES = [
  { slug: "inventory", label: "Inventory & warehouse", phase: "2" },
  { slug: "sales", label: "Sales & CRM", phase: "3" },
  { slug: "orders", label: "Orders & e-commerce", phase: "3" },
  { slug: "procurement", label: "Procurement", phase: "4" },
  { slug: "accounting", label: "Accounting & finance", phase: "5" },
  { slug: "command-center", label: "CEO Command Center", phase: "6" },
];

export function buildNav(perms: ReadonlySet<string>, academyRole: UserRole | null): { sections: NavSection[]; mobile: NavItem[] } {
  const visible = MODULES.filter((m) => !m.perm || m.perm.some((p) => perms.has(p))).map((m) => ({
    ...m,
    label: (academyRole && m.labelFor?.[academyRole]) || m.label,
  }));
  const sections: NavSection[] = SECTIONS.filter((s) => s !== "Coming soon")
    .map((title) => ({ title: title || undefined, items: visible.filter((m) => m.section === title && m.href !== "/account") }))
    .filter((s) => s.items.length > 0);
  if (perms.has("admin.roles.manage")) {
    sections.push({
      title: "Coming soon",
      items: UPCOMING_MODULES.map((u) => ({ href: `/modules/${u.slug}`, label: u.label, icon: "soon" as const })),
    });
  }
  const mobile = [...visible]
    .filter((m) => m.mobile)
    .sort((a, b) => Number(a.mobile ?? 99) - Number(b.mobile ?? 99))
    .filter((m, i, arr) => arr.findIndex((x) => x.href === m.href) === i)
    .slice(0, 5);
  // keep "My account" reachable on phones
  if (!mobile.some((m) => m.href === "/account")) mobile[mobile.length - 1] = visible.find((m) => m.href === "/account")!;
  return { sections, mobile };
}

/** Flat list for the command palette. */
export function paletteItems(perms: ReadonlySet<string>, academyRole: UserRole | null): NavItem[] {
  const { sections } = buildNav(perms, academyRole);
  const items = sections.flatMap((s) => s.items);
  items.push({ href: "/account", label: "My account", icon: "user" });
  if (["admin.org.manage", "employees.manage", "admin.users.view", "readonly.all"].some((p) => perms.has(p))) {
    items.push(
      { href: "/admin/org/locations", label: "Locations", icon: "org" },
      { href: "/admin/org/departments", label: "Departments", icon: "org" },
      { href: "/admin/org/positions", label: "Positions", icon: "org" },
      { href: "/admin/org/employees", label: "Employees", icon: "org" },
      { href: "/admin/org/teams", label: "Sales teams", icon: "team" },
    );
  }
  return items;
}
