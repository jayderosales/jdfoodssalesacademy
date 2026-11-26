import type { Permission } from "@/lib/rbac/permissions";
import type { UserRole } from "@/lib/types";

export type IconName =
  | "home" | "book" | "quiz" | "chat" | "user" | "users" | "team" | "review"
  | "content" | "chart" | "settings" | "audit" | "org" | "key" | "link" | "soon" | "approve" | "wallet" | "bell" | "import"
  | "box" | "tag" | "layers" | "truck" | "inbox" | "sliders" | "clipboard" | "scan" | "gauge"
  | "cart" | "target" | "receipt" | "pin" | "factory";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** shown in the phone bottom bar (number = priority, lower first) */
  mobile?: number | boolean;
  /** other paths that count as "this item" for highlighting (e.g. all Training pages) */
  match?: string[];
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

/**
 * Module registry: every page in the sidebar and the permission that shows it. New modules add entries here.
 * This only decides what's SHOWN; pages still call requireUser/requirePermission and RLS enforces access.
 */
export const MODULES: ModuleEntry[] = [
  { section: "", href: "/dashboard", label: "Home", icon: "home", mobile: 1 },
  { section: "", href: "/approvals", label: "Approvals", icon: "approve", perm: ["petty_cash.request", "approvals.view_all", "readonly.all"], mobile: 3 },
  { section: "", href: "/requests/petty-cash", label: "Petty cash", icon: "wallet", perm: ["petty_cash.request", "petty_cash.view_all", "readonly.all"] },
  { section: "", href: "/scan", label: "Scan a document", icon: "scan", match: ["/scan"] },
  { section: "", href: "/accounting/transmittals", label: "Transmittals", icon: "clipboard" },

  { section: "Training", href: "/learn", label: "Learn", icon: "book", perm: ["academy.learn", "academy.team.manage"], mobile: 2 },
  { section: "Training", href: "/quizzes", label: "Quizzes", icon: "quiz", perm: ["academy.learn"], mobile: 4 },
  { section: "Training", href: "/roleplay", label: "Roleplay", icon: "chat", perm: ["academy.learn", "academy.team.manage"], mobile: 3 },
  { section: "Training", href: "/team", label: "My team", icon: "team", perm: ["academy.team.manage", "academy.admin"], labelFor: { owner: "All reps" }, mobile: 2 },
  { section: "Training", href: "/reviews", label: "Reviews", icon: "review", perm: ["academy.team.manage", "academy.admin"], mobile: 3 },
  { section: "Training", href: "/reports", label: "Training reports", icon: "chart", perm: ["academy.reports.view", "academy.team.manage", "academy.admin"], mobile: 6 },
  { section: "Training", href: "/signup-links", label: "Sign-up links", icon: "link", perm: ["academy.team.manage", "academy.admin"] },
  { section: "Training", href: "/admin/content", label: "Training content", icon: "content", perm: ["academy.admin"] },

  { section: "Inventory", href: "/inventory", label: "Overview", icon: "gauge", perm: ["inventory.view"], mobile: 2 },
  { section: "Inventory", href: "/inventory/products", label: "Products", icon: "box", perm: ["inventory.view"] },
  { section: "Inventory", href: "/inventory/prices", label: "Costs & prices", icon: "tag", perm: ["inventory.cost.manage", "inventory.products.manage"] },
  { section: "Inventory", href: "/inventory/stock", label: "Stock on hand", icon: "layers", perm: ["inventory.view"] },
  { section: "Inventory", href: "/inventory/batches", label: "Batches", icon: "layers", perm: ["inventory.view"] },
  { section: "Inventory", href: "/inventory/receipts", label: "Receipts", icon: "inbox", perm: ["inventory.receive"] },
  { section: "Inventory", href: "/inventory/transfers", label: "Transfers", icon: "truck", perm: ["inventory.transfer"] },
  { section: "Inventory", href: "/inventory/adjustments", label: "Adjustments", icon: "sliders", perm: ["inventory.adjust.request", "inventory.view_cost"] },
  { section: "Inventory", href: "/inventory/counts", label: "Counts", icon: "clipboard", perm: ["inventory.count"] },
  { section: "Inventory", href: "/inventory/reorder", label: "Reorder", icon: "chart", perm: ["inventory.reorder.manage", "inventory.view_cost"] },
  { section: "Inventory", href: "/inventory/scan", label: "Scan", icon: "scan", perm: ["inventory.view"] },

  { section: "CEO reports", href: "/ceo", label: "Overview", icon: "gauge", perm: ["ceo.reports.view"] },
  { section: "CEO reports", href: "/ceo/sales", label: "Sales", icon: "chart", perm: ["ceo.reports.view"] },
  { section: "CEO reports", href: "/ceo/production", label: "Production", icon: "factory", perm: ["ceo.reports.view"] },
  { section: "CEO reports", href: "/ceo/fulfilment", label: "Incomplete orders", icon: "truck", perm: ["ceo.reports.view"] },
  { section: "CEO reports", href: "/ceo/receivables", label: "Receivables", icon: "users", perm: ["ceo.reports.view"] },
  { section: "CEO reports", href: "/ceo/payables", label: "Payables", icon: "wallet", perm: ["ceo.reports.view"] },
  { section: "CEO reports", href: "/ceo/training", label: "Training", icon: "book", perm: ["ceo.reports.view"] },
  { section: "CEO reports", href: "/ceo/targets", label: "Targets", icon: "target", perm: ["ceo.reports.view"] },
  { section: "Manufacturing", href: "/manufacturing", label: "Daily production", icon: "clipboard", perm: ["production.report", "production.view", "readonly.all"], match: ["/manufacturing"] },
  { section: "Sales", href: "/sales", label: "Overview", icon: "gauge", perm: ["sales.view", "sales.fulfil", "sales.payments.confirm"], mobile: 2 },
  { section: "Sales", href: "/sales/orders", label: "Orders", icon: "cart", perm: ["sales.view", "sales.orders.create"] },
  { section: "Sales", href: "/sales/customers", label: "Customers", icon: "users", perm: ["sales.view", "sales.customers.manage"] },
  { section: "Sales", href: "/sales/leads", label: "Leads", icon: "target", perm: ["sales.crm", "sales.view_all"] },
  { section: "Sales", href: "/sales/activities", label: "Calls & visits", icon: "pin", perm: ["sales.crm", "sales.view_all"] },
  { section: "Sales", href: "/sales/payments", label: "Payments", icon: "wallet", perm: ["sales.payments.record", "sales.payments.confirm"] },
  { section: "Sales", href: "/sales/fulfilment", label: "Fulfilment", icon: "truck", perm: ["sales.fulfil"] },
  { section: "Sales", href: "/sales/prices", label: "Price lists", icon: "tag", perm: ["sales.pricing.manage"] },
  { section: "Sales", href: "/sales/invoices", label: "Invoices & SI", icon: "receipt", perm: ["sales.invoices.manage"] },

  { section: "Procurement", href: "/procurement", label: "Overview", icon: "gauge", perm: ["procurement.view", "procurement.po.create"] },
  { section: "Procurement", href: "/procurement/requests", label: "Requests", icon: "clipboard", perm: ["procurement.request", "procurement.po.create"] },
  { section: "Procurement", href: "/procurement/orders", label: "Purchase orders", icon: "cart", perm: ["procurement.view", "procurement.po.create"] },
  { section: "Procurement", href: "/procurement/suppliers", label: "Suppliers", icon: "org", perm: ["procurement.view", "procurement.suppliers.manage"] },
  { section: "Procurement", href: "/procurement/invoices", label: "Supplier invoices", icon: "receipt", perm: ["procurement.invoices.manage", "procurement.view"] },

  { section: "Accounting", href: "/accounting", label: "Overview", icon: "gauge", perm: ["accounting.view", "finance.reports.view"] },
  { section: "Accounting", href: "/accounting/reports", label: "Reports", icon: "chart", perm: ["finance.reports.view"] },
  { section: "Accounting", href: "/accounting/receivables", label: "Receivables", icon: "users", perm: ["ar.manage", "accounting.view"] },
  { section: "Accounting", href: "/accounting/payables", label: "Payables", icon: "wallet", perm: ["ap.payments.create", "accounting.view"] },
  { section: "Accounting", href: "/accounting/disbursements", label: "Disbursements", icon: "wallet", perm: ["accounting.view", "ap.payments.create", "accounting.journals.create"] },
  { section: "Accounting", href: "/accounting/banks", label: "Banks", icon: "layers", perm: ["bank.reconcile", "accounting.view"] },
  { section: "Accounting", href: "/accounting/journals", label: "Journals", icon: "clipboard", perm: ["accounting.view", "accounting.journals.create"] },
  { section: "Accounting", href: "/accounting/ledger", label: "Ledger", icon: "receipt", perm: ["accounting.view"] },
  { section: "Accounting", href: "/accounting/accounts", label: "Chart of accounts", icon: "sliders", perm: ["accounting.view", "accounting.coa.manage"] },
  { section: "Accounting", href: "/accounting/periods", label: "Periods & setup", icon: "settings", perm: ["accounting.periods.manage", "accounting.view"] },

  { section: "Administration", href: "/admin/users", label: "Users", icon: "users", perm: ["admin.users.view"], mobile: 7 },
  { section: "Administration", href: "/admin/roles", label: "Roles & permissions", icon: "key", perm: ["admin.roles.manage", "admin.users.view"] },
  // Everyone internal can READ the directory (org.view), but only people who look after it get the menu item.
  { section: "Administration", href: "/admin/org", label: "Organization", icon: "org", perm: ["admin.org.manage", "employees.manage", "admin.users.view", "readonly.all"] },
  { section: "Administration", href: "/admin/settings", label: "Settings", icon: "settings", perm: ["admin.settings.manage", "admin.security.manage", "academy.admin"], mobile: 8 },
  { section: "Administration", href: "/admin/audit", label: "Audit log", icon: "audit", perm: ["audit.view"] },
  { section: "Administration", href: "/admin/import", label: "Import data", icon: "import", perm: ["employees.manage", "admin.org.manage", "inventory.products.manage", "inventory.receive", "sales.customers.manage", "sales.pricing.manage"] },

  { section: "", href: "/account", label: "My account", icon: "user", mobile: 5 },
];

