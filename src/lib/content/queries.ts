import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Modules labelled "Path › Module" for select lists. */
export async function moduleOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("modules").select("id, title, sort, learning_paths(title)").order("sort");
  return ((data ?? []) as unknown as { id: string; title: string; learning_paths: { title: string } | null }[]).map((m) => ({
    id: m.id,
    label: `${m.learning_paths?.title ?? "?"} › ${m.title}`,
  }));
}

export async function pathOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("learning_paths").select("id, title").order("created_at");
  return (data ?? []) as { id: string; title: string }[];
}
