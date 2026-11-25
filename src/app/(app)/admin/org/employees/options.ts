import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function employeeFormOptions() {
  const supabase = await createClient();
  const [{ data: positions }, { data: departments }, { data: locations }, { data: emps }] = await Promise.all([
    supabase.from("positions").select("id, title").eq("active", true).order("title"),
    supabase.from("departments").select("id, name").eq("active", true).order("name"),
    supabase.from("locations").select("id, name").eq("active", true).order("name"),
    supabase.from("employees").select("id, full_name").neq("status", "inactive").order("full_name"),
  ]);
  return {
    positions: ((positions as { id: string; title: string }[] | null) ?? []).map((p) => ({ id: p.id, name: p.title })),
    departments: (departments as { id: string; name: string }[] | null) ?? [],
    locations: (locations as { id: string; name: string }[] | null) ?? [],
    supervisors: ((emps as { id: string; full_name: string }[] | null) ?? []).map((e) => ({ id: e.id, name: e.full_name })),
  };
}
