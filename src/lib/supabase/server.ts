import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Supabase client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are refreshed by middleware instead.
        }
      },
    },
  });
}

/**
 * Service-role client: bypasses RLS. Only use after the caller's permission has been checked
 * (e.g. creating auth users, writing grading results). Never import into client components.
 */
export const SERVICE_KEY_HELP =
  "The server's Supabase secret key is missing or wrong. Add SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API Keys → service_role) to Vercel's Environment Variables (or .env.local when running locally), then redeploy or restart.";

/** True when the service-role key is absent or still a placeholder. */
export function serviceKeyMissing() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return !key || /PASTE|placeholder/i.test(key);
}

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || serviceKeyMissing()) throw new Error(SERVICE_KEY_HELP);
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