/** Modules planned in docs/MODULES.md, shown as "coming soon" to administrators only. */
export const UPCOMING_MODULES: { slug: string; label: string; phase: string }[] = [];

function visibleModules(perms: ReadonlySet<string>, academyRole: UserRole | null) {
  return MODULES.filter((m) => !m.perm || m.perm.some((p) => perms.has(p))).map((m) => ({
    ...m,
    label: (academyRole && m.labelFor?.[academyRole]) || m.label,
  }));
}

/** The pages of a grouped module this person can open, shown as tabs on every page of that module. */
export function sectionTabs(section: string, perms: ReadonlySet<string>, academyRole: UserRole | null): NavItem[] {
  return visibleModules(perms, academyRole)
    .filter((m) => m.section === section)
    .map(({ href, label, icon }) => ({ href, label, icon }));
}
export const trainingTabs = (perms: ReadonlySet<string>, academyRole: UserRole | null) => sectionTabs("Training", perms, academyRole);

/** Modules with sub-pages appear as ONE sidebar item; their pages are reached through tabs. */
export const GROUPED: Record<string, { label: string; icon: IconName }> = {
  Training: { label: "Training", icon: "book" },
  Inventory: { label: "Inventory", icon: "box" },
  Sales: { label: "Sales", icon: "cart" },
  Procurement: { label: "Procurement", icon: "truck" },
  Accounting: { label: "Accounting", icon: "wallet" },
  Manufacturing: { label: "Manufacturing", icon: "factory" },
  "CEO reports": { label: "CEO reports", icon: "chart" },
};

