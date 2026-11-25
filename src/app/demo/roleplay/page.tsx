import Link from "next/link";
import { MapPin, Target } from "lucide-react";
import { DifficultyBadge, ScoreBadge } from "@/components/roleplay-badges";
import { Card, PageHeader, buttonVariants } from "@/components/ui";
import { demoScenarios } from "../data";

export const metadata = { title: "AI Roleplay" };

export default function DemoRoleplay() {
  return (
    <>
      <PageHeader
        title="AI Roleplay"
        description="Practice selling to realistic Filipino customers. You are the salesperson; the AI plays the customer and scores you at the end."
      />
      <p className="mb-4 text-sm text-muted-foreground">8 of 10 roleplays left today.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {demoScenarios.map((s) => (
          <Card key={s.id} className="flex flex-col">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="font-semibold leading-snug">{s.title}</h2>
              <DifficultyBadge difficulty={s.difficulty} />
            </div>
            <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" aria-hidden /> {s.place}</p>
            <p className="mb-2 text-sm">{s.briefing}</p>
            <p className="mb-4 flex items-start gap-1 text-sm text-muted-foreground">
              <Target className="mt-0.5 size-4 shrink-0" aria-hidden /> <span><strong>Your goal:</strong> {s.goal}</span>
            </p>
            <div className="mt-auto flex items-center justify-between gap-2">
              {s.best != null ? <span className="text-xs text-muted-foreground">Best: <ScoreBadge overall={s.best} /></span> : <span />}
              {s.id === "nena" ? (
                <Link href="/demo/chat" className={buttonVariants()}>Start</Link>
              ) : (
                <span className={buttonVariants({ variant: "outline", className: "pointer-events-none opacity-60" })} title="Only the Aling Nena scenario is playable in the preview">
                  {s.best != null ? "Practice again" : "Start"}
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
