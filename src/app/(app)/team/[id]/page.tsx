import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ProgressBar } from "@/components/progress-bar";
import { Badge, Card, CardTitle, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { canManageUser, loadLearnerState } from "@/lib/learning/load";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { setAssignments } from "../actions";
import { DifficultyBadge, ScoreBadge, StatusBadge } from "@/components/roleplay-badges";
import { listSessions } from "@/lib/roleplay/queries";

export const metadata = { title: "Rep details" };

function minutes(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default async function RepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStaff();
  const supabase = await createClient();
  // RLS: managers only get rows for their own reps.
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const rep = data as Profile;
  if (!(await canManageUser(id))) notFound();

  const admin = createAdminClient();
  const [state, { data: paths }, { data: assigned }, { data: progress }, { data: attempts }] = await Promise.all([
    loadLearnerState(id),
    admin.from("learning_paths").select("id, title, is_default").eq("published", true).order("created_at"),
    admin.from("path_assignments").select("path_id, due_date").eq("user_id", id),
    admin.from("lesson_progress").select("time_spent_sec, status").eq("user_id", id),
    admin.from("quiz_attempts").select("id, submitted_at, score_pct, passed, needs_review, quizzes(title)").eq("user_id", id).not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(30),
  ]);
  const roleplays = await listSessions({ userId: id, limit: 20 });
  const assignedMap = new Map((assigned ?? []).map((a: { path_id: string; due_date: string | null }) => [a.path_id, a.due_date]));
  const totalTime = (progress ?? []).reduce((s: number, p: { time_spent_sec: number }) => s + p.time_spent_sec, 0);

  return (
    <>
      <PageHeader
        title={rep.full_name || rep.email}
        description={`Hired ${formatDate(rep.hire_date)} · last active ${formatDate(rep.last_active_at, true)}`}
        actions={
          <div className="flex gap-3 text-sm">
            {me.role === "owner" && <Link href={`/admin/users/${id}`} className="text-brand underline">Edit account</Link>}
            <Link href="/team" className="text-brand underline">Back to team</Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Onboarding progress</CardTitle>
            <p className="mb-3 text-sm text-muted-foreground">Time spent on lessons: {minutes(totalTime)}</p>
            {state.trees.length === 0 && <p className="text-sm text-muted-foreground">No learning path assigned.</p>}
            <div className="space-y-4">
              {state.trees.map((t) => {
                const a = state.access.get(t.id)!;
                return (
                  <div key={t.id}>
                    <p className="mb-1 font-medium">{t.title}{t.due_date && <span className="text-xs font-normal text-muted-foreground"> · due {formatDate(t.due_date)}</span>}</p>
                    <ProgressBar value={a.completed} max={a.total} label="Lessons" />
                    <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                      {t.modules.map((m) => {
                        const ma = a.modules.get(m.id)!;
                        return (
                          <li key={m.id} className="flex items-center justify-between gap-2">
                            <span className="truncate">{m.title}</span>
                            <Badge tone={ma.done ? "success" : ma.locked ? "neutral" : "brand"}>{ma.completed}/{ma.total}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardTitle>Quiz attempts</CardTitle>
            {!attempts?.length ? (
              <p className="text-sm text-muted-foreground">No quizzes taken yet.</p>
            ) : (
              <Table>
                <thead><tr><Th>Quiz</Th><Th>Date</Th><Th>Score</Th><Th>Result</Th></tr></thead>
                <tbody>
                  {(attempts as unknown as { id: string; submitted_at: string; score_pct: number | null; passed: boolean | null; needs_review: boolean; quizzes: { title: string } | null }[]).map((a) => (
                    <tr key={a.id}>
                      <Td><Link href={`/quizzes/attempt/${a.id}`} className="text-brand underline">{a.quizzes?.title ?? "Quiz"}</Link></Td>
                      <Td>{formatDate(a.submitted_at, true)}</Td>
                      <Td>{a.score_pct != null ? `${a.score_pct}%` : "—"}</Td>
                      <Td>{a.needs_review ? <Badge tone="warning">needs your review</Badge> : a.passed ? <Badge tone="success">passed</Badge> : <Badge tone="danger">not passed</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardTitle>Roleplays</CardTitle>
            {roleplays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roleplays yet.</p>
            ) : (
              <Table>
                <thead><tr><Th>Scenario</Th><Th>Date</Th><Th>Score</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {roleplays.map((s) => (
                    <tr key={s.id}>
                      <Td><Link href={`/roleplay/session/${s.id}`} className="text-brand underline">{s.scenario_title}</Link> <DifficultyBadge difficulty={s.difficulty} /></Td>
                      <Td>{formatDate(s.started_at, true)}</Td>
                      <Td><ScoreBadge overall={s.overall} /></Td>
                      <Td>{s.reviewed_at ? <Badge>reviewed</Badge> : <StatusBadge status={s.status} />}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardTitle>Learning paths</CardTitle>
          <ActionForm action={setAssignments} submitLabel="Save paths">
            <input type="hidden" name="user_id" value={id} />
            <p className="text-xs text-muted-foreground">The default path applies to everyone automatically. Tick it here to give this rep a due date.</p>
            {(paths ?? []).map((p: { id: string; title: string; is_default: boolean }) => (
              <div key={p.id} className="space-y-1 rounded-lg border p-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="path_ids" value={p.id} defaultChecked={assignedMap.has(p.id)} className="size-4" />
                  {p.title} {p.is_default && <Badge tone="brand">default</Badge>}
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Due
                  <Input type="date" name={`due_${p.id}`} defaultValue={assignedMap.get(p.id) ?? ""} className="min-h-8 py-1" />
                </label>
              </div>
            ))}
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
