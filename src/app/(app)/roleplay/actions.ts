"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSettings, requireStaff, requireUser } from "@/lib/auth";
import { canManageUser } from "@/lib/learning/load";
import { getRubric, getScenario, createSession, endAndGrade, roleplayAllowance } from "@/lib/roleplay/service";
import { computeOverall, parseOverrideScores } from "@/lib/roleplay/scoring";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

export async function startRoleplay(_: FormState, form: FormData): Promise<FormState> {
  const profile = await requireUser();
  const scenarioId = z.string().uuid().parse(form.get("scenario_id"));
  const scenario = await getScenario(scenarioId);
  if (!scenario || !scenario.active) return { error: "Scenario not available." };

  // Resume an unfinished session of the same scenario instead of starting another.
  const admin = createAdminClient();
  const { data: open } = await admin
    .from("roleplay_sessions")
    .select("id")
    .eq("user_id", profile.id)
    .eq("scenario_id", scenarioId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (open) redirect(`/roleplay/session/${open.id}`);

  const settings = await getSettings();
  if (!settings) return { error: "Settings missing." };
  const allowance = await roleplayAllowance(profile, settings);
  if (!allowance.canStart) return { error: allowance.reason };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "AI roleplay isn't set up yet (missing API key). Please tell your admin." };

  const id = await createSession(profile, scenario);
  redirect(`/roleplay/session/${id}`);
}

/** Called by the chat when the rep ends the conversation, or after the customer ended it. */
export async function finishRoleplay(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await requireUser();
  const id = z.string().uuid().parse(sessionId);
  const res = await endAndGrade(profile, id);
  revalidatePath(`/roleplay/session/${id}`);
  revalidatePath("/roleplay");
  return res;
}

// ---------------------------------------------------------------- manager review

async function sessionOwnerIfManaged(sessionId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("roleplay_sessions").select("id, user_id, scenario_id, status").eq("id", sessionId).maybeSingle();
  if (!data?.user_id || !(await canManageUser(data.user_id))) return null;
  return data as { id: string; user_id: string; scenario_id: string; status: string };
}

export async function addComment(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireStaff();
  const parsed = z.object({ session_id: z.string().uuid(), body: z.string().trim().min(1, "Write a comment.").max(3000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // RLS checks the manager may comment on this rep's session.
  const supabase = await createClient();
  const { error } = await supabase.from("roleplay_comments").insert({ session_id: parsed.data.session_id, author_id: me.id, body: parsed.data.body });
  if (error) return { error: "You can't comment on this roleplay." };
  await createAdminClient()
    .from("roleplay_sessions")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: me.id })
    .eq("id", parsed.data.session_id)
    .is("reviewed_at", null);
  revalidatePath(`/roleplay/session/${parsed.data.session_id}`);
  revalidatePath("/reviews");
  return { message: "Comment added." };
}

export async function markReviewed(form: FormData) {
  const me = await requireStaff();
  const id = z.string().uuid().parse(form.get("session_id"));
  if (!(await sessionOwnerIfManaged(id))) return;
  await createAdminClient().from("roleplay_sessions").update({ reviewed_at: new Date().toISOString(), reviewed_by: me.id }).eq("id", id);
  revalidatePath(`/roleplay/session/${id}`);
  revalidatePath("/reviews");
}

/**
 * Manager override: adds a new score row (source = manager) and marks it current.
 * The original AI score row is kept unchanged as the audit trail.
 */
export async function overrideScore(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireStaff();
  const raw = Object.fromEntries(form);
  const sessionId = z.string().uuid().parse(raw.session_id);
  const reason = z.string().trim().min(5, "Explain why you are changing the score.").max(2000).safeParse(raw.reason);
  if (!reason.success) return { error: reason.error.issues[0].message };
  const scores = parseOverrideScores(raw);
  if (!scores) return { error: "Every score must be between 1 and 5." };

  const session = await sessionOwnerIfManaged(sessionId);
  if (!session) return { error: "Not allowed." };
  if (session.user_id === me.id) return { error: "You can't override your own roleplay score." };

  const admin = createAdminClient();
  const { data: current } = await admin.from("roleplay_scores").select("*").eq("session_id", sessionId).eq("is_current", true).maybeSingle();
  const scenario = await getScenario(session.scenario_id);
  const rubric = await getRubric(scenario?.rubric_id ?? null);

  await admin.from("roleplay_scores").update({ is_current: false }).eq("session_id", sessionId);
  const { error } = await admin.from("roleplay_scores").insert({
    session_id: sessionId,
    source: "manager",
    scores,
    overall: computeOverall(scores, rubric),
    goal_achieved: form.get("goal_achieved") === "on",
    strengths: current?.strengths ?? [],
    improvements: current?.improvements ?? [],
    factual_errors: current?.factual_errors ?? [],
    summary: current?.summary ?? "",
    reason: reason.data,
    created_by: me.id,
    is_current: true,
  });
  if (error) return { error: error.message };
  await admin.from("roleplay_sessions").update({ status: "graded", reviewed_at: new Date().toISOString(), reviewed_by: me.id }).eq("id", sessionId);
  revalidatePath(`/roleplay/session/${sessionId}`);
  revalidatePath("/reviews");
  return { message: "Score updated. The original AI score is kept in the history." };
}
