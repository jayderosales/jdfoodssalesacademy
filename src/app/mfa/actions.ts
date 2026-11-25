"use server";

import { createClient } from "@/lib/supabase/server";
import { recordLogin } from "@/lib/security";

/** Log the outcome of a two-step sign-in attempt (enrolment or code check). */
export async function recordMfaResult(success: boolean, enrolling: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await recordLogin({
    userId: user.id,
    email: user.email ?? "",
    method: "mfa",
    success,
    reason: success ? (enrolling ? "enrolled" : "") : "wrong code",
  });
}
