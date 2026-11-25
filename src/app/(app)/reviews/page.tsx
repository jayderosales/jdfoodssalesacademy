import Link from "next/link";
import { DifficultyBadge, ScoreBadge, StatusBadge } from "@/components/roleplay-badges";
import { Badge, Button, Card, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { listSessions } from "@/lib/roleplay/queries";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show = "todo" } = await searchParams;
  const me = await requireStaff();
  const supabase = await createClient();
  // RLS: managers only see reps on their teams; the owner sees all.
  const { data: reps } = await supabase.from("profiles").select("id, full_name, email").eq("role", "rep");
  const repIds = (reps ?? []).map((r: { id: string }) => r.id).filter((rid) => rid !== me.id);
  const name = new Map((reps ?? []).map((r: { id: string; full_name: string; email: string }) => [r.id, r.full_name || r.email]));

  let sessions = await listSessions({ userIds: repIds, limit: 200, status: ["graded", "ended"] });
  if (show === "todo") sessions = sessions.filter((s) => !s.reviewed_at);

  // Quiz answers the AI couldn't grade also need a manager.
  const { data: quizReviews } = repIds.length
    ? await createAdminClient()
        .from("quiz_attempts")
        .select("id, user_id, submitted_at, quizzes(title)")
        .in("user_id", repIds)
        .eq("needs_review", true)
        .order("submitted_at", { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <>
      <PageHeader title="Reviews" description="Roleplays to review, and quiz answers the AI couldn't grade." />

      {!!quizReviews?.length && (
        <Card className="mb-4">
          <h2 className="mb-2 font-semibold">Quiz answers waiting for you</h2>
          <ul className="space-y-1 text-sm">
            {(quizReviews as unknown as { id: string; user_id: string; submitted_at: string; quizzes: { title: string } | null }[]).map((q) => (
              <li key={q.id}>
                <Link href={`/quizzes/attempt/${q.id}`} className="text-brand underline">{name.get(q.user_id)}: {q.quizzes?.title}</Link>
                <span className="ml-2 text-muted-foreground">{formatDate(q.submitted_at, true)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <form className="mb-4 flex gap-2">
          <Select name="show" defaultValue={show} aria-label="Show" className="max-w-xs">
            <option value="todo">Not yet reviewed</option>
            <option value="all">All scored roleplays</option>
          </Select>
          <Button type="submit" variant="outline">Show</Button>
        </form>
        {sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{show === "todo" ? "All caught up! 🎉" : "No roleplays yet."}</p>
        ) : (
          <Table>
            <thead><tr><Th>Rep</Th><Th>Scenario</Th><Th>Date</Th><Th>Score</Th><Th>Status</Th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{name.get(s.user_id)}</Td>
                  <Td>
                    <Link href={`/roleplay/session/${s.id}`} className="text-brand underline">{s.scenario_title}</Link>
                    <div className="mt-1"><DifficultyBadge difficulty={s.difficulty} /></div>
                  </Td>
                  <Td>{formatDate(s.started_at, true)}</Td>
                  <Td><ScoreBadge overall={s.overall} />{s.score_source === "manager" && <Badge className="ml-1">adjusted</Badge>}</Td>
                  <Td>{s.reviewed_at ? <Badge>reviewed</Badge> : <StatusBadge status={s.status} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
