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
} as const satisfies Record<string, { module: string; restricted: boolean }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const MODULE_LABELS: Record<string, string> = {
  admin: "Administration",
  audit: "Audit",
  org: "Organization",
  academy: "Training / Academy",
  portal: "Portals",
};

/** Built-in role codes (public.roles where is_system). */
export const SYSTEM_ROLES = [
  "super_admin", "ceo", "cfo", "coo", "cmo", "operations_manager", "sales_head", "hr_head", "accounting_officer",
  "sales_rep", "warehouse", "manufacturing", "qa", "creative", "trainer", "employee", "driver", "auditor",
  "customer", "distributor", "supplier",
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];
