"use server";

import { can, getAccess, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface SearchHit {
  href: string;
  label: string;
  hint: string;
}

/** Command-palette search across people. RLS limits results to what the user may see. More record types join per phase. */
export async function searchDirectory(term: string): Promise<SearchHit[]> {
  await requireUser();
  const access = await getAccess();
  const s = term.replace(/[%,()]/g, "").trim().slice(0, 60);
  if (s.length < 2) return [];
  const supabase = await createClient();
  const hits: SearchHit[] = [];

  if (can(access, ["org.view", "readonly.all"])) {
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, employee_no")
      .or(`full_name.ilike.%${s}%,employee_no.ilike.%${s}%`)
      .limit(6);
    for (const e of (data as { id: string; full_name: string; employee_no: string }[] | null) ?? []) {
      hits.push({ href: `/admin/org/employees/${e.id}`, label: e.full_name, hint: `Employee ${e.employee_no}` });
    }
  }
  if (can(access, "admin.users.view")) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").or(`full_name.ilike.%${s}%,email.ilike.%${s}%`).limit(6);
    for (const u of (data as { id: string; full_name: string; email: string }[] | null) ?? []) {
      hits.push({ href: `/admin/users/${u.id}`, label: u.full_name || u.email, hint: "User" });
    }
  } else if (can(access, ["academy.team.manage", "academy.admin"])) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").eq("role", "rep").or(`full_name.ilike.%${s}%,email.ilike.%${s}%`).limit(6);
    for (const u of (data as { id: string; full_name: string; email: string }[] | null) ?? []) {
      hits.push({ href: `/team/${u.id}`, label: u.full_name || u.email, hint: "Rep" });
    }
  }
  return hits;
}
