"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours must be hex values like #c8102e.");
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const brandingSchema = z.object({
  company_name: z.string().trim().min(2).max(80),
  brand_primary: hex,
  brand_secondary: hex,
  brand_accent: hex,
});

export async function saveBranding(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = brandingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const update: Record<string, unknown> = { ...parsed.data };
  const logo = form.get("logo");
  const supabase = await createClient();
  if (logo instanceof File && logo.size > 0) {
    // SVG excluded on purpose: it can carry scripts.
    if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type)) return { error: "Logo must be PNG, JPG or WebP." };
    if (logo.size > 1024 * 1024) return { error: "Logo must be under 1 MB." };
    const ext = logo.name.split(".").pop()?.toLowerCase().replace(/[^a-z]/g, "") || "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, logo, { contentType: logo.type, upsert: false });
    if (error) return { error: `Logo upload failed: ${error.message}` };
    update.logo_path = path;
  }

  const { error } = await supabase.from("app_settings").update(update).eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { message: "Branding saved." };
}

const scoringSchema = z
  .object({
    weight_quiz: int(0, 100),
    weight_roleplay: int(0, 100),
    weight_kpi: int(0, 100),
    daily_roleplay_limit: int(0, 200),
    monthly_ai_budget_usd: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0).nullable()),
    at_risk_inactive_days: int(1, 60),
    at_risk_failed_attempts: int(1, 20),
    onboarding_target_days: int(1, 365),
  })
  .refine((v) => v.weight_quiz + v.weight_roleplay + v.weight_kpi === 100, { message: "Skill score weights must add up to 100." });

export async function saveScoring(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = scoringSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").update(parsed.data).eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { message: "Scoring and limits saved." };
}

const privacySchema = z.object({
  consent_text: z.string().trim().min(50, "The notice looks too short.").max(20000),
  consent_version: z.string().trim().min(1).max(20),
  dpo_contact: z.string().trim().min(2).max(200),
  data_retention_years: int(1, 20),
});

export async function savePrivacy(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = privacySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: before } = await supabase.from("app_settings").select("consent_version").maybeSingle();
  const { error } = await supabase.from("app_settings").update(parsed.data).eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  const bumped = before?.consent_version !== parsed.data.consent_version;
  return { message: bumped ? "Saved. Everyone will be asked to accept the new notice version at their next visit." : "Saved." };
}
