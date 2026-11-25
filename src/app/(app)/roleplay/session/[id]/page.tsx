import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Lightbulb, TriangleAlert, XCircle } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DifficultyBadge, ScoreBadge } from "@/components/roleplay-badges";
import { Alert, Badge, Card, CardTitle, Field, PageHeader, Select, Textarea, buttonVariants } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CRITERIA_KEYS } from "@/lib/ai/prompts/grader";
import { canManageUser, canViewUser } from "@/lib/learning/load";
import { CRITERIA_LABEL } from "@/lib/roleplay/scoring";
import { getMessages, getScenario } from "@/lib/roleplay/service";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addComment, markReviewed, overrideScore } from "../../actions";
import { RoleplayChat } from "./chat";

export const metadata = { title: "Roleplay" };
// Grading runs in a server action on this page and can take 15–30 s.
export const maxDuration = 60;

interface ScoreRow {
  id: string;
  source: "ai" | "manager";
  scores: Record<string, number>;
  overall: number;
  goal_achieved: boolean;
  strengths: string[];
  improvements: { issue: string; better_line: string }[];
  factual_errors: { claim: string; correction: string }[];
  summary: string;
  reason: string | null;
  grader_prompt_version: string | null;
  model: string | null;
  is_current: boolean;
  created_by: string | null;
  created_at: string;
}

