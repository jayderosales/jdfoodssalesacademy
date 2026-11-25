"use server";

import { z } from "zod";
import { siteUrl } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export type RegisterState = { error?: string; done?: boolean; email?: string };

const schema = z.object({
  account_type: z.enum(["customer", "distributor", "supplier"]),
  company_name: z.string().trim().min(2, "Enter your business name.").max(160),
  full_name: z.string().trim().min(2, "Enter your full name.").max(120),
  phone: z.string().trim().min(7, "Enter a mobile number we can reach you on.").max(40),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  note: z.string().trim().max(1000).optional(),
  agree: z.literal("on", { message: "Please accept the privacy statement." }),
});

/**
 * Customer / distributor / supplier self-registration. The database trigger creates an inactive "pending" profile
 * with no roles; an administrator approves it under Users.
 */
export async function register(_: RegisterState, form: FormData): Promise<RegisterState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, ...meta } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { account_type: meta.account_type, company_name: meta.company_name, full_name: meta.full_name, phone: meta.phone, note: meta.note ?? "" },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/portal&flow=signup`,
    },
  });
  if (error) {
    if (/signups? not allowed|signup is disabled/i.test(error.message)) return { error: "Online registration is switched off right now. Please contact JD Foods directly." };
    if (/already registered|already exists/i.test(error.message)) return { error: "That email already has an account. Sign in instead." };
    if (/rate limit/i.test(error.message)) return { error: "Too many requests right now. Please try again in a few minutes." };
    return { error: error.message };
  }
  // A pending account can't see anything; don't leave it signed in.
  if (data.session) await supabase.auth.signOut();
  return { done: true, email };
}
