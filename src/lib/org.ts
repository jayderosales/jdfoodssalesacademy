import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Branch, Team } from "@/lib/types";

export interface TeamWithBranch extends Team {
  branch_name: string | null;
  label: string;
}

export async function listTeams(): Promise<TeamWithBranch[]> {
  const supabase = await createClient();
  const [{ data: teams }, { data: branches }] = await Promise.all([
    supabase.from("teams").select("id, name, branch_id").order("name"),
    supabase.from("branches").select("id, name").order("name"),
  ]);
  const byId = new Map((branches as Branch[] | null)?.map((b) => [b.id, b.name]) ?? []);
  return ((teams as Team[] | null) ?? []).map((t) => {
    const branch_name = t.branch_id ? byId.get(t.branch_id) ?? null : null;
    return { ...t, branch_name, label: branch_name ? `${branch_name} · ${t.name}` : t.name };
  });
}

export async function listBranches(): Promise<Branch[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("branches").select("id, name").order("name");
  return (data as Branch[] | null) ?? [];
}