const END_LABEL: Record<string, string> = {
  agreed: "The customer agreed",
  declined: "The customer declined",
  left: "The customer left / hung up",
  turn_limit: "Turn limit reached",
  rep_ended: "You ended the conversation",
};

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  const admin = createAdminClient();
  const { data: session } = await admin.from("roleplay_sessions").select("*").eq("id", id).maybeSingle();
  if (!session?.user_id) notFound();
  const isMine = session.user_id === profile.id;
  if (!isMine && !(await canViewUser(session.user_id))) notFound();

  const scenario = await getScenario(session.scenario_id);
  if (!scenario) notFound();
  const messages = await getMessages(id);

  // ---- live chat
  if (session.status === "active" || (session.status === "ended" && isMine)) {
    if (!isMine) return <Alert>This roleplay is still in progress.</Alert>;
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link href="/roleplay" className="text-sm text-muted-foreground hover:text-brand">← Scenarios</Link>
          <DifficultyBadge difficulty={scenario.difficulty} />
        </div>
        <h1 className="text-xl font-bold">{scenario.title}</h1>
        <details className="mb-4 mt-1 rounded-lg border bg-card p-3 text-sm" open={messages.length <= 1}>
          <summary className="cursor-pointer font-medium">Situation &amp; goal</summary>
          <p className="mt-2">{scenario.briefing}</p>
          <p className="mt-2 text-muted-foreground"><strong>Your goal:</strong> {scenario.goal}</p>
        </details>
        <RoleplayChat
          sessionId={id}
          initial={messages.map((m) => ({ role: m.role, content: m.content }))}
          status={session.status}
          maxTurns={scenario.max_turns}
          customerName={scenario.persona.name}
        />
      </div>
    );
  }

  // ---- results
  const [{ data: scoreRows }, { data: comments }, canManage, { data: rep }] = await Promise.all([
    admin.from("roleplay_scores").select("*").eq("session_id", id).order("created_at"),
    admin.from("roleplay_comments").select("id, body, created_at, author_id, profiles(full_name)").eq("session_id", id).order("created_at"),
    isMine ? Promise.resolve(false) : canManageUser(session.user_id),
    admin.from("profiles").select("full_name").eq("id", session.user_id).maybeSingle(),
  ]);
  const scores = (scoreRows ?? []) as ScoreRow[];
  const current = scores.find((s) => s.is_current) ?? null;
  const original = scores.find((s) => s.source === "ai") ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={scenario.title}
        description={`${isMine ? "" : (rep?.full_name ?? "Rep") + " · "}${formatDate(session.started_at, true)} · ${END_LABEL[session.end_reason ?? ""] ?? ""}`}
        actions={<Link href={isMine ? "/roleplay" : "/reviews"} className="text-sm text-brand underline">{isMine ? "All scenarios" : "Review queue"}</Link>}
      />

      {!current ? (
        <Card className="mb-4">
          <p className="text-sm">{session.status === "abandoned" ? "This roleplay was abandoned before any messages were sent." : "This conversation hasn't been scored yet."}</p>
          {isMine && session.status === "ended" && <p className="mt-2 text-sm">Open it again to retry scoring.</p>}
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
              <div className="sm:mr-6">
                <p className="text-5xl font-bold text-brand">{Math.round(Number(current.overall))}</p>
                <p className="text-xs text-muted-foreground">out of 100</p>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap justify-center gap-1 sm:justify-start">
                  <DifficultyBadge difficulty={scenario.difficulty} />
                  {current.goal_achieved ? <Badge tone="success">Goal achieved</Badge> : <Badge tone="danger">Goal not achieved</Badge>}
                  {current.source === "manager" && <Badge tone="brand">Adjusted by manager</Badge>}
                  {session.reviewed_at && <Badge>Reviewed</Badge>}
                </div>
                {current.summary && <p className="text-sm">{current.summary}</p>}
                {current.source === "manager" && current.reason && <p className="text-sm text-muted-foreground"><strong>Manager note:</strong> {current.reason}</p>}
              </div>
            </div>
          </Card>

          <Card className="mb-4">
            <CardTitle>Scores by skill</CardTitle>
            <ul className="space-y-3">
              {CRITERIA_KEYS.map((k) => {
                const v = Number(current.scores[k] ?? 0);
                return (
                  <li key={k}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{CRITERIA_LABEL[k]}</span>
                      <span className="font-semibold">{v}/5</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted" role="meter" aria-valuemin={1} aria-valuemax={5} aria-valuenow={v} aria-label={CRITERIA_LABEL[k]}>
                      <div className={`h-full rounded-full ${v >= 4 ? "bg-success" : v >= 3 ? "bg-brand-2" : "bg-danger"}`} style={{ width: `${(v / 5) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <Card>
              <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" aria-hidden />What went well</CardTitle>
              <ul className="list-disc space-y-1 pl-5 text-sm">{current.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </Card>
            <Card>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="size-5 text-brand-2" aria-hidden />Top improvements</CardTitle>
              <ol className="space-y-3 text-sm">
                {current.improvements.map((imp, i) => (
                  <li key={i}>
                    <p className="font-medium">{i + 1}. {imp.issue}</p>
                    <p className="mt-1 rounded-lg border-l-4 border-brand-2 bg-muted px-3 py-2 italic">&ldquo;{imp.better_line}&rdquo;</p>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          {current.factual_errors.length > 0 && (
            <Card className="mb-4 border-danger/40">
              <CardTitle className="flex items-center gap-2"><TriangleAlert className="size-5 text-danger" aria-hidden />Product facts to fix</CardTitle>
              <ul className="space-y-2 text-sm">
                {current.factual_errors.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <span>You said: &ldquo;{f.claim}&rdquo;. <strong>Correct:</strong> {f.correction}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <Card className="mb-4">
        <details open={!current}>
          <summary className="cursor-pointer font-semibold">Transcript ({messages.length} messages)</summary>
          <div className="mt-3 space-y-2">
            <p className="rounded bg-muted p-2 text-xs"><strong>Situation:</strong> {scenario.briefing} <strong>Goal:</strong> {scenario.goal}</p>
            {messages.map((m) => (
              <div key={m.seq} className={`rounded-lg px-3 py-2 text-sm ${m.role === "rep" ? "ml-8 bg-brand/5" : "mr-8 border"}`}>
                <p className="text-xs font-semibold text-muted-foreground">{m.role === "rep" ? (isMine ? "You" : rep?.full_name ?? "Rep") : scenario.persona.name}</p>
                <p className="whitespace-pre-line">{m.content}</p>
              </div>
            ))}
          </div>
        </details>
      </Card>

      <Card className="mb-4">
        <CardTitle>Manager comments</CardTitle>
        {(comments ?? []).length === 0 && <p className="mb-3 text-sm text-muted-foreground">No comments yet.</p>}
        <ul className="mb-3 space-y-2">
          {(comments as unknown as { id: string; body: string; created_at: string; profiles: { full_name: string } | null }[] ?? []).map((c) => (
            <li key={c.id} className="rounded-lg bg-muted px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">{c.profiles?.full_name ?? "Manager"} · {formatDate(c.created_at, true)}</p>
              <p className="whitespace-pre-line">{c.body}</p>
            </li>
          ))}
        </ul>
        {canManage && (
          <ActionForm action={addComment} submitLabel="Add comment">
            <input type="hidden" name="session_id" value={id} />
            <Textarea name="body" rows={3} placeholder="Coaching notes for the rep…" aria-label="Comment" />
          </ActionForm>
        )}
      </Card>

      {canManage && (
        <Card className="mb-4">
          <CardTitle>Manager review</CardTitle>
          {!session.reviewed_at && (
            <form action={markReviewed} className="mb-4">
              <input type="hidden" name="session_id" value={id} />
              <button className={buttonVariants({ variant: "outline" })}>Mark as reviewed (no changes)</button>
            </form>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-brand underline">Adjust the score</summary>
            <ActionForm action={overrideScore} submitLabel="Save adjusted score" className="mt-3 space-y-3">
              <input type="hidden" name="session_id" value={id} />
              <div className="grid gap-3 sm:grid-cols-2">
                {CRITERIA_KEYS.map((k) => (
                  <Field key={k} label={CRITERIA_LABEL[k]} htmlFor={`score_${k}`}>
                    <Select id={`score_${k}`} name={`score_${k}`} defaultValue={String(current?.scores[k] ?? 3)}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </Select>
                  </Field>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="goal_achieved" defaultChecked={current?.goal_achieved ?? false} className="size-4" /> Goal achieved
              </label>
              <Field label="Reason (shown to the rep)" htmlFor="reason">
                <Textarea id="reason" name="reason" rows={2} required />
              </Field>
            </ActionForm>
          </details>
        </Card>
      )}

      {!isMine && scores.length > 0 && (
        <Card>
          <CardTitle>Score history</CardTitle>
          <ul className="space-y-1 text-sm">
            {scores.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <ScoreBadge overall={Number(s.overall)} />
                <span>{s.source === "ai" ? `AI (${s.grader_prompt_version ?? "?"}, ${s.model ?? "?"})` : "Manager adjustment"}</span>
                <span className="text-muted-foreground">{formatDate(s.created_at, true)}</span>
                {s.is_current && <Badge tone="brand">current</Badge>}
                {s.id === original?.id && !s.is_current && <Badge>original AI score</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isMine && (
        <div className="flex gap-2">
          <Link href="/roleplay" className={buttonVariants({ variant: "outline" })}>Other scenarios</Link>
        </div>
      )}
    </div>
  );
}
