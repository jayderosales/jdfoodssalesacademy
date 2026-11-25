import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, logAiUsage, MODELS } from "@/lib/ai/client";
import { formatProductFacts, type ProductFacts } from "@/lib/ai/product-facts";
import { CUSTOMER_PROMPT_VERSION, customerSystemPrompt, parseCustomerReply, type EndReason, type Persona } from "@/lib/ai/prompts/customer";
import { GRADER_PROMPT_VERSION, GRADER_SYSTEM, GraderOutputSchema, graderUserMessage, type RubricCriterion } from "@/lib/ai/prompts/grader";
import { createAdminClient } from "@/lib/supabase/server";
import type { AppSettings, Profile } from "@/lib/types";
import { manilaDayStart, manilaMonthStart } from "@/lib/utils";
import { computeOverall, normalizeGrade } from "./scoring";

export interface Scenario {
  id: string;
  title: string;
  briefing: string;
  customer_opening: string | null;
  persona: Persona;
  product_ids: string[];
  goal: string;
  difficulty: "easy" | "medium" | "hard";
  language: "en" | "taglish";
  max_turns: number;
  rubric_id: string | null;
  active: boolean;
}

export interface SessionRow {
  id: string;
  user_id: string;
  scenario_id: string;
  status: "active" | "ended" | "graded" | "abandoned";
  turns: number;
  end_reason: string | null;
  started_at: string;
  ended_at: string | null;
  reviewed_at: string | null;
}

export interface Message {
  seq: number;
  role: "rep" | "customer";
  content: string;
}

export async function getScenario(id: string): Promise<Scenario | null> {
  const { data } = await createAdminClient().from("scenarios").select("*").eq("id", id).maybeSingle();
  return (data as Scenario | null) ?? null;
}

export async function productFactsFor(ids: string[]): Promise<string> {
  if (!ids.length) return formatProductFacts([]);
  const { data } = await createAdminClient().from("products").select("*").in("id", ids).eq("active", true);
  return formatProductFacts((data ?? []) as ProductFacts[]);
}

export async function getRubric(id: string | null): Promise<RubricCriterion[]> {
  const admin = createAdminClient();
  const q = id
    ? admin.from("rubrics").select("criteria").eq("id", id).maybeSingle()
    : admin.from("rubrics").select("criteria").order("created_at").limit(1).maybeSingle();
  const { data } = await q;
  return ((data?.criteria as RubricCriterion[] | undefined) ?? []).map((c) => ({ ...c, weight: Number(c.weight ?? 1) }));
}

export async function getMessages(sessionId: string): Promise<Message[]> {
  const { data } = await createAdminClient().from("roleplay_messages").select("seq, role, content").eq("session_id", sessionId).order("seq");
  return (data ?? []) as Message[];
}

// ---------------------------------------------------------------- limits

export async function roleplayAllowance(profile: Profile, settings: AppSettings) {
  const admin = createAdminClient();
  const [{ count: today }, { data: spend }] = await Promise.all([
    admin.from("roleplay_sessions").select("id", { count: "exact", head: true }).eq("user_id", profile.id).gte("started_at", manilaDayStart().toISOString()),
    settings.monthly_ai_budget_usd != null
      ? admin.from("ai_usage").select("cost_usd").gte("created_at", manilaMonthStart().toISOString())
      : Promise.resolve({ data: [] as { cost_usd: number }[] }),
  ]);
  const used = today ?? 0;
  const limit = profile.role === "owner" ? null : settings.daily_roleplay_limit;
  const monthSpend = (spend ?? []).reduce((s, r: { cost_usd: number }) => s + Number(r.cost_usd), 0);
  const overBudget = settings.monthly_ai_budget_usd != null && monthSpend >= Number(settings.monthly_ai_budget_usd);
  const remaining = limit == null ? null : Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    overBudget,
    canStart: !overBudget && (remaining == null || remaining > 0),
    reason: overBudget
      ? "The company's monthly AI budget has been reached. Roleplays resume next month or when the owner raises the budget."
      : remaining === 0
        ? `You've used all ${limit} roleplays for today. Come back tomorrow!`
        : undefined,
  };
}

