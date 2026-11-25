"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { canManageUser } from "@/lib/learning/load";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

/** Replace a rep's path assignments (RLS also limits managers to their own reps). */
export async function setAssignments(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireStaff();
  const userId = z.string().uuid().parse(form.get("user_id"));
  if (!(await canManageUser(userId))) return { error: "Not allowed." };
  const pathIds = z.array(z.string().uuid()).parse(form.getAll("path_ids"));
  const due = (pid: string) => {
    const v = String(form.get(`due_${pid}`) ?? "");
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("path_assignments").select("path_id").eq("user_id", userId);
  const remove = (existing ?? []).map((e: { path_id: string }) => e.path_id).filter((p) => !pathIds.includes(p));
  if (remove.length) {
    const { error } = await supabase.from("path_assignments").delete().eq("user_id", userId).in("path_id", remove);
    if (error) return { error: error.message };
  }
  if (pathIds.length) {
    const { error } = await supabase
      .from("path_assignments")
      .upsert(pathIds.map((path_id) => ({ user_id: userId, path_id, due_date: due(path_id), assigned_by: me.id })), { onConflict: "user_id,path_id" });
    if (error) return { error: error.message };
  }
  revalidatePath(`/team/${userId}`);
  return { message: "Learning paths saved." };
}
