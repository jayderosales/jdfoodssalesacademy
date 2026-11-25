import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteAttachment, deleteLesson, uploadAttachment } from "../../actions";
import { LessonEditorForm } from "./lesson-editor-form";

export const metadata = { title: "Edit lesson" };

export default async function LessonEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOwner();
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title, est_minutes, video_url, published, content_json, content_html, module_id, modules(title, path_id)")
    .eq("id", id)
    .maybeSingle();
  if (!lesson) notFound();
  const mod = (lesson as unknown as { modules: { title: string; path_id: string } | null }).modules;
  const { data: assets } = await supabase.from("lesson_assets").select("id, label, kind").eq("lesson_id", id).order("created_at");

  return (
    <>
      <PageHeader
        title="Edit lesson"
        description={mod ? `Module: ${mod.title}` : undefined}
        actions={
          <div className="flex gap-3 text-sm">
            <Link href={`/learn/lessons/${id}`} className="text-brand underline">Preview</Link>
            {mod && <Link href={`/admin/content/paths/${mod.path_id}`} className="text-brand underline">Back to path</Link>}
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <LessonEditorForm lesson={lesson as never} />
        </Card>
        <div className="space-y-4">
          <Card>
            <CardTitle>Downloads</CardTitle>
            <ul className="mb-4 space-y-2">
              {(assets ?? []).map((a: { id: string; label: string; kind: string }) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <Paperclip className="size-4 text-muted-foreground" aria-hidden />
                  <span className="flex-1 truncate">{a.label}</span>
                  <span className="text-xs uppercase text-muted-foreground">{a.kind}</span>
                  <form action={deleteAttachment}>
                    <input type="hidden" name="id" value={a.id} />
                    <button aria-label={`Remove ${a.label}`} className="rounded p-1 hover:bg-muted">
                      <Trash2 className="size-4 text-danger" />
                    </button>
                  </form>
                </li>
              ))}
              {!assets?.length && <li className="text-sm text-muted-foreground">No files attached.</li>}
            </ul>
            <ActionForm action={uploadAttachment} submitLabel="Attach file" variant="outline">
              <input type="hidden" name="lesson_id" value={id} />
              <Field label="File" htmlFor="file" hint="PDF, image, Office file or short MP4 (under 9.5 MB).">
                <Input id="file" name="file" type="file" required />
              </Field>
              <Field label="Label (optional)" htmlFor="label">
                <Input id="label" name="label" placeholder="e.g. ThyChef price list" />
              </Field>
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Delete lesson</CardTitle>
            <ActionForm action={deleteLesson} submitLabel="Delete lesson" variant="danger" confirm="Delete this lesson permanently?">
              <input type="hidden" name="id" value={id} />
              <p className="text-sm text-muted-foreground">Only possible if no rep has opened it yet. Otherwise, unpublish it.</p>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
