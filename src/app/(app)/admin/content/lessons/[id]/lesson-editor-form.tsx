"use client";

import { useActionState } from "react";
import type { JSONContent } from "@tiptap/react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Alert, Button, Field, Input } from "@/components/ui";
import { saveLesson, uploadLessonImage, type FormState } from "../../actions";

export function LessonEditorForm({
  lesson,
}: {
  lesson: { id: string; title: string; est_minutes: number; video_url: string | null; published: boolean; content_json: JSONContent | null; content_html: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLesson, {});

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("lesson_id", lesson.id);
    const res = await uploadLessonImage(fd);
    if (res.error) alert(res.error);
    return res.url ?? null;
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={lesson.id} />
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="Lesson title" htmlFor="title">
          <Input id="title" name="title" defaultValue={lesson.title} required />
        </Field>
        <Field label="Minutes" htmlFor="est_minutes">
          <Input id="est_minutes" name="est_minutes" type="number" min={1} max={240} defaultValue={lesson.est_minutes} />
        </Field>
      </div>
      <Field label="Video (optional)" htmlFor="video_url" hint="YouTube or Vimeo link, shown above the lesson text. Unlisted YouTube videos work well.">
        <Input id="video_url" name="video_url" type="url" defaultValue={lesson.video_url ?? ""} placeholder="https://youtu.be/…" />
      </Field>
      <div>
        <p className="mb-1 text-sm font-medium">Content</p>
        <RichTextEditor name="content" initial={lesson.content_json ?? lesson.content_html} onUploadImage={upload} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={lesson.published} className="size-4" /> Published (visible to reps)
      </label>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.message && <Alert tone="success">{state.message}</Alert>}
      <Button type="submit" disabled={pending} size="lg">{pending ? "Saving…" : "Save lesson"}</Button>
    </form>
  );
}
