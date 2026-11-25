import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

/** Handles magic links, invites, sign-up confirmations and password resets (PKCE `code` or `token_hash`). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const flow = searchParams.get("flow"); // set by our own emailRedirectTo, e.g. "signup"

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (!ok) {
    // For sign-ups, Supabase has already confirmed the email before redirecting here. The code exchange
    // only fails when the link is opened in a different browser/app than the one used to sign up.
    if (flow === "signup" || type === "signup" || type === "email") {
      return NextResponse.redirect(`${origin}/login?notice=confirmed`);
    }
    return NextResponse.redirect(`${origin}/login?error=link`);
  }
  // Invited users and password resets go set a password first.
  const dest = type === "invite" || type === "recovery" ? "/account?setPassword=1" : next;
  return NextResponse.redirect(`${origin}${dest}`);
}
