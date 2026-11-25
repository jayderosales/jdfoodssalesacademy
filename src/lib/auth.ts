import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppSettings, Profile, UserRole } from "@/lib/types";

/**
 * Signed-in user and their profile. Cached per request.
 * RLS hides the profile of a deactivated user, so `signedIn && !profile` means "inactive".
 */
export const getAuthState = cache(async (): Promise<{ signedIn: boolean; profile: Profile | null }> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, profile: null };
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { signedIn: true, profile: (data as Profile | null) ?? null };
});

export async function getCurrentProfile() {
  return (await getAuthState()).profile;
}

export const getSettings = cache(async (): Promise<AppSettings | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("*").maybeSingle();
  return (data as AppSettings | null) ?? null;
});

/**
 * Use at the top of every protected page / server action.
 * Signed-out → /login. Deactivated → /login?error=inactive. No consent yet → /consent.
 */
export async function requireUser(opts: { roles?: UserRole[]; skipConsent?: boolean } = {}): Promise<Profile> {
  const { signedIn, profile } = await getAuthState();
  if (!signedIn) redirect("/login");
  if (!profile || profile.status !== "active") redirect("/auth/signout?error=inactive");

  if (!opts.skipConsent) {
    const settings = await getSettings();
    if (!profile.consent_at || (settings && profile.consent_version !== settings.consent_version)) {
      redirect("/consent");
    }
  }

  if (opts.roles && !opts.roles.includes(profile.role)) redirect("/dashboard?error=forbidden");
  return profile;
}

export const requireOwner = () => requireUser({ roles: ["owner"] });
export const requireStaff = () => requireUser({ roles: ["owner", "manager"] });
