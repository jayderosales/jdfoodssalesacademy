"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { OPTION_IDS } from "@/lib/quiz/constants";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const uuid = z.string().uuid();
const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());
const checkbox = z.preprocess((v) => v === "on", z.boolean());

const quizSchema = z.object({
  title: z.string().trim().min(2).max(200),
  kind: z.enum(["module", "certification", "prehire"]),
  module_id: optionalUuid,
  path_id: optionalUuid,
  pass_pct: z.coerce.number().int().min(1).max(100),
  max_attempts: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(50).nullable()),
  cooldown_hours: z.coerce.number().int().min(0).max(720),
  questions_per_attempt: z.coerce.number().int().min(1).max(100),
  shuffle: checkbox,
  published: checkbox,
});

function quizInput(form: FormData) {
  return { ...Object.fromEntries(form), shuffle: form.get("shuffle"), published: form.get("published") };
}

export async function createQuiz(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = quizSchema.safeParse(quizInput(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.kind === "module" && !parsed.data.module_id) return { error: "Pick the module this quiz belongs to." };
  if (parsed.data.kind === "certification" && !parsed.data.path_id) return { error: "Pick the learning path this exam certifies." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("quizzes").insert(parsed.data).select("id").single();
  if (error) return { error: error.message };
  redirect(`/admin/content/quizzes/${data.id}`);
}

export async function updateQuiz(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = quizSchema.extend({ id: uuid }).safeParse(quizInput(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("quizzes").update(fields).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/content/quizzes/${id}`);
  return { message: "Quiz settings saved." };
}

export async function saveQuestion(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireOwner();
  const base = z
    .object({
      id: optionalUuid,
      quiz_id: uuid,
      type: z.enum(["mcq", "multi", "tf", "short", "scenario"]),
      prompt: z.string().trim().min(5, "Write the question.").max(4000),
      explanation: z.string().trim().max(4000).default(""),
      model_answer: z.string().trim().max(4000).default(""),
      competency_tag: z.preprocess((v) => (v === "" ? null : v), z.string().max(40).nullable()),
      difficulty: z.enum(["easy", "medium", "hard"]),
      status: z.enum(["draft", "approved", "archived"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!base.success) return { error: base.error.issues[0].message };
  const q = base.data;

  let options: { id: string; text: string }[] = [];
  let correct: unknown = null;
  if (q.type === "mcq" || q.type === "multi") {
    options = OPTION_IDS.map((id) => ({ id, text: String(form.get(`option_${id}`) ?? "").trim() })).filter((o) => o.text);
    const ids = new Set(options.map((o) => o.id));
    const picked = form.getAll("correct").map(String).filter((c) => ids.has(c));
    if (options.length < 2) return { error: "Add at least two answer options." };
    if (q.type === "mcq" && picked.length !== 1) return { error: "Multiple choice needs exactly one correct option." };
    if (q.type === "multi" && picked.length < 1) return { error: "Tick at least one correct option." };
    correct = picked;
  } else if (q.type === "tf") {
    const v = form.get("correct_tf");
    if (v !== "true" && v !== "false") return { error: "Choose whether the statement is true or false." };
    correct = v === "true";
  } else if (!q.model_answer) {
    return { error: "AI-graded questions need a model answer to grade against." };
  }

  const row = {
    quiz_id: q.quiz_id,
    type: q.type,
    prompt: q.prompt,
    options,
    correct,
    model_answer: q.model_answer || null,
    explanation: q.explanation,
    competency_tag: q.competency_tag,
    difficulty: q.difficulty,
    status: q.status,
  };
  const supabase = await createClient();
  if (q.id) {
    const { error } = await supabase.from("questions").update(row).eq("id", q.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("questions").insert({ ...row, created_by: me.id });
    if (error) return { error: error.message };
  }
  revalidatePath(`/admin/content/quizzes/${q.quiz_id}`);
  redirect(`/admin/content/quizzes/${q.quiz_id}?saved=1`);
}

export async function setQuestionStatus(form: FormData) {
  await requireOwner();
  const id = uuid.parse(form.get("id"));
  const status = z.enum(["draft", "approved", "archived"]).parse(form.get("status"));
  const supabase = await createClient();
  const { data } = await supabase.from("questions").update({ status }).eq("id", id).select("quiz_id").single();
  if (data) revalidatePath(`/admin/content/quizzes/${data.quiz_id}`);
}
