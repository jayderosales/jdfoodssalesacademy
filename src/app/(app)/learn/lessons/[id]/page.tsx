import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, FileText, Pencil } from "lucide-react";
import { Alert, Button, Card, buttonVariants } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadLearnerState, pathForLesson } from "@/lib/learning/load";
import { toEmbedUrl } from "@/lib/quiz/engine";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { completeLesson } from "../../actions";
import { LessonTimer } from "./lesson-timer";

export const metadata = { title: "Lesson" };

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  const isRep = profile.role === "rep";
  const supabase = await createClient();

  // RLS: reps only see published lessons; staff can preview drafts.
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title, content_html, video_url, est_minutes, published, module_id, modules(title)")
    .eq("id", id)
    .maybeSingle();
  if (!lesson) notFound();

  let prevId: string | null = null;
  let nextId: string | null = null;
  let completed = false;
  let moduleQuizId: string | null = null;

  if (isRep) {
    const state = await loadLearnerState(profile.id);
    const path = pathForLesson(state, id);
    const access = path ? state.access.get(path.id)?.lessons.get(id) : null;
    if (!access) notFound(); // not in this rep's learning paths
    if (access.locked) redirect("/learn?locked=1");
    ({ prevId, nextId, completed } = access);

    // Opening an unlocked lesson starts progress tracking.
    await createAdminClient()
      .from("lesson_progress")
      .upsert({ user_id: profile.id, lesson_id: id, status: "in_progress" }, { onConflict: "user_id,lesson_id", ignoreDuplicates: true });

    // After the last lesson of a module, point to the module quiz.
    const mod = path!.modules.find((m) => m.id === lesson.module_id);
    if (mod && mod.lessons[mod.lessons.length - 1]?.id === id) {
      const { data: quiz } = await supabase.from("quizzes").select("id").eq("module_id", mod.id).eq("published", true).eq("kind", "module").limit(1).maybeSingle();
      moduleQuizId = quiz?.id ?? null;
    }
  }

  const { data: assets } = await supabase.from("lesson_assets").select("id, label, kind, storage_path").eq("lesson_id", id).order("created_at");
  const signed = assets?.length
    ? (await supabase.storage.from("content").createSignedUrls(assets.map((a: { storage_path: string }) => a.storage_path), 3600)).data ?? []
    : [];
  const embed = toEmbedUrl(lesson.video_url);
  const moduleTitle = (lesson as unknown as { modules: { title: string } | null }).modules?.title;

  return (
    <article className="mx-auto max-w-3xl">
      {isRep && <LessonTimer lessonId={id} />}
      <div className="mb-4 flex items-center justify-between gap-2 text-sm">
        <Link href="/learn" className="flex items-center gap-1 text-muted-foreground hover:text-brand">
          <ChevronLeft className="size-4" aria-hidden /> {moduleTitle ?? "Learn"}
        </Link>
        {profile.role === "owner" && (
          <Link href={`/admin/content/lessons/${id}`} className="flex items-center gap-1 text-brand underline">
            <Pencil className="size-3" aria-hidden /> Edit
          </Link>
        )}
      </div>

      {!lesson.published && <div className="mb-4"><Alert>Draft. Reps can't see this lesson yet.</Alert></div>}

      <h1 className="mb-1 text-2xl font-bold leading-tight">{lesson.title}</h1>
      <p className="mb-6 text-sm text-muted-foreground">About {lesson.est_minutes} min</p>

      {embed && (
        <div className="mb-6 overflow-hidden rounded-xl bg-black">
          <iframe
            src={embed}
            title={`Video: ${lesson.title}`}
            className="aspect-video w-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}

      {/* content_html is produced server-side from sanitized editor JSON (or trusted seed content). */}
      <Card>
        <div className="lesson-content" dangerouslySetInnerHTML={{ __html: lesson.content_html || "<p>No content yet.</p>" }} />
      </Card>

      {!!assets?.length && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold">Downloads</h2>
          <ul className="space-y-1">
            {assets.map((a: { id: string; label: string; kind: string; storage_path: string }) => {
              const url = signed.find((s) => s.path === a.storage_path)?.signedUrl;
              return (
                <li key={a.id}>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2 text-sm text-brand underline">
                      {a.kind === "pdf" ? <FileText className="size-4" aria-hidden /> : <Download className="size-4" aria-hidden />}
                      {a.label}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">{a.label} (unavailable)</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {isRep && (
        <div className="mt-6 space-y-3">
          {completed ? (
            <Alert tone="success">You&apos;ve completed this lesson.</Alert>
          ) : (
            <form action={completeLesson}>
              <input type="hidden" name="lesson_id" value={id} />
              <Button type="submit" size="lg" className="w-full">Mark as complete</Button>
            </form>
          )}
          {completed && moduleQuizId && (
            <Link href={`/quizzes/${moduleQuizId}`} className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full" })}>
              Take the module quiz
            </Link>
          )}
          <nav className="flex justify-between gap-2" aria-label="Lesson navigation">
            {prevId ? (
              <Link href={`/learn/lessons/${prevId}`} className={buttonVariants({ variant: "outline" })}>
                <ChevronLeft className="size-4" aria-hidden /> Previous
              </Link>
            ) : <span />}
            {nextId && completed ? (
              <Link href={`/learn/lessons/${nextId}`} className={buttonVariants()}>
                Next <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : <span />}
          </nav>
        </div>
      )}
    </article>
  );
}
