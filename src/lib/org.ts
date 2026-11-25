import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Team } from "@/lib/types";

export interface LocationOption {
  id: string;
  name: string;
  type: string;
  holds_inventory: boolean;
  active: boolean;
}

export interface TeamWithLocation extends Team {
  location_name: string | null;
  label: string;
}

export async function listTeams(): Promise<TeamWithLocation[]> {
  const supabase = await createClient();
  const [{ data: teams }, { data: locations }] = await Promise.all([
    supabase.from("teams").select("id, name, location_id, department_id").order("name"),
    supabase.from("locations").select("id, name").order("name"),
  ]);
  const byId = new Map((locations as { id: string; name: string }[] | null)?.map((l) => [l.id, l.name]) ?? []);
  return ((teams as Team[] | null) ?? []).map((t) => {
    const location_name = t.location_id ? (byId.get(t.location_id) ?? null) : null;
    return { ...t, location_name, label: location_name ? `${location_name} · ${t.name}` : t.name };
  });
}

export async function listLocations(): Promise<LocationOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("id, name, type, holds_inventory, active").order("name");
  return (data as LocationOption[] | null) ?? [];
}
