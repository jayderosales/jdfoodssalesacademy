"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { loadLearnerState, pathForLesson } from "@/lib/learning/load";
import { createAdminClient } from "@/lib/supabase/server";

const MAX_HEARTBEAT_SEC = 60;

/** Heartbeat from the lesson page while it is visible. Capped so a bad client can't inflate time. */
export async function trackLessonTime(lessonId: string, seconds: number) {
  const profile = await requireUser();
  if (profile.role !== "rep") return;
  const id = z.string().uuid().parse(lessonId);
  const secs = Math.max(0, Math.min(MAX_HEARTBEAT_SEC, Math.round(Number(seconds) || 0)));
  if (!secs) return;
  const admin = createAdminClient();
  const { data: row } = await admin.from("lesson_progress").select("time_spent_sec").eq("user_id", profile.id).eq("lesson_id", id).maybeSingle();
  if (!row) return; // row is created when the lesson is opened (only if unlocked)
  await admin.from("lesson_progress").update({ time_spent_sec: row.time_spent_sec + secs }).eq("user_id", profile.id).eq("lesson_id", id);
}

export async function completeLesson(form: FormData) {
  const profile = await requireUser();
  const id = z.string().uuid().parse(form.get("lesson_id"));
  if (profile.role !== "rep") return;

  const state = await loadLearnerState(profile.id);
  const path = pathForLesson(state, id);
  const access = path ? state.access.get(path.id)?.lessons.get(id) : null;
  if (!access || access.locked) return; // not in the rep's path, or not unlocked yet

  const admin = createAdminClient();
  await admin.from("lesson_progress").upsert(
    { user_id: profile.id, lesson_id: id, status: "completed", completed_at: new Date().toISOString() },
    { onConflict: "user_id,lesson_id" },
  );
  revalidatePath("/learn");
  revalidatePath(`/learn/lessons/${id}`);
}
