import Link from "next/link";
import { CheckCircle2, Lightbulb } from "lucide-react";
import { DifficultyBadge } from "@/components/roleplay-badges";
import { Badge, Card, CardTitle, Field, PageHeader, Select, Textarea, buttonVariants } from "@/components/ui";
import { CRITERIA, demoResult, demoScript } from "../data";

export const metadata = { title: "Roleplay results" };

export default async function DemoResults({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const manager = view === "manager";
  const r = demoResult;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Aling Nena's carinderia: switching chili garlic"
        description={`${manager ? "Ana Reyes · " : ""}Today, 2:41 PM · The customer agreed`}
        actions={<Link href={manager ? "/demo/manager" : "/demo/roleplay"} className="text-sm text-brand underline">{manager ? "Review queue" : "All scenarios"}</Link>}
      />

      <Card className="mb-4">
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
          <div className="sm:mr-6">
            <p className="text-5xl font-bold text-brand">{r.overall}</p>
            <p className="text-xs text-muted-foreground">out of 100</p>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap justify-center gap-1 sm:justify-start">
              <DifficultyBadge difficulty="easy" />
              <Badge tone="success">Goal achieved</Badge>
            </div>
            <p className="text-sm">{r.summary}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <CardTitle>Scores by skill</CardTitle>
        <ul className="space-y-3">
          {CRITERIA.map(([k, label]) => {
            const v = r.scores[k];
            return (
              <li key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-semibold">{v}/5</span></div>
                <div className="h-2 rounded-full bg-muted" role="meter" aria-valuemin={1} aria-valuemax={5} aria-valuenow={v} aria-label={label}>
                  <div className={`h-full rounded-full ${v >= 4 ? "bg-success" : v >= 3 ? "bg-brand-2" : "bg-danger"}`} style={{ width: `${(v / 5) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Overall = average of the 7 skills × 20 (calculated by the app, not the AI).</p>
      </Card>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" aria-hidden />What went well</CardTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </Card>
        <Card>
          <CardTitle className="flex items-center gap-2"><Lightbulb className="size-5 text-brand-2" aria-hidden />Top improvements</CardTitle>
          <ol className="space-y-3 text-sm">
            {r.improvements.map((imp, i) => (
              <li key={i}>
                <p className="font-medium">{i + 1}. {imp.issue}</p>
                <p className="mt-1 rounded-lg border-l-4 border-brand-2 bg-muted px-3 py-2 italic">&ldquo;{imp.better_line}&rdquo;</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="mb-4">
        <details>
          <summary className="cursor-pointer font-semibold">Transcript ({demoScript.length * 2} messages)</summary>
          <div className="mt-3 space-y-2">
            {demoScript.flatMap((l, i) => [
              <div key={`r${i}`} className="ml-8 rounded-lg bg-brand/5 px-3 py-2 text-sm"><p className="text-xs font-semibold text-muted-foreground">{manager ? "Ana Reyes" : "You"}</p>{l.rep}</div>,
              <div key={`c${i}`} className="mr-8 rounded-lg border px-3 py-2 text-sm"><p className="text-xs font-semibold text-muted-foreground">Aling Nena</p>{l.customer}</div>,
            ])}
          </div>
        </details>
      </Card>

      {manager ? (
        <>
          <Card className="mb-4">
            <CardTitle>Manager comments</CardTitle>
            <Textarea rows={3} placeholder="Coaching notes for the rep…" aria-label="Comment" disabled />
            <button className={buttonVariants({ className: "mt-3" })} disabled>Add comment</button>
          </Card>
          <Card className="mb-4">
            <CardTitle>Manager review</CardTitle>
            <button className={buttonVariants({ variant: "outline", className: "mb-4" })} disabled>Mark as reviewed (no changes)</button>
            <p className="mb-2 text-sm font-medium">Adjust the score</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {CRITERIA.map(([k, label]) => (
                <Field key={k} label={label} htmlFor={`s-${k}`}>
                  <Select id={`s-${k}`} defaultValue={String(r.scores[k])} disabled>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Adjusting adds a new score with your reason. The original AI score is kept in the history.</p>
          </Card>
          <Card>
            <CardTitle>Score history</CardTitle>
            <p className="text-sm">77/100 · AI (grader.v1, claude-opus-5-5) · Today 2:42 PM <Badge tone="brand">current</Badge></p>
          </Card>
        </>
      ) : (
        <Card className="mb-4">
          <CardTitle>Manager comments</CardTitle>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm"><span className="block text-xs text-muted-foreground">Ramon (Sales Manager) · Today 4:10 PM</span>Great discovery question about the oily chili garlic! Practice giving the exact price from the list.</p>
        </Card>
      )}
    </div>
  );
}
