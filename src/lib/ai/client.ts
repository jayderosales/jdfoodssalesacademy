import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/server";

/** Model per job, configurable by env var. */
export const MODELS = {
  customer: process.env.AI_MODEL_CUSTOMER || "claude-opus-5-5",
  grader: process.env.AI_MODEL_GRADER || "claude-opus-5-5",
  quiz: process.env.AI_MODEL_QUIZ || "claude-opus-5-5",
} as const;

/** USD per 1M tokens (input, output). Used for the cost dashboard; update if pricing changes. */
const PRICING: Record<string, [number, number]> = {
  "claude-fable-5-2": [8, 40],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const [inP, outP] = PRICING[model] ?? PRICING["claude-opus-5-5"];
  return (inputTokens * inP + outputTokens * outP) / 1_000_000;
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  return client;
}

export class AiUnavailableError extends Error {}

export type AiFeature = "roleplay_customer" | "roleplay_grade" | "quiz_grade" | "quiz_generate";

/** Records token usage + estimated cost for the owner's AI cost report. Never throws. */
export async function logAiUsage(entry: {
  userId: string | null;
  feature: AiFeature;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  refId?: string | null;
}) {
  try {
    const input =
      entry.usage.input_tokens + (entry.usage.cache_creation_input_tokens ?? 0) + (entry.usage.cache_read_input_tokens ?? 0);
    await createAdminClient()
      .from("ai_usage")
      .insert({
        user_id: entry.userId,
        feature: entry.feature,
        model: entry.model,
        input_tokens: input,
        output_tokens: entry.usage.output_tokens,
        cost_usd: estimateCostUsd(entry.model, input, entry.usage.output_tokens),
        ref_id: entry.refId ?? null,
      });
  } catch (e) {
    console.error("logAiUsage failed", e);
  }
}
