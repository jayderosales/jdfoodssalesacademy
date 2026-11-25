import Link from "next/link";
import { Download } from "lucide-react";
import { DifficultyBadge } from "@/components/roleplay-badges";
import { Button, Card, PageHeader, Select, Table, Td, Th, buttonVariants } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { CRITERIA_KEYS } from "@/lib/ai/prompts/grader";
import { listTeams } from "@/lib/org";
import { buildReport } from "@/lib/reports/load";
import { CRITERIA_LABEL } from "@/lib/roleplay/scoring";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";
import { Bar, HeatCell, RiskFlags, Section, StatTile, pct, usd } from "./report-ui";

export const metadata = { title: "Reports" };

const FEATURE_LABEL: Record<string, string> = {
  roleplay_customer: "Roleplay replies",
  roleplay_grade: "Roleplay grading",
  quiz_grade: "Quiz grading",
  quiz_generate: "Quiz generator",
};

const SHORT_CRITERIA: Record<string, string> = {
  opening: "Opening", discovery: "Discovery", product: "Product", value: "Value",
  objections: "Objections", closing: "Closing", communication: "Comms",
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const { team } = await searchParams;
  const viewer = await requireStaff();
  const [report, teams] = await Promise.all([buildReport(viewer, { teamId: team || undefined }), listTeams()]);
  const o = report.overview;
  const active = report.reps.filter((r) => r.status === "active");
  const left = report.reps.filter((r) => r.status === "inactive");
  const withRoleplays = active.filter((r) => r.roleplays > 0);
  const repsSorted = [...active].sort((a, b) => b.atRisk.length - a.atRisk.length || a.level.level - b.level.level || a.name.localeCompare(b.name));
  const maxLevelCount = Math.max(1, ...report.levelCounts.map((l) => l.count));
  const exportQs = team ? `&team=${team}` : "";
  const featureKeys = [...new Set(report.aiByMonth.flatMap((m) => Object.keys(m.byFeature)))];

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${report.scopeLabel} · generated ${formatDate(report.generatedAt, true)}`}
        actions={<div className="print:hidden"><PrintButton /></div>}
      />

      <Card className="mb-6 print:hidden">
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="sm:w-64">
            <label htmlFor="team" className="mb-1 block text-sm font-medium">Team</label>
            <Select id="team" name="team" defaultValue={team ?? ""}>
              <option value="">{viewer.role === "owner" ? "All teams" : "All my teams"}</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </div>
          <Button type="submit" variant="outline">Apply</Button>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {[
              ["reps", "Reps"],
              ["quizzes", "Quizzes"],
              ["skills", "Roleplay skills"],
            ].map(([type, label]) => (
              <a key={type} href={`/api/reports/export?type=${type}${exportQs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download className="size-4" aria-hidden /> {label} CSV
              </a>
            ))}
          </div>
        </form>
      </Card>

      {/* ---------------------------------------------------------- overview */}
      <Section id="overview" title="Overview">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Active reps" value={String(o.activeReps)} sub={o.atRiskCount ? `${o.atRiskCount} at risk` : "None at risk"} />
          <StatTile
            label="Median days to Field Ready"
            value={o.medianDaysToFieldReady == null ? "—" : `${Math.round(o.medianDaysToFieldReady)} days`}
            sub={`Target ${o.onboardingTargetDays} days · ${o.fieldReadyCount} of ${o.activeReps} Field Ready`}
          />
          <StatTile label="Average onboarding progress" value={o.avgOnboardingPct == null ? "—" : `${o.avgOnboardingPct}%`} sub="Lessons completed" />
          <StatTile label="Quiz pass rate, first attempt" value={pct(o.quizFirstAttemptPassRate)} sub="Across all quizzes" />
          <StatTile
            label="Roleplays this month"
            value={String(o.roleplaysThisMonth)}
            sub={o.roleplayAvgThisMonth == null ? "No scores yet" : `Average score ${Math.round(o.roleplayAvgThisMonth)}/100`}
          />
          {report.isOwner && <StatTile label="AI cost this month" value={usd(o.aiCostThisMonthUsd)} sub="Estimated from token usage" />}
        </div>
      </Section>

      {/* ---------------------------------------------------------- levels */}
      <Section id="levels" title="Skill levels" description="Active reps by current level. Levels are calculated from lessons, quizzes, roleplays and manager sign-offs.">
        <Card>
          <ul className="space-y-2">
            {report.levelCounts.map((l) => (
              <li key={l.level} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm sm:grid-cols-[12rem_1fr]">
                <span className="truncate">L{l.level} · {l.name}</span>
                <Bar value={l.count} max={maxLevelCount} label={String(l.count)} title={`${l.count} rep(s) at ${l.name}`} />
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {/* ---------------------------------------------------------- reps */}
      <Section id="reps" title="Rep progress" description="At-risk reps first. Open a rep for their full detail.">
        <Card>
          {repsSorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No active reps in this view.</p>
          ) : (
            <Table className="min-w-[860px]">
              <thead>
                <tr><Th>Rep</Th><Th>Level</Th><Th className="w-40">Onboarding</Th><Th>Quizzes</Th><Th>Roleplays</Th><Th>Days to Field Ready</Th><Th>Last active</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {repsSorted.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/team/${r.id}`} className="font-medium text-brand underline">{r.name}</Link>
                      <div className="text-xs text-muted-foreground">{r.team} · hired {formatDate(r.hireDate)}</div>
                    </Td>
                    <Td>
                      L{r.level.level} · {r.level.name}
                      {r.level.next && <div className="text-xs text-muted-foreground" title={r.level.next.missing.join("\n")}>Next: {r.level.next.missing[0]}</div>}
                    </Td>
                    <Td><Bar value={r.onboardingPct} max={100} label={`${r.onboardingPct}%`} title={`${r.lessonsDone} of ${r.lessonsTotal} lessons`} /></Td>
                    <Td className="tabular-nums">{r.quizzesPassed}/{r.quizzesTotal}</Td>
                    <Td className="tabular-nums">{r.roleplays}{r.roleplayAvg != null && <span className="text-xs text-muted-foreground"> · avg {Math.round(r.roleplayAvg)}</span>}</Td>
                    <Td className="tabular-nums">{r.daysToFieldReady ?? "—"}</Td>
                    <Td>{formatDate(r.lastActiveAt)}</Td>
                    <Td><RiskFlags reasons={r.atRisk} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>

      {/* ---------------------------------------------------------- skills */}
      <Section id="skills" title="Roleplay skills" description="Average AI/manager score per skill (1–5). Darker means stronger. The team row shows where to focus coaching.">
        <Card>
          {withRoleplays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No scored roleplays yet.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr>
                    <Th>Rep</Th>
                    {CRITERIA_KEYS.map((k) => <Th key={k} className="text-center" title={CRITERIA_LABEL[k]}>{SHORT_CRITERIA[k]}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-semibold">
                    <Td>Team average</Td>
                    {CRITERIA_KEYS.map((k) => <HeatCell key={k} value={report.teamCompetencies[k]} />)}
                  </tr>
                  {withRoleplays.map((r) => (
                    <tr key={r.id}>
                      <Td>{r.name}</Td>
                      {CRITERIA_KEYS.map((k) => <HeatCell key={k} value={r.competencies[k] ?? null} />)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>

      {/* ---------------------------------------------------------- quizzes */}
      <Section id="quizzes" title="Quizzes" description="Hardest quizzes first (lowest first-attempt pass rate).">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            {report.quizzes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No quiz attempts yet.</p>
            ) : (
              <Table className="min-w-[480px]">
                <thead><tr><Th>Quiz</Th><Th>Takers</Th><Th className="w-36">First-try pass</Th><Th>Avg</Th></tr></thead>
                <tbody>
                  {report.quizzes.map((q) => (
                    <tr key={q.quizId}>
                      <Td>{q.title}<div className="text-xs text-muted-foreground">{q.attempts} attempts · {pct(q.passRate)} passed eventually</div></Td>
                      <Td className="tabular-nums">{q.takers}</Td>
                      <Td><Bar value={q.firstAttemptPassRate} label={pct(q.firstAttemptPassRate)} /></Td>
                      <Td className="tabular-nums">{q.avgScore == null ? "—" : `${Math.round(q.avgScore)}%`}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <h3 className="mb-2 font-semibold">Hardest questions</h3>
            {report.hardest.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Needs at least 3 answers per question.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {report.hardest.map((h) => (
                  <li key={h.questionId}>
                    <p className="line-clamp-2">{h.prompt}</p>
                    <div className="mt-1 grid grid-cols-[1fr_8rem] items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{h.quiz} · {h.answers} answers</span>
                      <Bar value={h.correctRate} label={pct(h.correctRate)} title={`${pct(h.correctRate)} answered correctly`} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-muted-foreground">If many reps miss a question, the lesson may need clearer wording, or the question may be unclear.</p>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------- scenarios */}
      <Section id="scenarios" title="Roleplay scenarios">
        <Card>
          {report.scenarios.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No scored roleplays yet.</p>
          ) : (
            <Table className="min-w-[560px]">
              <thead><tr><Th>Scenario</Th><Th>Played</Th><Th className="w-36">Average score</Th><Th className="w-36">Goal achieved</Th></tr></thead>
              <tbody>
                {report.scenarios.map((s) => (
                  <tr key={s.title}>
                    <Td>{s.title} <DifficultyBadge difficulty={s.difficulty} /></Td>
                    <Td className="tabular-nums">{s.sessions}</Td>
                    <Td><Bar value={s.avg ?? 0} max={100} label={s.avg == null ? "—" : String(Math.round(s.avg))} /></Td>
                    <Td><Bar value={s.goalRate ?? 0} label={pct(s.goalRate)} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>

      {/* ---------------------------------------------------------- AI cost */}
      <Section id="ai" title="AI cost by month" description={report.isOwner ? "Estimated in US dollars from token usage, Manila months." : "Estimated cost of your teams' AI usage, in US dollars."}>
        <Card>
          {report.aiByMonth.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No AI usage recorded yet.</p>
          ) : (
            <Table className="min-w-[520px]">
              <thead>
                <tr><Th>Month</Th>{featureKeys.map((f) => <Th key={f}>{FEATURE_LABEL[f] ?? f}</Th>)}<Th>Total</Th></tr>
              </thead>
              <tbody>
                {report.aiByMonth.map((m) => (
                  <tr key={m.month}>
                    <Td>{m.month}</Td>
                    {featureKeys.map((f) => <Td key={f} className="tabular-nums">{m.byFeature[f] ? usd(m.byFeature[f]) : "—"}</Td>)}
                    <Td className="font-semibold tabular-nums">{usd(m.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>

      {/* ---------------------------------------------------------- turnover */}
      <Section id="turnover" title="Staff who left" description="Training stage at exit shows where people drop off.">
        <Card>
          {left.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No one has left yet.</p>
          ) : (
            <Table className="min-w-[620px]">
              <thead><tr><Th>Name</Th><Th>Exit date</Th><Th>Reason</Th><Th>Days employed</Th><Th>Level at exit</Th><Th>Onboarding reached</Th></tr></thead>
              <tbody>
                {left.map((r) => (
                  <tr key={r.id}>
                    <Td>{r.name}<div className="text-xs text-muted-foreground">{r.team}</div></Td>
                    <Td>{formatDate(r.exitDate)}</Td>
                    <Td>{r.exitReason ?? "—"}</Td>
                    <Td className="tabular-nums">{r.hireDate && r.exitDate ? Math.round((new Date(r.exitDate).getTime() - new Date(r.hireDate).getTime()) / 86_400_000) : "—"}</Td>
                    <Td>{r.exitStageLevel != null ? `L${r.exitStageLevel}` : `L${r.level.level}`}</Td>
                    <Td className="tabular-nums">{r.onboardingPct}%</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>

      <p className="text-xs text-muted-foreground">
        Not yet included: sales and field KPIs (and how skill scores relate to sales). Those need KPI entry, which comes with the next part of Phase 4.
      </p>
    </>
  );
}
