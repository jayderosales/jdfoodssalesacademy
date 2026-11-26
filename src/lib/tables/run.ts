import "server-only";
import { createClient } from "@/lib/supabase/server";
import { applyTableParams, parseTableParams, type TableDef } from "@/lib/table";

/** Run a table definition for a list page: parses the URL, applies filters/sort/paging (RLS applies), returns rows + total. */
export async function runTable<Row>(def: TableDef<Row>, searchParams: Record<string, string | string[] | undefined>, extra?: (q: never) => never) {
  const params = parseTableParams(def as TableDef<never>, searchParams);
  const supabase = await createClient();
  let base = supabase.from(def.table).select(def.select, { count: "exact" }) as unknown as Parameters<typeof applyTableParams>[0];
  if (extra) base = extra(base as never);
  const { data, count, error } = (await applyTableParams(base, def as TableDef<never>, params)) as unknown as {
    data: Row[] | null;
    count: number | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return { params, rows: data ?? [], count: count ?? 0 };
}
