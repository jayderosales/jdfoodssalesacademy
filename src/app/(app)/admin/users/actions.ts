"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { siteUrl } from "@/lib/safe-redirect";
import { SERVICE_KEY_HELP, createAdminClient, createClient, serviceKeyMissing } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/utils";

export type FormState = { error?: string; message?: string };

const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const roleCode = z.string().regex(/^[a-z_]+$/);

const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email."),
    full_name: z.string().trim().min(2, "Enter the person's full name.").max(120),
    roles: z.array(roleCode).min(1, "Choose at least one role."),
    team_id: optionalUuid,
    hire_date: optionalDate,
    method: z.enum(["invite", "password"]),
    password: z.string().optional(),
  })
  .refine((v) => v.method === "invite" || (v.password?.length ?? 0) >= 8, {
    message: "Temporary password must be at least 8 characters.",
    path: ["password"],
  });

export async function createUser(_: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("admin.users.manage");
  const parsed = createSchema.safeParse({ ...Object.fromEntries(form), roles: form.getAll("roles") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  if (serviceKeyMissing()) return { error: SERVICE_KEY_HELP };
  const admin = createAdminClient();

  let userId: string | undefined;
  // The account starts with no roles; roles are granted below as the signed-in admin so RLS checks
  // that they may grant them, and the audit log records who did it.
  const app_metadata = { roles: [] as string[], full_name: v.full_name, team_id: v.team_id ?? "", hire_date: v.hire_date ?? "" };
  if (v.method === "invite") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(v.email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/account`,
    });
    if (error) return { error: friendly(error.message) };
    userId = data.user?.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: v.email, password: v.password!, email_confirm: true, app_metadata });
    if (error) return { error: friendly(error.message) };
    userId = data.user?.id;
  }
  if (!userId) return { error: "User was not created." };

  const supabase = await createClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: v.full_name, team_id: v.team_id, hire_date: v.hire_date })
    .eq("id", userId);
  if (profileError) return { error: `Account created, but saving details failed: ${profileError.message}` };

  // An invited user gets the legacy default role from the DB trigger; replace it with the chosen roles.
  await supabase.from("user_roles").delete().eq("user_id", userId);
  const { data: roles } = await supabase.from("roles").select("id, code").in("code", v.roles);
  const { error: rolesError } = await supabase
    .from("user_roles")
    .insert((roles ?? []).map((r: { id: string }) => ({ user_id: userId, role_id: r.id, granted_by: me.id })));
  if (rolesError) return { error: `Account created, but some roles couldn't be granted: ${friendly(rolesError.message)}` };

  revalidatePath("/admin/users");
  redirect(`/admin/users/${userId}?created=${v.method}`);
}

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  team_id: optionalUuid,
  hire_date: optionalDate,
  employee_id: optionalUuid,
});

export async function updateUser(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.users.manage");
  const parsed = updateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(fields).eq("id", id);
  if (error) return { error: /employee_id_key|duplicate/.test(error.message) ? "That employee is already linked to another user." : error.message };
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { message: "Saved." };
}

const grantSchema = z.object({
  user_id: z.string().uuid(),
  role_id: z.string().uuid("Choose a role."),
  location_id: optionalUuid,
  department_id: optionalUuid,
  valid_to: optionalDate,
});

export async function grantRole(_: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("admin.users.manage");
  const parsed = grantSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.user_id === me.id) return { error: "You can't change your own roles. Ask another administrator." };
  const supabase = await createClient();
  const { error } = await supabase.from("user_roles").insert({ ...parsed.data, granted_by: me.id });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/admin/users/${parsed.data.user_id}`);
  return { message: "Role added." };
}

export async function revokeRole(_: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("admin.users.manage");
  const id = z.string().uuid().parse(form.get("grant_id"));
  const userId = z.string().uuid().parse(form.get("user_id"));
  if (userId === me.id) return { error: "You can't change your own roles. Ask another administrator." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("user_roles").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "You don't have permission to remove that role." };
  // A person who is no longer an Academy manager shouldn't keep managing teams.
  const { data: p } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (p && p.role !== "manager" && p.role !== "owner") await supabase.from("team_managers").delete().eq("manager_id", userId);
  revalidatePath(`/admin/users/${userId}`);
  return { message: "Role removed." };
}

export async function setManagedTeams(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.users.manage");
  const id = z.string().uuid().parse(form.get("id"));
  const teamIds = z.array(z.string().uuid()).parse(form.getAll("team_ids"));
  const supabase = await createClient();
  const { error: delError } = await supabase.from("team_managers").delete().eq("manager_id", id);
  if (delError) return { error: delError.message };
  if (teamIds.length) {
    const { error } = await supabase.from("team_managers").insert(teamIds.map((team_id) => ({ team_id, manager_id: id })));
    if (error) return { error: error.message };
  }
  revalidatePath(`/admin/users/${id}`);
  return { message: "Managed teams saved." };
}

const deactivateSchema = z.object({
  id: z.string().uuid(),
  exit_date: optionalDate,
  exit_reason: z.string().trim().min(2, "Pick or enter an exit reason.").max(500),
});

export async function deactivateUser(_: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("admin.users.manage");
  const parsed = deactivateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, exit_date, exit_reason } = parsed.data;
  if (id === me.id) return { error: "You can't deactivate your own account." };

  const supabase = await createClient();
  const { data: lvl } = await supabase
    .from("level_history").select("level").eq("user_id", id).order("achieved_at", { ascending: false }).limit(1).maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ status: "inactive", exit_date: exit_date ?? manilaToday(), exit_reason, exit_stage_level: lvl?.level ?? 0 })
    .eq("id", id);
  if (error) return { error: friendly(error.message) };

  // Block sign-in too (RLS already hides all data from inactive users). Data is kept for analytics.
  if (!serviceKeyMissing()) await createAdminClient().auth.admin.updateUserById(id, { ban_duration: "876000h" });

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { message: "User deactivated. Their data is kept for reports." };
}

export async function reactivateUser(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.users.manage");
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: "active", exit_date: null, exit_reason: null, exit_stage_level: null })
    .eq("id", id);
  if (error) return { error: friendly(error.message) };
  if (!serviceKeyMissing()) {
    await createAdminClient().auth.admin.updateUserById(id, { ban_duration: "none" });
  } else {
    return { error: `Reactivated in the app, but sign-in is still blocked. ${SERVICE_KEY_HELP}` };
  }
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { message: "User reactivated." };
}

/** Approve a pending self-registration (staff without a valid link, or a customer/distributor/supplier). */
export async function approveRegistration(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.users.manage");
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_registration", { p_user: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { message: "Approved. They can sign in now." };
}

export async function sendReset(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.users.manage");
  const email = z.string().email().parse(form.get("email"));
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/account` });
  if (error) return { error: error.message };
  return { message: `Password setup email sent to ${email}.` };
}

