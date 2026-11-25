import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, PageHeader, Table, Td, Th, buttonVariants } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { moduleOptions, pathOptions } from "@/lib/content/queries";
import { createClient } from "@/lib/supabase/server";
import { createQuiz } from "./actions";
import { QuizFields } from "./quiz-fields";

export const metadata = { title: "Quizzes" };

export default async function QuizzesAdminPage() {
  await requireOwner();
  const supabase = await createClient();
  const [{ data }, modules, paths] = await Promise.all([
    supabase.from("quizzes").select("id, title, kind, pass_pct, published, module_id, questions(status)").order("created_at"),
    moduleOptions(),
    pathOptions(),
  ]);
  const moduleLabel = new Map(modules.map((m) => [m.id, m.label]));
  const quizzes = (data ?? []) as { id: string; title: string; kind: string; pass_pct: number; published: boolean; module_id: string | null; questions: { status: string }[] }[];

  return (
    <>
      <PageHeader title="Quizzes & question bank" actions={<Link href="/admin/content" className={buttonVariants({ variant: "outline" })}>Back</Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Quiz</Th>
                <Th>Pass</Th>
                <Th>Bank</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map((q) => {
                const approved = q.questions.filter((x) => x.status === "approved").length;
                const drafts = q.questions.filter((x) => x.status === "draft").length;
                return (
                  <tr key={q.id}>
                    <Td>
                      <Link href={`/admin/content/quizzes/${q.id}`} className="font-medium text-brand underline">{q.title}</Link>
                      <div className="text-xs text-muted-foreground">
                        {q.kind === "certification" ? "Certification exam" : q.module_id ? moduleLabel.get(q.module_id) : q.kind}
                      </div>
                    </Td>
                    <Td>{q.pass_pct}%</Td>
                    <Td>
                      {approved} approved{drafts ? <Badge tone="warning" className="ml-1">{drafts} draft</Badge> : null}
                    </Td>
                    <Td><Badge tone={q.published ? "success" : "neutral"}>{q.published ? "published" : "hidden"}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {quizzes.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No quizzes yet.</p>}
        </Card>
        <Card className="h-fit">
          <CardTitle>New quiz</CardTitle>
          <ActionForm action={createQuiz} submitLabel="Create quiz">
            <QuizFields modules={modules} paths={paths} />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
