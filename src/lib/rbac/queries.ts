import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string;
  is_internal: boolean;
  grants_all: boolean;
  is_system: boolean;
  active: boolean;
}

export interface GrantRow {
  id: string;
  user_id: string;
  role_id: string;
  location_id: string | null;
  department_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  roles: { code: string; name: string } | null;
  locations: { name: string } | null;
  departments: { name: string } | null;
}

export const listRoles = cache(async (): Promise<RoleRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("*").order("is_internal", { ascending: false }).order("name");
  return (data as RoleRow[] | null) ?? [];
});

const GRANT_SELECT = "id, user_id, role_id, location_id, department_id, valid_from, valid_to, created_at, roles(code, name), locations(name), departments(name)";

export async function listGrants(userIds?: string[]): Promise<GrantRow[]> {
  const supabase = await createClient();
  let q = supabase.from("user_roles").select(GRANT_SELECT).order("created_at");
  if (userIds) q = q.in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  return (data as unknown as GrantRow[] | null) ?? [];
}

/** The signed-in user's role names (for the user menu). */
export const getMyRoleNames = cache(async (userId: string): Promise<string[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("user_roles").select("roles(name)").eq("user_id", userId);
  return ((data as unknown as { roles: { name: string } | null }[] | null) ?? []).map((r) => r.roles?.name).filter((n): n is string => !!n);
});

export function grantLabel(g: GrantRow): string {
  const scope = [g.locations?.name, g.departments?.name].filter(Boolean).join(", ");
  return `${g.roles?.name ?? "?"}${scope ? ` (${scope})` : ""}`;
}
