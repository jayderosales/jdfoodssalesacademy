"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const schema = z.object({
  team_id: z.string().uuid("Choose a team."),
  days: z.coerce.number().int().min(1).max(90),
  max_uses: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(500).nullable()),
});

export async function createSignupLink(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireStaff();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { team_id, days, max_uses } = parsed.data;
  // RLS: owner for any team, managers only for teams they manage.
  const supabase = await createClient();
  const { error } = await supabase.from("signup_links").insert({
    team_id,
    created_by: me.id,
    max_uses,
    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
  });
  if (error) return { error: /row-level security/i.test(error.message) ? "You can only create links for teams you manage." : error.message };
  revalidatePath("/signup-links");
  return { message: "Link created. Copy it below and share it with your new reps." };
}

export async function setSignupLinkActive(form: FormData) {
  await requireStaff();
  const id = z.string().uuid().parse(form.get("id"));
  const active = form.get("active") === "true";
  const supabase = await createClient();
  await supabase.from("signup_links").update({ active }).eq("id", id);
  revalidatePath("/signup-links");
}
