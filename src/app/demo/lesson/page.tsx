import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Alert, Button, Card, buttonVariants } from "@/components/ui";
import { demoLessonHtml } from "../data";

export const metadata = { title: "Lesson" };

export default function DemoLesson() {
  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/demo/learn" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-brand">
        <ChevronLeft className="size-4" aria-hidden /> Objection Handling
      </Link>
      <h1 className="mb-1 text-2xl font-bold leading-tight">&ldquo;Mas mura sa iba&rdquo; (price)</h1>
      <p className="mb-6 text-sm text-muted-foreground">About 6 min</p>
      <Card>
        {/* sample lesson content from the seed (trusted, static) */}
        <div className="lesson-content" dangerouslySetInnerHTML={{ __html: demoLessonHtml }} />
      </Card>
      <Card className="mt-4">
        <h2 className="mb-2 font-semibold">Downloads</h2>
        <span className="flex min-h-10 items-center gap-2 text-sm text-brand underline">
          <FileText className="size-4" aria-hidden /> Price objection cheat sheet (PDF)
        </span>
      </Card>
      <div className="mt-6 space-y-3">
        <Button size="lg" className="w-full" disabled title="Disabled in the preview">Mark as complete</Button>
        <Alert>In the real app this saves your progress and unlocks the next lesson.</Alert>
        <nav className="flex justify-between gap-2" aria-label="Lesson navigation">
          <Link href="/demo/learn" className={buttonVariants({ variant: "outline" })}><ChevronLeft className="size-4" aria-hidden /> Previous</Link>
          <Link href="/demo/learn" className={buttonVariants()}>Next <ChevronRight className="size-4" aria-hidden /></Link>
        </nav>
      </div>
    </article>
  );
}
