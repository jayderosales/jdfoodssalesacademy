import { NextResponse, type NextRequest } from "next/server";
import { IDLE_LIMIT_COOKIE, LAST_SEEN_COOKIE } from "@/lib/idle";
import { recordLogin } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createClient();
  const idle = request.nextUrl.searchParams.get("reason") === "idle";
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await recordLogin({ userId: user.id, email: user.email ?? "", method: idle ? "idle_timeout" : "signout", success: true });
  await supabase.auth.signOut();
  request.cookies.delete(LAST_SEEN_COOKIE);
  const error = request.nextUrl.searchParams.get("error");
  const url = new URL("/login", request.nextUrl.origin);
  if (error === "inactive") url.searchParams.set("error", "inactive");
  if (idle) url.searchParams.set("notice", "idle");
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.delete(LAST_SEEN_COOKIE);
  res.cookies.delete(IDLE_LIMIT_COOKIE);
  return res;
}

export const POST = signOut;
// GET is used by server redirects (deactivated accounts) and the idle timer.
export const GET = signOut;
