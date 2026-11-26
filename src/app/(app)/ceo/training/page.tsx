import Link from "next/link";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { peso, pct, Tile } from "../parts";

export const metadata = { title: "CEO reports: training" };

type R = { user_id: string; full_name: string; skill_score: string | null; at_risk: boolean; level: number; quizzes_passed: number; roleplays_30: number; last_activity: string | null; sales_mtd: string; target_month: string | null; sales_30: string; sales_90: string; orders_30: number };

export default async function CeoTraining() {
  await requirePermission("ceo.reports.view");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ceo_rep_performance");
  if (error) throw new Error(error.message);
  const reps = (data as R[] | null) ?? [];
  const scored = reps.filter((r) => r.skill_score != null);
  const avg = scored.length ? scored.reduce((s, r) => s + Number(r.skill_score), 0) / scored.length : null;
  const atRisk = reps.filter((r) => r.at_risk);
  const inactive = reps.filter((r) => !r.last_activity || Date.now() - Date.parse(r.last_activity) > 14 * 86_400_000);

  return (
    <>
      <PageHeader title="Training status" description="Each sales rep's Academy progress next to their actual sales and this month's target." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Sales reps" value={reps.length} />
        <Tile label="Average skill score" value={avg == null ? "—" : Math.round(avg)} sub={`${scored.length} reps scored`} href="/reports" />
        <Tile label="At risk" value={atRisk.length} tone={atRisk.length ? "bad" : "good"} sub={atRisk.map((r) => r.full_name.split(" ")[0]).join(", ") || undefined} />
        <Tile label="No training in 14 days" value={inactive.length} tone={inactive.length ? "warn" : "good"} />
      </div>
      <Card>
        <CardTitle>Reps</CardTitle>
        {reps.length === 0 ? <p className="text-sm text-muted-foreground">No active sales reps yet.</p> : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr><Th>Rep</Th><Th className="text-right">Skill score</Th><Th className="text-right">Level</Th><Th className="text-right">Quizzes passed</Th><Th className="text-right">Roleplays (30 d)</Th><Th>Last training</Th><Th className="text-right">Sales this month</Th><Th className="text-right">vs target</Th><Th className="text-right">Sales 90 d</Th></tr>
              </thead>
              <tbody>
                {reps.map((r) => {
                  const vs = r.target_month ? pct(Number(r.sales_mtd), Number(r.target_month)) : null;
                  return (
                    <tr key={r.user_id}>
                      <Td><Link href={`/team/${r.user_id}`} className="font-medium underline">{r.full_name}</Link>{r.at_risk && <span className="ml-1 rounded bg-red-100 px-1 text-xs text-red-800">at risk</span>}</Td>
                      <Td className="text-right tabular-nums">{r.skill_score == null ? "—" : Math.round(Number(r.skill_score))}</Td>
                      <Td className="text-right">{r.level}</Td>
                      <Td className="text-right">{r.quizzes_passed}</Td>
                      <Td className="text-right">{r.roleplays_30}</Td>
                      <Td className="text-xs">{r.last_activity ? formatDate(r.last_activity) : "Never"}</Td>
                      <Td className="text-right tabular-nums">{peso(r.sales_mtd)}</Td>
                      <Td className={`text-right ${vs == null ? "text-muted-foreground" : vs >= 100 ? "text-success" : "text-amber-700"}`}>{vs == null ? "no target" : `${vs}%`}</Td>
                      <Td className="text-right tabular-nums">{peso(r.sales_90)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Skill score and at-risk flag come from the Academy&apos;s latest skill snapshot. Sales count orders released with the rep on them. Set rep targets in <Link href="/ceo/targets" className="underline">Targets</Link>.</p>
    </>
  );
}