export function buildNav(perms: ReadonlySet<string>, academyRole: UserRole | null): { sections: NavSection[]; mobile: NavItem[] } {
  const visible = visibleModules(perms, academyRole);
  const grouped: NavItem[] = Object.entries(GROUPED).flatMap(([section, g]) => {
    const pages = visible.filter((m) => m.section === section);
    if (!pages.length) return [];
    const best = Math.min(...pages.map((m) => Number(m.mobile || 99)));
    return [{ href: pages[0].href, label: g.label, icon: g.icon, match: pages.map((m) => m.href), mobile: best < 99 ? best : undefined }];
  });
  const top = [...visible.filter((m) => m.section === "" && m.href !== "/account"), ...grouped];
  const sections: NavSection[] = [{ items: top }];
  const admin = visible.filter((m) => m.section === "Administration");
  if (admin.length) sections.push({ title: "Administration", items: admin });
  if (perms.has("admin.roles.manage") && UPCOMING_MODULES.length) {
    sections.push({
      title: "Coming soon",
      items: UPCOMING_MODULES.map((u) => ({ href: `/modules/${u.slug}`, label: u.label, icon: "soon" as const })),
    });
  }
  const mobile = [...visible.filter((m) => !(m.section in GROUPED)), ...grouped]
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
  const items = [...sections.flatMap((s) => s.items).filter((i) => !i.match), ...trainingTabs(perms, academyRole)];
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
