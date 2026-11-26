import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Dropdown options shared by inventory forms. */
export async function catalogOptions() {
  const supabase = await createClient();
  const [{ data: brands }, { data: categories }, { data: units }, { data: locations }] = await Promise.all([
    supabase.from("brands").select("id, name").eq("active", true).order("name"),
    supabase.from("product_categories").select("id, name").order("name"),
    supabase.from("units").select("code, name").order("name"),
    supabase.from("locations").select("id, name, type").eq("active", true).eq("holds_inventory", true).order("name"),
  ]);
  return {
    brands: (brands as { id: string; name: string }[] | null) ?? [],
    categories: (categories as { id: string; name: string }[] | null) ?? [],
    units: (units as { code: string; name: string }[] | null) ?? [],
    locations: (locations as { id: string; name: string; type: string }[] | null) ?? [],
  };
}
