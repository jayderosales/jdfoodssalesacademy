import Link from "next/link";
import { CheckCircle2, Circle, ListChecks, Lock } from "lucide-react";
import { ProgressBar } from "@/components/progress-bar";
import { Badge, Card, PageHeader } from "@/components/ui";
import { demoModules } from "../data";

export const metadata = { title: "Learn" };

export default function DemoLearn() {
  const done = demoModules.reduce((s, m) => s + m.completed, 0);
  const total = demoModules.reduce((s, m) => s + m.lessons.length, 0);
  return (
    <>
      <PageHeader title="Learn" description="Work through each module in order. Your progress saves automatically." />
      <Card className="mb-3">
        <h2 className="text-lg font-bold">New Hire Onboarding</h2>
        <p className="mb-3 text-sm text-muted-foreground">Everything a new JD Foods salesperson needs before going to the field.</p>
        <ProgressBar value={done} max={total} label="Lessons completed" />
        <p className="mt-1 text-xs text-muted-foreground">Due Dec 10, 2026</p>
      </Card>
      <ol className="space-y-3">
        {demoModules.map((m, i) => {
          const locked = m.status === "locked";
          return (
            <li key={m.title}>
              <Card className={locked ? "opacity-70" : undefined}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Module {i + 1}</p>
                    <h3 className="font-semibold">{m.title}</h3>
                  </div>
                  {locked ? <Badge><Lock className="mr-1 size-3" aria-hidden />Locked</Badge> : m.status === "done" ? <Badge tone="success">Done</Badge> : <Badge tone="brand">{m.completed}/{m.lessons.length}</Badge>}
                </div>
                <ul className="divide-y">
                  {m.lessons.map((l, li) => {
                    const isDone = li < m.completed;
                    const isLocked = locked || (!isDone && li > m.completed);
                    const Icon = isLocked ? Lock : isDone ? CheckCircle2 : Circle;
                    return (
                      <li key={l}>
                        {isLocked ? (
                          <span className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
                            <Icon className="size-4 shrink-0" aria-label="Locked" /> <span className="flex-1">{l}</span>
                          </span>
                        ) : (
                          <Link href="/demo/lesson" className="flex min-h-11 items-center gap-3 text-sm hover:text-brand">
                            <Icon className={`size-4 shrink-0 ${isDone ? "text-success" : "text-muted-foreground"}`} aria-hidden />
                            <span className="flex-1">{l}</span>
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href={m.status === "done" ? "/demo/quiz" : "#"}
                  className={`mt-2 flex min-h-11 items-center gap-3 border-t pt-2 text-sm ${m.status === "done" ? "font-medium text-brand" : "pointer-events-none text-muted-foreground"}`}
                >
                  <ListChecks className="size-4" aria-hidden /> Quiz: {m.quiz}
                  {m.status === "done" && <Badge tone="success">Passed</Badge>}
                  {m.status !== "done" && <span className="text-xs">(after the lessons)</span>}
                </Link>
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}
