import Link from "next/link";
import { Flame, MessageSquare } from "lucide-react";
import { ProgressBar } from "@/components/progress-bar";
import { ScoreBadge } from "@/components/roleplay-badges";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { demoModules, demoRep, demoResult } from "../data";

export const metadata = { title: "Rep home" };

export default function DemoRepHome() {
  const done = demoModules.reduce((s, m) => s + m.completed, 0);
  const total = demoModules.reduce((s, m) => s + m.lessons.length, 0);
  return (
    <>
      <PageHeader title={`Hi, ${demoRep.name.split(" ")[0]}!`} description={demoRep.team} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardTitle>Your level</CardTitle>
          <p className="text-3xl font-bold text-brand">Level {demoRep.level}</p>
          <p className="text-sm text-muted-foreground">{demoRep.levelName} · hired {formatDate(demoRep.hired)}</p>
          <div className="mt-4">
            <ProgressBar value={2} max={4} label={`To Level 2: ${demoRep.nextLevel}`} />
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>✓ Product and company modules</li>
              <li>✓ Quizzes ≥ 80%</li>
              <li>○ Scripts and objections modules</li>
              <li>○ 3 Easy roleplays ≥ 70 (2/3)</li>
            </ul>
          </div>
          <Badge className="mt-3">Level tracking arrives in Phase 4</Badge>
        </Card>
        <Card>
          <CardTitle>Next up</CardTitle>
          <p className="text-sm text-muted-foreground">Customer Types</p>
          <p className="font-medium">Home cooks and resellers</p>
          <Link href="/demo/lesson" className="mt-3 inline-block text-sm text-brand underline">Continue learning</Link>
          <div className="mt-4">
            <ProgressBar value={done} max={total} label="Onboarding" />
          </div>
        </Card>
        <Card>
          <CardTitle>Practice</CardTitle>
          <p className="mb-1 flex items-center gap-2 text-sm"><Flame className="size-4 text-brand-2" aria-hidden /> 5-day practice streak</p>
          <p className="mb-3 text-sm text-muted-foreground">Last roleplay: Aling Nena&apos;s carinderia <ScoreBadge overall={demoResult.overall} /></p>
          <p className="text-sm">Recommended next: <strong>Value &amp; benefit presentation</strong> is your weakest skill.</p>
          <Link href="/demo/roleplay" className="mt-3 inline-flex items-center gap-1 text-sm text-brand underline">
            <MessageSquare className="size-4" aria-hidden /> Try the fries cart scenario
          </Link>
        </Card>
      </div>
    </>
  );
}
