import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const error = request.nextUrl.searchParams.get("error");
  const url = new URL("/login", request.nextUrl.origin);
  if (error === "inactive") url.searchParams.set("error", "inactive");
  return NextResponse.redirect(url, { status: 303 });
}

export const POST = signOut;
// GET is used only by the server redirect for deactivated accounts.
export const GET = signOut;
