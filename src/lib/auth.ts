import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accessFromRows, can, NO_ACCESS, type Access, type AccessRow } from "@/lib/rbac/access";
import type { Permission } from "@/lib/rbac/permissions";
import type { AppSettings, Profile, UserRole } from "@/lib/types";

export type { Access } from "@/lib/rbac/access";
export { can } from "@/lib/rbac/access";

/**
 * Signed-in user, their profile and permissions. Cached per request.
 * The own-profile policy needs only an active account (no MFA), so `signedIn && !profile` means "inactive / pending".
 */
export const getAuthState = cache(async (): Promise<{ signedIn: boolean; profile: Profile | null; access: Access }> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, profile: null, access: NO_ACCESS };
  const [{ data }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_access"),
  ]);
  return { signedIn: true, profile: (data as Profile | null) ?? null, access: accessFromRows(rows as AccessRow[] | null) };
});

export async function getCurrentProfile() {
  return (await getAuthState()).profile;
}

export async function getAccess() {
  return (await getAuthState()).access;
}

export const getSettings = cache(async (): Promise<AppSettings | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("*").maybeSingle();
  return (data as AppSettings | null) ?? null;
});

interface RequireOpts {
  /** Academy access levels allowed (legacy Academy pages). */
  roles?: UserRole[];
  /** At least one of these permissions is required. */
  perm?: Permission | Permission[];
  skipConsent?: boolean;
  /** Pages that must work before MFA is complete (the MFA page itself). */
  skipMfa?: boolean;
  /** Allow portal (external) users. Staff-only by default. */
  allowExternal?: boolean;
}

/**
 * Use at the top of every protected page / server action.
 * Signed-out → /login. Deactivated or pending → sign out with a message. Staff without MFA → /mfa.
 * No consent yet → /consent. External users → /portal. Missing permission → /dashboard?error=forbidden.
 */
export async function requireUser(opts: RequireOpts = {}): Promise<Profile> {
  const { signedIn, profile, access } = await getAuthState();
  if (!signedIn) redirect("/login");
  if (!profile || profile.status !== "active") redirect("/auth/signout?error=inactive");

  if (access.mfaRequired && !access.mfaOk && !opts.skipMfa) {
    const here = (await headers()).get("x-pathname") ?? "/dashboard";
    redirect(`/mfa?next=${encodeURIComponent(here)}`);
  }

  if (!access.isInternal && !opts.allowExternal) {
    redirect(profile.account_type === "staff" ? "/no-access" : "/portal");
  }

  if (!opts.skipConsent && access.isInternal) {
    const settings = await getSettings();
    if (!profile.consent_at || (settings && profile.consent_version !== settings.consent_version)) {
      redirect("/consent");
    }
  }

  if (opts.roles && (!profile.role || !opts.roles.includes(profile.role))) redirect("/dashboard?error=forbidden");
  if (opts.perm && !can(access, opts.perm)) redirect("/dashboard?error=forbidden");
  return profile;
}

/** Academy administrator (content, settings, all reps). */
export const requireOwner = () => requireUser({ roles: ["owner"] });
/** Academy administrator or manager. */
export const requireStaff = () => requireUser({ roles: ["owner", "manager"] });
/** Platform permission check for admin pages and actions. */
export const requirePermission = (perm: Permission | Permission[]) => requireUser({ perm });
