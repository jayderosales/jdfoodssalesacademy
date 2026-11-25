import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuestionForm, type QuestionValues } from "./question-form";

export const metadata = { title: "Edit question" };

export default async function QuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ quiz?: string }> }) {
  const { id } = await params;
  const { quiz } = await searchParams;
  await requireOwner();
  const supabase = await createClient();

  let q: QuestionValues;
  if (id === "new") {
    if (!quiz) notFound();
    q = { quiz_id: quiz, type: "mcq", prompt: "", options: [], correct: [], model_answer: null, explanation: "", competency_tag: null, difficulty: "easy", status: "approved" };
  } else {
    const { data } = await supabase.from("questions").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    q = data as QuestionValues;
  }

  return (
    <>
      <PageHeader
        title={id === "new" ? "Add question" : "Edit question"}
        actions={<Link href={`/admin/content/quizzes/${q.quiz_id}`} className="text-sm text-brand underline">Back to quiz</Link>}
      />
      <Card className="max-w-3xl">
        <QuestionForm q={q} />
      </Card>
    </>
  );
}
