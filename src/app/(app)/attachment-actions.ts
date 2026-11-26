"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  table: z.string().regex(/^[a-z_]+$/),
  id: z.string().uuid(),
  path: z.string().max(400),
  filename: z.string().min(1).max(200),
  mime: z.string().max(120),
  size: z.number().int().min(1).max(20 * 1024 * 1024),
});

/** Record an uploaded file. RLS checks the user may attach to this record and that the path belongs to it. */
export async function recordAttachment(input: z.infer<typeof schema>): Promise<{ error?: string }> {
  await requireUser();
  const v = schema.safeParse(input);
  if (!v.success) return { error: "That file couldn't be attached." };
  const supabase = await createClient();
  const { error } = await supabase.from("attachments").insert({
    record_table: v.data.table,
    record_id: v.data.id,
    storage_path: v.data.path,
    filename: v.data.filename,
    mime_type: v.data.mime,
    size_bytes: v.data.size,
  });
  if (error) {
    await supabase.storage.from("attachments").remove([v.data.path]);
    return { error: /row-level security/.test(error.message) ? "You can't add files to this record." : error.message };
  }
  return {};
}

export async function deleteAttachment(id: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("attachments").delete().eq("id", z.string().uuid().parse(id)).select("storage_path");
  const path = (data as { storage_path: string }[] | null)?.[0]?.storage_path;
  if (!path) return { error: "You can only remove files you added." };
  await supabase.storage.from("attachments").remove([path]);
  return {};
}
