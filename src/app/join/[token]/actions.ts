"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export type JoinState = { error?: string; done?: boolean; email?: string };

const schema = z.object({
  token: z.string().regex(/^[0-9a-f]{20,64}$/),
  full_name: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  agree: z.literal("on", { message: "Please accept the data privacy notice." }),
});

export async function joinWithLink(_: JoinState, form: FormData): Promise<JoinState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { token, full_name, email, password } = parsed.data;

  const supabase = await createClient();
  const { data: info } = await supabase.rpc("signup_link_info", { p_token: token });
  const link = (info as { team_name: string; valid: boolean }[] | null)?.[0];
  if (!link?.valid) return { error: "This sign-up link has expired or been switched off. Ask your manager for a new one." };

  // The database trigger checks the token again and places the new account on the link's team.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { signup_token: token, full_name },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard`,
    },
  });
  if (error) {
    if (/signups? not allowed|signup is disabled/i.test(error.message)) {
      return { error: "Sign-ups are switched off in Supabase. Ask the owner to turn on “Allow new users to sign up”." };
    }
    if (/already registered|already exists/i.test(error.message)) return { error: "That email already has an account. Sign in instead." };
    if (/rate limit/i.test(error.message)) return { error: "Too many sign-ups right now. Please try again in a few minutes." };
    return { error: error.message };
  }
  if (data.session) redirect("/dashboard"); // email confirmation is off: signed in right away
  return { done: true, email };
}
