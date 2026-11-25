"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { ALL_PERMISSIONS } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const roleFields = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(80),
  description: z.string().trim().max(300).default(""),
});

export async function createRole(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.roles.manage");
  const parsed = roleFields
    .extend({
      code: z.string().trim().toLowerCase().regex(/^[a-z_]{3,40}$/, "Code: 3–40 lowercase letters or _ (e.g. branch_cashier)."),
      is_internal: z.enum(["true", "false"]).transform((v) => v === "true"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").insert(parsed.data).select("id").single();
  if (error) return { error: /duplicate/.test(error.message) ? "That code is already used." : error.message };
  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${data.id}`);
}

export async function updateRole(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.roles.manage");
  const parsed = roleFields
    .extend({ id: z.string().uuid(), active: z.preprocess((v) => v === "on", z.boolean()) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("roles").update(fields).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/roles/${id}`);
  revalidatePath("/admin/roles");
  return { message: "Saved." };
}

/** Replace the role's permission set with the ticked boxes (only the differences are written, so the audit log stays readable). */
export async function setRolePermissions(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.roles.manage");
  const id = z.string().uuid().parse(form.get("id"));
  const wanted = new Set(z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).parse(form.getAll("perms")));
  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("grants_all").eq("id", id).single();
  if (role?.grants_all) return { error: "This role always has every permission." };
  const { data: current } = await supabase.from("role_permissions").select("permission_code").eq("role_id", id);
  const have = new Set((current ?? []).map((r: { permission_code: string }) => r.permission_code));
  const add = [...wanted].filter((p) => !have.has(p));
  const remove = [...have].filter((p) => !wanted.has(p));
  if (add.length) {
    const { error } = await supabase.from("role_permissions").insert(add.map((permission_code) => ({ role_id: id, permission_code })));
    if (error) return { error: error.message };
  }
  if (remove.length) {
    const { error } = await supabase.from("role_permissions").delete().eq("role_id", id).in("permission_code", remove);
    if (error) return { error: error.message };
  }
  revalidatePath(`/admin/roles/${id}`);
  return { message: add.length || remove.length ? `Saved: ${add.length} added, ${remove.length} removed.` : "No changes." };
}

export async function deleteRole(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.roles.manage");
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { count } = await supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role_id", id);
  if (count) return { error: `${count} user(s) still have this role. Remove it from them first, or deactivate the role.` };
  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) return { error: /Built-in/.test(error.message) ? "Built-in roles can't be deleted. Deactivate it instead." : error.message };
  revalidatePath("/admin/roles");
  redirect("/admin/roles");
}
