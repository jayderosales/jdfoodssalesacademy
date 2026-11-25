"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for the browser (signed-in user's session; RLS applies). Used for MFA enrolment/verification. */
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
