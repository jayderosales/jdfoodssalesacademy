"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

/**
 * Saves targets from a form of fields named `t:<YYYY-MM-01>:<repId|company>`. Blank = no target (removes it).
 */
export async function saveTargets(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("ceo.reports.view");
  const entries = [...form.entries()].filter(([k]) => k.startsWith("t:"));
  const wanted: { month: string; rep: string | null; amount: string | null }[] = [];
  for (const [k, v] of entries) {
    const [, month, who] = k.split(":");
    if (!/^\d{4}-\d{2}-01$/.test(month) || !(who === "company" || z.string().uuid().safeParse(who).success)) return { error: "Something in the form isn't valid." };
    const raw = String(v ?? "").trim();
    const amount = raw === "" ? null : parseMoney(raw);
    if (raw !== "" && amount == null) return { error: `Check the amount for ${month.slice(0, 7)}: "${raw}".` };
    wanted.push({ month, rep: who === "company" ? null : who, amount });
  }
  if (!wanted.length) return { error: "Nothing to save." };
  const supabase = await createClient();
  const months = [...new Set(wanted.map((w) => w.month))];
  const { data: existing } = await supabase.from("sales_targets").select("id, month, rep_id, amount").in("month", months);
  const ex = (existing as { id: string; month: string; rep_id: string | null; amount: string }[] | null) ?? [];
  let changed = 0;
  for (const w of wanted) {
    const cur = ex.find((e) => e.month === w.month && (e.rep_id ?? null) === w.rep);
    if (!cur && w.amount == null) continue;
    if (cur && w.amount == null) {
      const { error } = await supabase.from("sales_targets").delete().eq("id", cur.id);
      if (error) return { error: error.message };
      changed++;
    } else if (cur && Number(cur.amount) !== Number(w.amount)) {
      const { error } = await supabase.from("sales_targets").update({ amount: w.amount }).eq("id", cur.id);
      if (error) return { error: error.message };
      changed++;
    } else if (!cur) {
      const { error } = await supabase.from("sales_targets").insert({ month: w.month, rep_id: w.rep, amount: w.amount });
      if (error) return { error: error.message };
      changed++;
    }
  }
  revalidatePath("/ceo", "layout");
  return { message: changed ? `${changed} target(s) saved.` : "No changes." };
}
