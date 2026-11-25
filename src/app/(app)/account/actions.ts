"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

export async function updateName(_: FormState, form: FormData): Promise<FormState> {
  const profile = await requireUser();
  const parsed = z.string().trim().min(2, "Name is too short.").max(120).safeParse(form.get("full_name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data }).eq("id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { message: "Name updated." };
}

export async function setPassword(_: FormState, form: FormData): Promise<FormState> {
  await requireUser({ skipConsent: true });
  const parsed = z
    .object({
      password: z.string().min(8, "Use at least 8 characters."),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match." })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  return { message: "Password saved. You can now sign in with your email and password." };
}

/** Remove one of your own remembered devices (you'll get a new-device email next time it signs in). */
export async function forgetDevice(_: FormState, form: FormData): Promise<FormState> {
  const profile = await requireUser();
  const deviceId = String(form.get("device_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("user_devices").delete().eq("user_id", profile.id).eq("device_id", deviceId);
  if (error) return { error: error.message };
  revalidatePath("/account");
  return { message: "Device removed." };
}
