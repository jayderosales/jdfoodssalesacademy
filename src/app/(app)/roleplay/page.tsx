import Link from "next/link";
import { MapPin, Target } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DifficultyBadge, ScoreBadge, StatusBadge } from "@/components/roleplay-badges";
import { Alert, Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { getSettings, requireUser } from "@/lib/auth";
import { listSessions } from "@/lib/roleplay/queries";
import { roleplayAllowance } from "@/lib/roleplay/service";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { startRoleplay } from "./actions";

export const metadata = { title: "AI Roleplay" };

interface ScenarioCard {
  id: string;
  title: string;
  briefing: string;
  goal: string;
  difficulty: "easy" | "medium" | "hard";
  persona: { business_type?: string; location?: string };
}

const ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export default async function RoleplayPage() {
  const profile = await requireUser();
  const settings = await getSettings();
  // Only rep-safe fields are passed to the page (hidden needs stay on the server).
  const { data } = await createAdminClient()
    .from("scenarios")
    .select("id, title, briefing, goal, difficulty, persona")
    .eq("active", true)
    .eq("is_prehire", false);
  const scenarios = ((data ?? []) as ScenarioCard[]).sort((a, b) => ORDER[a.difficulty] - ORDER[b.difficulty] || a.title.localeCompare(b.title));
  const [sessions, allowance] = await Promise.all([
    listSessions({ userId: profile.id, limit: 100 }),
    settings ? roleplayAllowance(profile, settings) : Promise.resolve(null),
  ]);
  const best = new Map<string, number>();
  sessions.forEach((s) => s.overall != null && best.set(s.scenario_id, Math.max(best.get(s.scenario_id) ?? 0, s.overall)));
  const active = new Set(sessions.filter((s) => s.status === "active").map((s) => s.scenario_id));

  return (
    <>
      <PageHeader
        title="AI Roleplay"
        description="Practice selling to realistic Filipino customers. You are the salesperson; the AI plays the customer and scores you at the end."
      />
      {allowance && (
        <div className="mb-4">
          {allowance.canStart ? (
            allowance.remaining != null && <p className="text-sm text-muted-foreground">{allowance.remaining} of {allowance.limit} roleplays left today.</p>
          ) : (
            <Alert>{allowance.reason}</Alert>
          )}
        </div>
      )}

      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {scenarios.map((s) => (
          <Card key={s.id} className="flex flex-col">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="font-semibold leading-snug">{s.title}</h2>
              <DifficultyBadge difficulty={s.difficulty} />
            </div>
            {s.persona.location && (
              <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" aria-hidden /> {s.persona.business_type} · {s.persona.location}
              </p>
            )}
            <p className="mb-2 text-sm">{s.briefing}</p>
            <p className="mb-4 flex items-start gap-1 text-sm text-muted-foreground">
              <Target className="mt-0.5 size-4 shrink-0" aria-hidden /> <span><strong>Your goal:</strong> {s.goal}</span>
            </p>
            <div className="mt-auto flex items-center justify-between gap-2">
              {best.has(s.id) ? <span className="text-xs text-muted-foreground">Best: <ScoreBadge overall={best.get(s.id)!} /></span> : <span />}
              <ActionForm action={startRoleplay} submitLabel={active.has(s.id) ? "Continue" : best.has(s.id) ? "Practice again" : "Start"} className="flex flex-col items-end gap-2" variant={active.has(s.id) ? "secondary" : "default"}>
                <input type="hidden" name="scenario_id" value={s.id} />
              </ActionForm>
            </div>
          </Card>
        ))}
        {scenarios.length === 0 && <Card><p className="text-sm text-muted-foreground">No scenarios yet.</p></Card>}
      </div>

      <Card>
        <CardTitle>Your roleplay history</CardTitle>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No roleplays yet. Start with an Easy scenario!</p>
        ) : (
          <Table>
            <thead><tr><Th>Scenario</Th><Th>Date</Th><Th>Score</Th><Th>Status</Th></tr></thead>
            <tbody>
              {sessions.slice(0, 30).map((s) => (
                <tr key={s.id}>
                  <Td><Link href={`/roleplay/session/${s.id}`} className="text-brand underline">{s.scenario_title}</Link></Td>
                  <Td>{formatDate(s.started_at, true)}</Td>
                  <Td><ScoreBadge overall={s.overall} />{s.goal_achieved && <span className="ml-1 text-xs text-success">goal ✓</span>}</Td>
                  <Td><StatusBadge status={s.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
