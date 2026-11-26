"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveView(tableKey: string, name: string, query: string, shared: boolean): Promise<{ error?: string }> {
  await requireUser();
  const parsed = z
    .object({ tableKey: z.string().regex(/^[a-z_]+$/), name: z.string().trim().min(1).max(60), query: z.string().max(1000).regex(/^(\?.*)?$/) })
    .safeParse({ tableKey, name, query });
  if (!parsed.success) return { error: "Enter a name (up to 60 characters)." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("saved_views")
    .upsert({ table_key: parsed.data.tableKey, name: parsed.data.name, query: parsed.data.query, shared }, { onConflict: "user_id,table_key,name" });
  return error ? { error: error.message } : {};
}

export async function deleteSavedView(id: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("saved_views").delete().eq("id", z.string().uuid().parse(id));
}

export async function listSavedViews(tableKey: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("saved_views").select("id, name, query, user_id").eq("table_key", tableKey).order("name");
  return ((data as { id: string; name: string; query: string; user_id: string }[] | null) ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    query: v.query,
    mine: v.user_id === userId,
  }));
}