// ---------------------------------------------------------------- session lifecycle

export async function createSession(profile: Profile, scenario: Scenario): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("roleplay_sessions")
    .insert({ user_id: profile.id, scenario_id: scenario.id, customer_prompt_version: CUSTOMER_PROMPT_VERSION, model: MODELS.customer })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (scenario.customer_opening?.trim()) {
    await admin.from("roleplay_messages").insert({ session_id: data.id, seq: 1, role: "customer", content: scenario.customer_opening.trim() });
  }
  return data.id;
}

function toApiMessages(history: Message[], lastTurn: boolean): Anthropic.Beta.BetaMessageParam[] {
  const msgs: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role === "rep" ? "user" : "assistant", content: m.content }));
  if (msgs[0]?.role === "assistant") msgs.unshift({ role: "user", content: "(The conversation starts.)" });
  if (lastTurn) {
    msgs.push({
      role: "system",
      content: "This is the salesperson's final message (turn limit reached). Reply in character, bring the conversation to a natural close, and end with the appropriate end marker.",
    });
  }
  return msgs;
}

export type TurnResult = { ok: true; stream: ReadableStream<Uint8Array> } | { ok: false; status: number; error: string };

/**
 * Saves the rep's message, streams the customer's reply as plain text, then saves the reply and
 * ends the session if the customer ended it or the turn limit was reached.
 */
export async function runTurn(profile: Profile, sessionId: string, text: string): Promise<TurnResult> {
  const admin = createAdminClient();
  const { data: session } = await admin.from("roleplay_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session || session.user_id !== profile.id) return { ok: false, status: 404, error: "Roleplay not found." };
  if (session.status !== "active") return { ok: false, status: 409, error: "This roleplay has ended." };

  const scenario = await getScenario(session.scenario_id);
  if (!scenario) return { ok: false, status: 404, error: "Scenario not found." };

  const history = await getMessages(sessionId);
  const repTurns = history.filter((m) => m.role === "rep").length;
  if (repTurns >= scenario.max_turns) return { ok: false, status: 409, error: "Turn limit reached. End the conversation to get feedback." };

  const nextSeq = (history.at(-1)?.seq ?? 0) + 1;
  const { error: insErr } = await admin.from("roleplay_messages").insert({ session_id: sessionId, seq: nextSeq, role: "rep", content: text });
  if (insErr) return { ok: false, status: 409, error: "Please wait for the customer to reply." }; // unique (session, seq) blocks double sends
  history.push({ seq: nextSeq, role: "rep", content: text });
  const lastTurn = repTurns + 1 >= scenario.max_turns;

  const system = customerSystemPrompt({
    scenarioTitle: scenario.title,
    briefing: scenario.briefing,
    persona: scenario.persona,
    goal: scenario.goal,
    difficulty: scenario.difficulty,
    language: scenario.language,
    maxTurns: scenario.max_turns,
    productFacts: await productFactsFor(scenario.product_ids),
  });

  const encoder = new TextEncoder();
  const model = MODELS.customer;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        const s = anthropic().beta.messages.stream({
          model,
          max_tokens: 4000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          cache_control: { type: "ephemeral" },
          system,
          messages: toApiMessages(history, lastTurn),
        });
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            full += ev.delta.text;
            controller.enqueue(encoder.encode(ev.delta.text));
          }
        }
        const final = await s.finalMessage();
        await logAiUsage({ userId: profile.id, feature: "roleplay_customer", model, usage: final.usage, refId: sessionId });

        if (final.stop_reason === "refusal" || !full.trim()) {
          await admin.from("roleplay_messages").delete().eq("session_id", sessionId).eq("seq", nextSeq);
          controller.enqueue(encoder.encode("\n[[ERROR:The customer didn't reply. Please rephrase your message.]]"));
          controller.close();
          return;
        }

        const { text: reply, end } = parseCustomerReply(full);
        await admin.from("roleplay_messages").insert({ session_id: sessionId, seq: nextSeq + 1, role: "customer", content: reply || "…" });
        const endReason: EndReason | "turn_limit" | null = end ?? (lastTurn ? "turn_limit" : null);
        await admin
          .from("roleplay_sessions")
          .update({
            turns: repTurns + 1,
            last_activity_at: new Date().toISOString(),
            ...(endReason ? { status: "ended", end_reason: endReason, ended_at: new Date().toISOString() } : {}),
          })
          .eq("id", sessionId);
        controller.close();
      } catch (e) {
        console.error("roleplay turn failed", e);
        // Remove the rep message so they can resend it.
        await admin.from("roleplay_messages").delete().eq("session_id", sessionId).eq("seq", nextSeq);
        controller.enqueue(encoder.encode("\n[[ERROR:Connection problem. Your message was not sent. Please try again.]]"));
        controller.close();
      }
    },
  });
  return { ok: true, stream };
}

