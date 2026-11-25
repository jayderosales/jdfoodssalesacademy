"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { siteUrl } from "@/lib/safe-redirect";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/utils";

export type FormState = { error?: string; message?: string };

const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const role = z.enum(["owner", "manager", "rep"]);

const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email."),
    full_name: z.string().trim().min(2, "Enter the person's full name.").max(120),
    role,
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
  await requireOwner();
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const admin = createAdminClient();
  // app_metadata is server-controlled; the DB trigger reads role/team/hire date from it.
  const app_metadata = { role: v.role, full_name: v.full_name, team_id: v.team_id ?? "", hire_date: v.hire_date ?? "" };

  let userId: string | undefined;
  if (v.method === "invite") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(v.email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/account`,
    });
    if (error) return { error: friendly(error.message) };
    userId = data.user?.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: v.email,
      password: v.password!,
      email_confirm: true,
      app_metadata,
    });
    if (error) return { error: friendly(error.message) };
    userId = data.user?.id;
  }
  if (!userId) return { error: "User was not created." };

  // Set profile fields as the owner (not the service role) so the audit log records who did it.
  const supabase = await createClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: v.full_name, role: v.role, team_id: v.team_id, hire_date: v.hire_date })
    .eq("id", userId);
  if (profileError) return { error: `Account created, but saving details failed: ${profileError.message}` };

  revalidatePath("/admin/users");
  redirect(`/admin/users/${userId}?created=${v.method}`);
}

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  role,
  team_id: optionalUuid,
  hire_date: optionalDate,
});

export async function updateUser(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = updateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  if (id === me.id && fields.role !== me.role) return { error: "You can't change your own role." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(fields).eq("id", id);
  if (error) return { error: error.message };
  if (fields.role !== "manager" && fields.role !== "owner") {
    await supabase.from("team_managers").delete().eq("manager_id", id);
  }
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { message: "Saved." };
}

export async function setManagedTeams(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
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
  const me = await requireOwner();
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
  if (error) return { error: error.message };

  // Block sign-in too (RLS already hides all data from inactive users). Data is kept for analytics.
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { message: "User deactivated. Their training data is kept for reports." };
}

export async function reactivateUser(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: "active", exit_date: null, exit_reason: null, exit_stage_level: null })
    .eq("id", id);
  if (error) return { error: error.message };
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  return { message: "User reactivated." };
}

export async function sendReset(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const email = z.string().email().parse(form.get("email"));
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/account` });
  if (error) return { error: error.message };
  return { message: `Password setup email sent to ${email}.` };
}

function friendly(msg: string) {
  if (/already been registered|already exists/i.test(msg)) return "A user with that email already exists.";
  return msg;
}
