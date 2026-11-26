/**
 * Permission catalog. Must match public.permissions (seeded in supabase/migrations/*_rbac.sql and later phase
 * migrations); supabase/tests/rbac.test.ts fails if they drift. Add new permissions in a migration AND here.
 *
 * Permissions only decide what the UI shows. Security is enforced by RLS, which calls has_permission() in Postgres.
 */
export const PERMISSIONS = {
  "admin.users.view": { module: "admin", restricted: false },
  "admin.users.manage": { module: "admin", restricted: false },
  "admin.roles.manage": { module: "admin", restricted: false },
  "admin.settings.manage": { module: "admin", restricted: false },
  "admin.security.manage": { module: "admin", restricted: false },
  "admin.org.manage": { module: "admin", restricted: false },
  "audit.view": { module: "audit", restricted: false },
  "audit.view_restricted": { module: "audit", restricted: true },
  "readonly.all": { module: "audit", restricted: false },
  "org.view": { module: "org", restricted: false },
  "employees.manage": { module: "org", restricted: false },
  "academy.admin": { module: "academy", restricted: false },
  "academy.team.manage": { module: "academy", restricted: false },
  "academy.learn": { module: "academy", restricted: false },
  "academy.reports.view": { module: "academy", restricted: false },
  "portal.customer": { module: "portal", restricted: false },
  "portal.distributor": { module: "portal", restricted: false },
  "portal.supplier": { module: "portal", restricted: false },
  "risk.view": { module: "admin", restricted: false },
  "approvals.view_all": { module: "approvals", restricted: false },
  "admin.approvals.manage": { module: "admin", restricted: false },
  "petty_cash.request": { module: "finance", restricted: false },
  "petty_cash.view_all": { module: "finance", restricted: false },
  "inventory.view": { module: "inventory", restricted: false },
  "inventory.view_cost": { module: "inventory", restricted: true },
  "inventory.products.manage": { module: "inventory", restricted: false },
  "inventory.receive": { module: "inventory", restricted: false },
  "inventory.transfer": { module: "inventory", restricted: false },
  "inventory.adjust.request": { module: "inventory", restricted: false },
  "inventory.count": { module: "inventory", restricted: false },
  "inventory.qa.release": { module: "inventory", restricted: false },
  "inventory.reorder.manage": { module: "inventory", restricted: false },
  "inventory.cost.manage": { module: "inventory", restricted: true },
  "sales.view": { module: "sales", restricted: false },
  "sales.view_all": { module: "sales", restricted: false },
  "sales.customers.manage": { module: "sales", restricted: false },
  "sales.crm": { module: "sales", restricted: false },
  "sales.orders.create": { module: "sales", restricted: false },
  "sales.orders.discount": { module: "sales", restricted: false },
  "sales.pricing.manage": { module: "sales", restricted: false },
  "sales.payments.record": { module: "sales", restricted: false },
  "sales.payments.confirm": { module: "sales", restricted: false },
  "sales.fulfil": { module: "sales", restricted: false },
  "sales.invoices.manage": { module: "sales", restricted: false },
  "procurement.view": { module: "procurement", restricted: false },
  "procurement.request": { module: "procurement", restricted: false },
  "procurement.suppliers.manage": { module: "procurement", restricted: false },
  "procurement.po.create": { module: "procurement", restricted: false },
  "procurement.invoices.manage": { module: "procurement", restricted: false },
  "procurement.view_bank": { module: "procurement", restricted: true },
  "accounting.view": { module: "accounting", restricted: false },
  "accounting.journals.create": { module: "accounting", restricted: false },
  "accounting.periods.manage": { module: "accounting", restricted: false },
  "accounting.coa.manage": { module: "accounting", restricted: false },
  "ap.payments.create": { module: "accounting", restricted: false },
  "ar.manage": { module: "accounting", restricted: false },
  "bank.reconcile": { module: "accounting", restricted: false },
  "finance.reports.view": { module: "accounting", restricted: false },
  "transmittals.receive": { module: "accounting", restricted: false },
} as const satisfies Record<string, { module: string; restricted: boolean }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const MODULE_LABELS: Record<string, string> = {
  admin: "Administration",
  audit: "Audit",
  org: "Organization",
  academy: "Training / Academy",
  portal: "Portals",
  approvals: "Approvals",
  finance: "Finance",
  inventory: "Inventory & warehouse",
  sales: "Sales, CRM & shop",
  procurement: "Procurement",
  accounting: "Accounting & finance",
};

/** Built-in role codes (public.roles where is_system). */
export const SYSTEM_ROLES = [
  "super_admin", "ceo", "cfo", "coo", "cmo", "operations_manager", "sales_head", "hr_head", "accounting_officer",
  "sales_rep", "warehouse", "manufacturing", "qa", "creative", "trainer", "employee", "driver", "auditor",
  "customer", "distributor", "supplier",
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];
