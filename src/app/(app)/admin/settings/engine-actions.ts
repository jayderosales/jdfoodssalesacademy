"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };
const optionalMoney = z.preprocess((v) => (v === "" || v == null ? null : parseMoney(String(v)) ?? "bad"), z.string().regex(/^\d+\.\d{2}$/, "Enter a valid amount.").nullable());
const friendly = (m: string) => (/row-level security/.test(m) ? "You don't have permission to do that." : m);

// ---------------------------------------------------------------- approval policies
export async function savePolicy(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.approvals.manage");
  const v = z
    .object({
      id: z.string().uuid(),
      name: z.string().trim().min(2).max(120),
      min_amount: optionalMoney,
      max_amount: optionalMoney,
      active: z.preprocess((x) => x === "on", z.boolean()),
      role_id: z.string().uuid().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const { id, role_id, ...fields } = v.data;
  if (fields.min_amount && fields.max_amount && Number(fields.max_amount) < Number(fields.min_amount)) return { error: "The maximum is below the minimum." };
  const supabase = await createClient();
  const { error } = await supabase.from("approval_policies").update(fields).eq("id", id);
  if (error) return { error: friendly(error.message) };
  if (role_id) {
    const { error: e2 } = await supabase.from("approval_policy_steps").update({ approver_type: "role", role_id, user_id: null }).eq("policy_id", id).eq("step_no", 1);
    if (e2) return { error: friendly(e2.message) };
  }
  revalidatePath("/admin/settings/approvals");
  return { message: "Saved. New requests use it right away; requests already waiting keep their approvers." };
}

// ---------------------------------------------------------------- working hours and holidays
export async function saveWorkingHours(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.settings.manage");
  const days = form.getAll("work_days").map(Number).filter((d) => d >= 1 && d <= 7);
  const v = z.object({ work_start: z.string().regex(/^\d{2}:\d{2}$/), work_end: z.string().regex(/^\d{2}:\d{2}$/) }).safeParse(Object.fromEntries(form));
  if (!v.success || !days.length) return { error: "Choose at least one working day and valid times." };
  if (v.data.work_end <= v.data.work_start) return { error: "The end time must be after the start time." };
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").update({ ...v.data, work_days: days }).eq("id", true);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/settings/working-hours");
  return { message: "Working hours saved." };
}

export async function addHoliday(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.settings.manage");
  const v = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."), name: z.string().trim().min(2).max(120) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").upsert({ ...v.data, needs_verification: false });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/settings/working-hours");
  return { message: "Holiday saved." };
}

export async function removeHoliday(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").delete().eq("day", String(form.get("day")));
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/settings/working-hours");
  return { message: "Removed." };
}

export async function verifyHoliday(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").update({ needs_verification: false }).eq("day", String(form.get("day")));
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/settings/working-hours");
  return { message: "Marked as checked." };
}

// ---------------------------------------------------------------- notifications
export async function saveNotificationRule(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.settings.manage");
  const v = z
    .object({
      event_type: z.string().max(80),
      title_template: z.string().trim().min(2).max(200),
      body_template: z.string().trim().max(500).default(""),
      email: z.preprocess((x) => x === "on", z.boolean()),
      active: z.preprocess((x) => x === "on", z.boolean()),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const { event_type, ...fields } = v.data;
  const supabase = await createClient();
  const { error } = await supabase.from("notification_rules").update(fields).eq("event_type", event_type);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/settings/notifications");
  return { message: "Saved." };
}

export async function saveEscalation(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.settings.manage");
  const v = z
    .object({ item_type: z.string().max(60), level: z.coerce.number().int().min(1).max(5), after_working_hours: z.coerce.number().min(1).max(500), active: z.preprocess((x) => x === "on", z.boolean()) })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Enter the number of working hours (1–500)." };
  const { item_type, level, ...fields } = v.data;
  const supabase = await createClient();
  const { error } = await supabase.from("escalation_rules").update(fields).eq("item_type", item_type).eq("level", level);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/settings/notifications");
  return { message: "Saved." };
}

// ---------------------------------------------------------------- numbering and events
export async function saveSeries(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.settings.manage");
  const v = z
    .object({ id: z.string().uuid(), prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/, "Prefix: up to 10 capital letters, numbers or -."), padding: z.coerce.number().int().min(3).max(10) })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const { id, ...fields } = v.data;
  const supabase = await createClient();
  const { error } = await supabase.from("number_series").update(fields).eq("id", id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/settings/numbering");
  return { message: "Saved. New documents use the new format." };
}

export async function retryEvent(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("retry_domain_event", { p_id: Number(form.get("id")) });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin/settings/events");
  return { message: "Retried." };
}
