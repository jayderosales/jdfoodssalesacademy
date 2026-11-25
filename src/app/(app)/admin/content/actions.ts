"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { renderLesson } from "@/lib/content/render";
import { toEmbedUrl } from "@/lib/quiz/engine";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const title = z.string().trim().min(2, "Title is too short.").max(200);
const uuid = z.string().uuid();
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const CATEGORIES = ["company", "product", "customers", "scripts", "objections", "sop", "general"] as const;

function done(path: string, message = "Saved."): FormState {
  revalidatePath(path);
  return { message };
}

// ---------------------------------------------------------------- learning paths

export async function createPath(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = z.object({ title, description: z.string().max(2000).default("") }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("learning_paths").insert(parsed.data).select("id").single();
  if (error) return { error: error.message };
  redirect(`/admin/content/paths/${data.id}`);
}

export async function updatePath(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = z
    .object({ id: uuid, title, description: z.string().max(2000).default(""), published: checkbox, is_default: checkbox })
    .safeParse({ ...Object.fromEntries(form), published: form.get("published"), is_default: form.get("is_default") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  if (fields.is_default) await supabase.from("learning_paths").update({ is_default: false }).neq("id", id);
  const { error } = await supabase.from("learning_paths").update(fields).eq("id", id);
  if (error) return { error: error.message };
  return done(`/admin/content/paths/${id}`);
}

// ---------------------------------------------------------------- modules

const moduleFields = z.object({
  title,
  description: z.string().max(2000).default(""),
  category: z.enum(CATEGORIES),
  sequential_unlock: checkbox,
});

export async function createModule(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = moduleFields
    .extend({ path_id: uuid })
    .safeParse({ ...Object.fromEntries(form), sequential_unlock: form.get("sequential_unlock") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: last } = await supabase.from("modules").select("sort").eq("path_id", parsed.data.path_id).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("modules").insert({ ...parsed.data, sort: (last?.sort ?? 0) + 1 });
  if (error) return { error: error.message };
  return done(`/admin/content/paths/${parsed.data.path_id}`, "Module added.");
}

export async function updateModule(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = moduleFields
    .extend({ id: uuid, path_id: uuid })
    .safeParse({ ...Object.fromEntries(form), sequential_unlock: form.get("sequential_unlock") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, path_id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("modules").update(fields).eq("id", id);
  if (error) return { error: error.message };
  return done(`/admin/content/paths/${path_id}`);
}

export async function deleteModule(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const id = uuid.parse(form.get("id"));
  const supabase = await createClient();
  const { count } = await supabase.from("lessons").select("id", { count: "exact", head: true }).eq("module_id", id);
  if (count) return { error: "Delete or move this module's lessons first." };
  const { data } = await supabase.from("modules").delete().eq("id", id).select("path_id").maybeSingle();
  return done(`/admin/content/paths/${data?.path_id}`, "Module deleted.");
}

/** Swap `sort` with the neighbour above/below. */
async function move(table: "modules" | "lessons", parentKey: "path_id" | "module_id", id: string, dir: "up" | "down") {
  const supabase = await createClient();
  const { data: row } = await supabase.from(table).select(`id, sort, ${parentKey}`).eq("id", id).single();
  if (!row) return null;
  const r = row as unknown as { id: string; sort: number } & Record<string, string>;
  const { data: neighbour } = await supabase
    .from(table)
    .select("id, sort")
    .eq(parentKey, r[parentKey])
    [dir === "up" ? "lt" : "gt"]("sort", r.sort)
    .order("sort", { ascending: dir !== "up" })
    .limit(1)
    .maybeSingle();
  if (neighbour) {
    await supabase.from(table).update({ sort: neighbour.sort }).eq("id", r.id);
    await supabase.from(table).update({ sort: r.sort }).eq("id", neighbour.id);
  }
  return r[parentKey];
}

export async function moveModule(form: FormData) {
  await requireOwner();
  const pathId = await move("modules", "path_id", uuid.parse(form.get("id")), form.get("dir") === "up" ? "up" : "down");
  revalidatePath(`/admin/content/paths/${pathId}`);
}

// ---------------------------------------------------------------- lessons

export async function createLesson(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = z.object({ module_id: uuid, title }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: last } = await supabase.from("lessons").select("sort").eq("module_id", parsed.data.module_id).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("lessons").insert({ ...parsed.data, sort: (last?.sort ?? 0) + 1 }).select("id").single();
  if (error) return { error: error.message };
  redirect(`/admin/content/lessons/${data.id}`);
}

export async function moveLesson(form: FormData) {
  await requireOwner();
  await move("lessons", "module_id", uuid.parse(form.get("id")), form.get("dir") === "up" ? "up" : "down");
  revalidatePath(`/admin/content/paths/${form.get("path_id")}`);
}

export async function saveLesson(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = z
    .object({
      id: uuid,
      title,
      est_minutes: z.coerce.number().int().min(1).max(240),
      video_url: z.string().trim().max(500).default(""),
      published: checkbox,
      content: z.string().max(2_000_000),
    })
    .safeParse({ ...Object.fromEntries(form), published: form.get("published") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, content, video_url, ...fields } = parsed.data;
  if (video_url && !toEmbedUrl(video_url)) return { error: "Video link must be a YouTube or Vimeo https link." };

  let rendered: ReturnType<typeof renderLesson> | null = null;
  if (content) {
    try {
      rendered = renderLesson(JSON.parse(content));
    } catch {
      return { error: "Couldn't read the lesson content. Please try again." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .update({
      ...fields,
      video_url: video_url || null,
      ...(rendered ? { content_json: rendered.json, content_html: rendered.html } : {}),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/learn/lessons/${id}`);
  return done(`/admin/content/lessons/${id}`, "Lesson saved.");
}

export async function deleteLesson(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const id = uuid.parse(form.get("id"));
  const supabase = await createClient();
  const { count } = await supabase.from("lesson_progress").select("user_id", { count: "exact", head: true }).eq("lesson_id", id);
  if (count) return { error: `${count} rep(s) have progress on this lesson. Unpublish it instead so their history is kept.` };
  const { data: lesson } = await supabase.from("lessons").select("module_id, modules(path_id)").eq("id", id).single();
  const { error } = await supabase.from("lessons").delete().eq("id", id);
  if (error) return { error: error.message };
  const pathId = (lesson as unknown as { modules: { path_id: string } | null })?.modules?.path_id;
  redirect(pathId ? `/admin/content/paths/${pathId}` : "/admin/content");
}

// ---------------------------------------------------------------- media

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-").slice(-80);
}

/** Uploads an image placed inside lesson text; returns its public URL. */
export async function uploadLessonImage(form: FormData): Promise<{ url?: string; error?: string }> {
  await requireOwner();
  const file = form.get("file");
  const lessonId = uuid.parse(form.get("lesson_id"));
  if (!(file instanceof File) || !IMAGE_TYPES.includes(file.type)) return { error: "Images must be PNG, JPG, WebP or GIF." };
  if (file.size > 5 * 1024 * 1024) return { error: "Images must be under 5 MB." };
  const supabase = await createClient();
  const path = `lessons/${lessonId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from("lesson-media").upload(path, file, { contentType: file.type });
  if (error) return { error: error.message };
  return { url: supabase.storage.from("lesson-media").getPublicUrl(path).data.publicUrl };
}

const ATTACHMENT_TYPES: Record<string, "pdf" | "image" | "file"> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "file",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "file",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "file",
  "application/vnd.ms-excel": "file",
  "text/csv": "file",
  "video/mp4": "file",
};

export async function uploadAttachment(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const lessonId = uuid.parse(form.get("lesson_id"));
  const file = form.get("file");
  const label = String(form.get("label") ?? "").trim().slice(0, 120);
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  const kind = ATTACHMENT_TYPES[file.type];
  if (!kind) return { error: "Allowed: PDF, images, Word, Excel, PowerPoint, CSV, MP4." };
  if (file.size > 9.5 * 1024 * 1024) return { error: "Files must be under 9.5 MB. For long videos, upload to YouTube (unlisted) and paste the link." };
  const supabase = await createClient();
  const path = `lessons/${lessonId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from("content").upload(path, file, { contentType: file.type });
  if (error) return { error: error.message };
  const { error: dbError } = await supabase.from("lesson_assets").insert({ lesson_id: lessonId, storage_path: path, kind, label: label || file.name });
  if (dbError) return { error: dbError.message };
  return done(`/admin/content/lessons/${lessonId}`, "File attached.");
}

export async function deleteAttachment(form: FormData) {
  await requireOwner();
  const id = uuid.parse(form.get("id"));
  const supabase = await createClient();
  const { data } = await supabase.from("lesson_assets").delete().eq("id", id).select("storage_path, lesson_id").single();
  if (data) {
    await supabase.storage.from("content").remove([data.storage_path]);
    revalidatePath(`/admin/content/lessons/${data.lesson_id}`);
  }
}
