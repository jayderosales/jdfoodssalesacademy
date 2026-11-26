import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { KIND_PROMPT, SCHEMAS, SHARED_PROMPT, type ScanKind } from "@/lib/scan/kinds";
import { AiUnavailableError, anthropic, logAiUsage, MODELS } from "./client";

export const READ_DOCUMENT_VERSION = "read-document.v1";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export type ReadResult = { ok: true; data: Record<string, unknown>; notes: string; model: string } | { ok: false; error: string };

/**
 * Reads a photographed or scanned document into the fields for its kind. Never throws: on any failure it returns a
 * plain-English error and the person types the details in themselves.
 */
export async function readDocument(input: { userId: string; scanId: string; kind: ScanKind; bytes: Buffer; mime: string }): Promise<ReadResult> {
  const mime = input.mime.toLowerCase();
  const isPdf = mime === "application/pdf";
  if (!isPdf && !IMAGE_TYPES.includes(mime as ImageType)) return { ok: false, error: "Use a JPG, PNG or WebP photo, or a PDF." };
  const data = input.bytes.toString("base64");
  const file: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mime as ImageType, data } };
  try {
    const model = MODELS.document;
    const response = await anthropic().beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(SCHEMAS[input.kind]) },
      system: SHARED_PROMPT,
      messages: [{ role: "user", content: [file, { type: "text", text: KIND_PROMPT[input.kind] }] }],
    });
    await logAiUsage({ userId: input.userId, feature: "document_scan", model, usage: response.usage, refId: input.scanId });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { ok: false, error: "The document couldn't be read automatically. Type the details in below." };
    }
    if (response.stop_reason === "max_tokens") return { ok: false, error: "The document is too long to read in one go. Type the details in below." };
    const out = response.parsed_output as Record<string, unknown>;
    return { ok: true, data: out, notes: typeof out.notes === "string" ? out.notes : "", model: response.model };
  } catch (e) {
    if (e instanceof AiUnavailableError) return { ok: false, error: "Reading photos isn't switched on yet (no AI key). Type the details in below." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Too many documents are being read right now. Try again in a minute." };
    console.error("readDocument failed", e);
    return { ok: false, error: "The document couldn't be read right now. Try again, or type the details in below." };
  }
}
