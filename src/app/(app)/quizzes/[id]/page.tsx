import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getQuiz, quizStatus } from "@/lib/quiz/service";
import { formatDate } from "@/lib/utils";
import { startAttempt } from "../actions";

export const metadata = { title: "Quiz" };

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  const quiz = await getQuiz(id);
  if (!quiz || quiz.kind === "prehire" || (!quiz.published && profile.role === "rep")) notFound();
  const { unlocked, availability, attempts, bestScore } = await quizStatus(quiz, profile);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={quiz.title} actions={<Link href="/quizzes" className="text-sm text-brand underline">All quizzes</Link>} />
      {profile.role !== "rep" && <div className="mb-4"><Alert>Staff preview: you can take this quiz to test it. Your attempts don&apos;t count toward any level.</Alert></div>}

      <Card className="mb-4">
        <ul className="mb-4 space-y-1 text-sm">
          <li>{quiz.questions_per_attempt} questions{quiz.shuffle ? ", drawn at random, so each try is different" : ""}</li>
          <li>Pass mark: <strong>{quiz.pass_pct}%</strong></li>
          <li>Attempts: {quiz.max_attempts ? `${availability.attemptsUsed} of ${quiz.max_attempts} used` : "unlimited"}</li>
          {quiz.cooldown_hours > 0 && <li>After a failed try, wait {quiz.cooldown_hours} hour(s) before trying again</li>}
          {bestScore != null && <li>Your best score: <strong>{bestScore}%</strong> {availability.passed && <Badge tone="success">Passed</Badge>}</li>}
        </ul>

        {!unlocked.open ? (
          <Alert>{unlocked.reason}</Alert>
        ) : availability.canStart ? (
          <ActionForm action={startAttempt} submitLabel={availability.openAttemptId ? "Continue your attempt" : availability.passed ? "Retake to improve" : "Start quiz"}>
            <input type="hidden" name="quiz_id" value={quiz.id} />
          </ActionForm>
        ) : (
          <Alert>
            {availability.reason}
            {availability.cooldownEndsAt && <> You can try again from {formatDate(availability.cooldownEndsAt, true)}.</>}
          </Alert>
        )}
      </Card>

      {attempts.some((a) => a.submitted_at) && (
        <Card>
          <CardTitle>Your attempts</CardTitle>
          <Table className="min-w-0">
            <thead>
              <tr><Th>Date</Th><Th>Score</Th><Th>Result</Th></tr>
            </thead>
            <tbody>
              {attempts.filter((a) => a.submitted_at).map((a) => (
                <tr key={a.id}>
                  <Td><Link href={`/quizzes/attempt/${a.id}`} className="text-brand underline">{formatDate(a.submitted_at, true)}</Link></Td>
                  <Td>{a.score_pct != null ? `${a.score_pct}%` : "—"}</Td>
                  <Td>
                    {a.needs_review ? <Badge tone="warning">being reviewed</Badge> : a.passed ? <Badge tone="success">passed</Badge> : <Badge tone="danger">not passed</Badge>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
