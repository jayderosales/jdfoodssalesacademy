import Link from "next/link";
import { DifficultyBadge, ScoreBadge } from "@/components/roleplay-badges";
import { ProgressBar } from "@/components/progress-bar";
import { Alert, Badge, Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { demoReviewQueue, demoTeam } from "../data";

export const metadata = { title: "Manager view" };

const HEAT: [string, number[]][] = [
  ["Opening & rapport", [4.2, 3.9, 4.0, 3.1, 2.5]],
  ["Needs discovery", [4.0, 3.4, 4.0, 2.8, 2.0]],
  ["Product knowledge", [4.5, 3.6, 3.0, 3.2, 1.8]],
  ["Value & benefits", [3.8, 3.1, 3.0, 2.6, 2.0]],
  ["Objection handling", [3.9, 3.0, 4.0, 2.4, 1.5]],
  ["Closing", [4.1, 3.3, 4.0, 2.2, 1.7]],
];

const heatColor = (v: number) => (v >= 4 ? "bg-success/25" : v >= 3 ? "bg-brand-3/40" : v >= 2.5 ? "bg-brand-2/30" : "bg-danger/25");

export default function DemoManager() {
  return (
    <>
      <PageHeader title="My team" description="Sales Team A · Main Office" />
      <div className="mb-4">
        <Alert>Level, skill score, at-risk flags and the skills heatmap are Phase 4 features, shown here with sample numbers.</Alert>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card><CardTitle>Active reps</CardTitle><p className="text-3xl font-bold text-brand">5</p></Card>
        <Card><CardTitle>Roleplays awaiting review</CardTitle><p className="text-3xl font-bold text-brand">{demoReviewQueue.length}</p></Card>
        <Card><CardTitle>At risk</CardTitle><p className="text-3xl font-bold text-danger">2</p></Card>
      </div>

      <Card className="mb-4">
        <CardTitle>Team</CardTitle>
        <Table>
          <thead><tr><Th>Name</Th><Th>Hired</Th><Th>Level</Th><Th>Skill score</Th><Th>Onboarding</Th><Th>Last active</Th></tr></thead>
          <tbody>
            {demoTeam.map((r) => (
              <tr key={r.name}>
                <Td>
                  <span className="font-medium text-brand underline">{r.name}</span>
                  {r.atRisk && <div><Badge tone="danger">at risk: {r.atRisk}</Badge></div>}
                </Td>
                <Td>{formatDate(r.hired)}</Td>
                <Td>L{r.level} · {r.levelName}</Td>
                <Td><ScoreBadge overall={r.score} /></Td>
                <Td className="min-w-28"><ProgressBar value={r.onboarding} max={100} /></Td>
                <Td>{r.lastActive}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Roleplays to review</CardTitle>
          <ul className="divide-y">
            {demoReviewQueue.map((q) => (
              <li key={q.rep + q.scenario} className="flex items-center gap-2 py-2 text-sm">
                <div className="flex-1">
                  <Link href="/demo/results?view=manager" className="font-medium text-brand underline">{q.rep}</Link>
                  <p className="text-xs text-muted-foreground">{q.scenario} · {q.date}</p>
                </div>
                <DifficultyBadge difficulty={q.difficulty} />
                <ScoreBadge overall={q.score} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Team skills heatmap</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="p-1 text-left font-medium text-muted-foreground">Skill</th>
                  {demoTeam.map((r) => <th key={r.name} className="p-1 font-medium text-muted-foreground">{r.name.split(" ")[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {HEAT.map(([skill, vals]) => (
                  <tr key={skill}>
                    <td className="p-1">{skill}</td>
                    {vals.map((v, i) => <td key={i} className={`p-1 text-center ${heatColor(v)}`}>{v.toFixed(1)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Average roleplay score per skill (1–5). The team&apos;s weakest area: objection handling.</p>
        </Card>
      </div>
    </>
  );
}
