import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthState } from "@/lib/auth";
import { CRITERIA_KEYS } from "@/lib/ai/prompts/grader";
import { buildReport } from "@/lib/reports/load";
import { toCsv } from "@/lib/reports/metrics";
import { manilaToday } from "@/lib/utils";

export const runtime = "nodejs";

const params = z.object({
  type: z.enum(["reps", "quizzes", "skills"]),
  team: z.string().uuid().optional(),
});

/** CSV downloads of the report, scoped exactly like the Reports page (RLS decides which reps are included). */
export async function GET(request: NextRequest) {
  const { profile } = await getAuthState();
  if (!profile || profile.status !== "active" || !profile.role || !["owner", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const parsed = params.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { type, team } = parsed.data;

  const report = await buildReport(profile, { teamId: team });
  let csv: string;

  if (type === "reps") {
    csv = toCsv(
      report.reps.map((r) => ({
        name: r.name,
        email: r.email,
        team: r.team,
        status: r.status,
        hire_date: r.hireDate ?? "",
        level: r.level.level,
        level_name: r.level.name,
        next_level_missing: r.level.next?.missing.join("; ") ?? "",
        onboarding_pct: r.onboardingPct,
        lessons_done: r.lessonsDone,
        lessons_total: r.lessonsTotal,
        quizzes_passed: r.quizzesPassed,
        quizzes_total: r.quizzesTotal,
        roleplays: r.roleplays,
        roleplay_avg: r.roleplayAvg == null ? "" : Math.round(r.roleplayAvg),
        days_to_field_ready: r.daysToFieldReady ?? "",
        last_active: r.lastActiveAt ?? "",
        at_risk: r.atRisk.join("; "),
        exit_date: r.exitDate ?? "",
        exit_reason: r.exitReason ?? "",
      })),
      ["name", "email", "team", "status", "hire_date", "level", "level_name", "next_level_missing", "onboarding_pct", "lessons_done", "lessons_total",
       "quizzes_passed", "quizzes_total", "roleplays", "roleplay_avg", "days_to_field_ready", "last_active", "at_risk", "exit_date", "exit_reason"],
    );
  } else if (type === "quizzes") {
    csv = toCsv(
      report.quizzes.map((q) => ({
        quiz: q.title,
        type: q.kind,
        attempts: q.attempts,
        takers: q.takers,
        pass_rate_pct: Math.round(q.passRate * 100),
        first_attempt_pass_rate_pct: Math.round(q.firstAttemptPassRate * 100),
        avg_score_pct: q.avgScore == null ? "" : Math.round(q.avgScore),
      })),
      ["quiz", "type", "attempts", "takers", "pass_rate_pct", "first_attempt_pass_rate_pct", "avg_score_pct"],
    );
  } else {
    csv = toCsv(
      report.reps
        .filter((r) => r.roleplays > 0)
        .map((r) => ({
          name: r.name,
          team: r.team,
          roleplays: r.roleplays,
          ...Object.fromEntries(CRITERIA_KEYS.map((k) => [k, r.competencies[k] == null ? "" : r.competencies[k]!.toFixed(2)])),
        })),
      ["name", "team", "roleplays", ...CRITERIA_KEYS],
    );
  }

  const filename = `sales-academy-${type}-${manilaToday()}.csv`;
  // BOM so Excel opens UTF-8 (₱, ñ) correctly
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
