import Link from "next/link";
import { Button, Card, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Audit log" };

const PAGE = 50;
const ENTITIES = ["profiles", "teams", "branches", "team_managers", "app_settings", "lessons", "products", "questions", "scenarios", "roleplay_scores", "field_kpis", "levels"];

interface Row {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

function changedKeys(r: Row) {
  if (!r.before || !r.after) return [];
  return Object.keys(r.after).filter(
    (k) => !["updated_at", "last_active_at"].includes(k) && JSON.stringify(r.before![k]) !== JSON.stringify(r.after![k]),
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; page?: string }> }) {
  const { entity, page = "0" } = await searchParams;
  await requireOwner();
  const p = Math.max(0, Number(page) || 0);
  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).range(p * PAGE, p * PAGE + PAGE - 1);
  if (entity) q = q.eq("entity", entity);
  const { data } = await q;
  const rows = (data as Row[] | null) ?? [];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] };
  const actorName = new Map((actors ?? []).map((a: { id: string; full_name: string; email: string }) => [a.id, a.full_name || a.email]));

  const qs = (n: number) => `?${new URLSearchParams({ ...(entity ? { entity } : {}), page: String(n) })}`;

  return (
    <>
      <PageHeader title="Audit log" description="Every change to users, teams, settings and training content." />
      <Card>
        <form className="mb-4 flex gap-2">
          <Select name="entity" defaultValue={entity ?? ""} aria-label="Filter by type" className="max-w-xs">
            <option value="">All changes</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>What</Th>
              <Th>Changed fields</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDate(r.at, true)}</Td>
                <Td>{r.actor_id ? actorName.get(r.actor_id) ?? "Unknown user" : "System"}</Td>
                <Td>
                  <span className="font-medium">{r.action}</span> {r.entity}
                  <div className="max-w-[16rem] truncate text-xs text-muted-foreground">
                    {(r.after?.full_name ?? r.after?.name ?? r.after?.title ?? r.before?.name ?? r.entity_id) as string}
                  </div>
                </Td>
                <Td className="text-xs">{r.action === "update" ? changedKeys(r).join(", ") || "—" : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No entries.</p>}
        <div className="mt-4 flex justify-between text-sm">
          {p > 0 ? <Link href={qs(p - 1)} className="text-brand underline">Newer</Link> : <span />}
          {rows.length === PAGE ? <Link href={qs(p + 1)} className="text-brand underline">Older</Link> : <span />}
        </div>
      </Card>
    </>
  );
}
