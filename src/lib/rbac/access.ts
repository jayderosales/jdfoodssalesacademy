import type { Permission } from "@/lib/rbac/permissions";

/** What the signed-in user may do, from public.my_access(). UI only; RLS enforces it. */
export interface Access {
  permissions: ReadonlySet<string>;
  isInternal: boolean;
  mfaRequired: boolean;
  mfaOk: boolean;
}

export const NO_ACCESS: Access = { permissions: new Set(), isInternal: false, mfaRequired: false, mfaOk: true };

export type AccessRow = { permission: string | null; mfa_required: boolean; mfa_ok: boolean; is_internal: boolean };

export function accessFromRows(rows: AccessRow[] | null | undefined): Access {
  if (!rows?.length) return NO_ACCESS;
  return {
    permissions: new Set(rows.map((r) => r.permission).filter((p): p is string => !!p)),
    isInternal: rows[0].is_internal,
    mfaRequired: rows[0].mfa_required,
    mfaOk: rows[0].mfa_ok,
  };
}

export function can(access: Access, perm: Permission | Permission[]): boolean {
  const list = Array.isArray(perm) ? perm : [perm];
  return list.some((p) => access.permissions.has(p));
}
