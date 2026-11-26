"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markAllNotificationsRead() {
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: null });
  revalidatePath("/notifications");
}

export async function markNotificationRead(id: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: [z.string().uuid().parse(id)] });
}

export type FormState = { error?: string; message?: string };

/** Save the person's on/off choices for optional notifications. */
export async function savePreferences(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const supabase = await createClient();
  const { data: rules } = await supabase.from("notification_rules").select("event_type, mandatory").eq("active", true);
  const rows = ((rules as { event_type: string; mandatory: boolean }[] | null) ?? [])
    .filter((r) => !r.mandatory)
    .map((r) => ({ user_id: me.id, event_type: r.event_type, in_app: form.get(`in_app:${r.event_type}`) === "on", email: form.get(`email:${r.event_type}`) === "on" }));
  if (rows.length) {
    const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,event_type" });
    if (error) return { error: error.message };
  }
  revalidatePath("/notifications");
  return { message: "Saved." };
}
