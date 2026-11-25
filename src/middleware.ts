import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { IDLE_LIMIT_COOKIE, LAST_SEEN_COOKIE, serverSessionExpired } from "@/lib/idle";

// /demo is the sample-data preview; its layout returns 404 in production unless ENABLE_DEMO=1.
const PUBLIC_PATHS = ["/login", "/auth", "/prehire", "/demo", "/join", "/register", "/offline"];

/**
 * Refreshes the Supabase session cookie, sends signed-out visitors to /login, and signs out sessions that have been
 * idle longer than their limit (the browser timer does this too; this is the server-side backstop).
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Lets server components know the current URL (used to return to it after two-step sign-in).
  request.headers.set("x-pathname", path + request.nextUrl.search);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (user && !isPublic) {
    const now = Date.now();
    if (serverSessionExpired(request.cookies.get(LAST_SEEN_COOKIE)?.value, request.cookies.get(IDLE_LIMIT_COOKIE)?.value, now)) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "You were signed out after a period of inactivity. Please sign in again.", code: "signed_out" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/auth/signout";
      url.search = "?reason=idle";
      return NextResponse.redirect(url);
    }
    response.cookies.set(LAST_SEEN_COOKIE, String(now), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  }

  // API calls (e.g. the roleplay chat) get a JSON 401 instead of a redirect to the HTML sign-in page.
  if (!user && path.startsWith("/api/")) {
    return NextResponse.json({ error: "Your sign-in has expired. Please sign in again.", code: "signed_out" }, { status: 401 });
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