/** Ends the session (if still active) and grades it. Idempotent: an already graded session is left alone. */
export async function endAndGrade(profile: Profile, sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: session } = await admin.from("roleplay_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session || session.user_id !== profile.id) return { ok: false, error: "Roleplay not found." };
  if (session.status === "graded") return { ok: true };

  if (session.status === "active") {
    await admin
      .from("roleplay_sessions")
      .update({ status: "ended", end_reason: "rep_ended", ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("status", "active");
  }

  const messages = await getMessages(sessionId);
  if (!messages.some((m) => m.role === "rep")) {
    await admin.from("roleplay_sessions").update({ status: "abandoned" }).eq("id", sessionId);
    return { ok: true };
  }

  const scenario = (await getScenario(session.scenario_id))!;
  const rubric = await getRubric(scenario.rubric_id);
  const model = MODELS.grader;
  try {
    const res = await anthropic().beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(GraderOutputSchema) },
      system: GRADER_SYSTEM,
      messages: [
        {
          role: "user",
          content: graderUserMessage({
            scenarioTitle: scenario.title,
            briefing: scenario.briefing,
            goal: scenario.goal,
            difficulty: scenario.difficulty,
            rubric,
            productFacts: await productFactsFor(scenario.product_ids),
            transcript: messages,
            endReason: session.end_reason ?? "rep_ended",
          }),
        },
      ],
    });
    await logAiUsage({ userId: profile.id, feature: "roleplay_grade", model, usage: res.usage, refId: sessionId });

    const grade = res.stop_reason === "refusal" ? null : normalizeGrade(res.parsed_output);
    if (!grade) return { ok: false, error: "The AI couldn't grade this conversation. Your manager can still review it." };

    await admin.from("roleplay_scores").update({ is_current: false }).eq("session_id", sessionId);
    const { error } = await admin.from("roleplay_scores").insert({
      session_id: sessionId,
      source: "ai",
      scores: grade.scores,
      overall: computeOverall(grade.scores, rubric),
      goal_achieved: grade.goal_achieved,
      strengths: grade.strengths,
      improvements: grade.improvements,
      factual_errors: grade.factual_errors,
      summary: grade.summary,
      grader_prompt_version: GRADER_PROMPT_VERSION,
      model,
      is_current: true,
    });
    if (error) return { ok: false, error: error.message };
    await admin.from("roleplay_sessions").update({ status: "graded" }).eq("id", sessionId);

    // First graded roleplay → badge.
    const { data: badge } = await admin.from("badges").select("id").eq("code", "first_roleplay").maybeSingle();
    if (badge) await admin.from("user_badges").upsert({ user_id: profile.id, badge_id: badge.id }, { onConflict: "user_id,badge_id", ignoreDuplicates: true });
    return { ok: true };
  } catch (e) {
    console.error("roleplay grading failed", e);
    return { ok: false, error: "Grading is unavailable right now. Try again in a minute." };
  }
}