/** Remove a user's authenticator app (lost phone). They'll set up a new one at their next sign-in. */
export async function resetMfa(_: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("admin.security.manage");
  const id = z.string().uuid().parse(form.get("id"));
  if (id === me.id) return { error: "You can't reset your own two-step sign-in here. Use My account." };
  if (serviceKeyMissing()) return { error: SERVICE_KEY_HELP };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: id });
  if (error) return { error: error.message };
  for (const f of data?.factors ?? []) {
    const { error: delError } = await admin.auth.admin.mfa.deleteFactor({ userId: id, id: f.id });
    if (delError) return { error: delError.message };
  }
  // Record it in the audit trail as the signed-in admin.
  const supabase = await createClient();
  await supabase.rpc("log_restricted_access", { p_table: "auth.mfa_factors", p_record: id, p_purpose: "MFA reset by administrator" });
  revalidatePath(`/admin/users/${id}`);
  return { message: data?.factors?.length ? "Two-step sign-in reset. They'll set it up again next time they sign in." : "This user had no authenticator set up." };
}

function friendly(msg: string) {
  if (/already been registered|already exists/i.test(msg)) return "A user with that email already exists.";
  if (/user_roles_unique_scope|duplicate key/i.test(msg)) return "They already have that role (with the same scope).";
  if (/row-level security/i.test(msg)) return "You don't have permission to do that (you can only grant roles whose permissions you hold).";
  if (/invalid api key|invalid jwt|jwt/i.test(msg)) return SERVICE_KEY_HELP;
  return msg;
}
