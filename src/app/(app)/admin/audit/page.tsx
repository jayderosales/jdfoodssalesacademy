import Link from "next/link";
import { Badge, Button, Card, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { describeAuditEntry, ENTITY_LABEL, type AuditEntry } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Audit log" };

const PAGE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

type Search = { entity?: string; action?: string; actor?: string; record?: string; from?: string; to?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { entity, action, actor, record, from, to, page = "0" } = sp;
  await requirePermission("audit.view");
  const p = Math.max(0, Number(page) || 0);
  const supabase = await createClient();

  const [{ data: audited }, { data: people }] = await Promise.all([
    supabase.from("audit_tables").select("table_name").order("table_name"),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
  ]);
  const tables = ((audited as { table_name: string }[] | null) ?? []).map((t) => t.table_name);
  const users = (people as { id: string; full_name: string; email: string }[] | null) ?? [];

  let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).range(p * PAGE, p * PAGE + PAGE - 1);
  if (entity) q = q.eq("entity", entity);
  if (action && ["insert", "update", "delete"].includes(action)) q = q.eq("action", action);
  if (actor && UUID.test(actor)) q = q.eq("actor_id", actor);
  if (record) q = q.eq("entity_id", record.trim());
  // Dates are Manila calendar days.
  if (from && DATE.test(from)) q = q.gte("at", `${from}T00:00:00+08:00`);
  if (to && DATE.test(to)) q = q.lte("at", `${to}T23:59:59.999+08:00`);
  const { data } = await q;
  const rows = (data as AuditEntry[] | null) ?? [];
  const actorName = new Map(users.map((a) => [a.id, a.full_name || a.email]));

  const qs = (n: number) =>
    `?${new URLSearchParams(Object.fromEntries(Object.entries({ ...sp, page: String(n) }).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string>)}`;

  return (
    <>
      <PageHeader title="Audit log" description="Every change, who made it and when. Entries can't be edited or deleted." />
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <Select name="entity" defaultValue={entity ?? ""} aria-label="Record type">
            <option value="">All record types</option>
            {tables.map((t) => (
              <option key={t} value={t}>{ENTITY_LABEL[t] ?? t}</option>
            ))}
          </Select>
          <Select name="action" defaultValue={action ?? ""} aria-label="Action">
            <option value="">Any action</option>
            <option value="insert">Created</option>
            <option value="update">Changed</option>
            <option value="delete">Deleted</option>
          </Select>
          <Select name="actor" defaultValue={actor ?? ""} aria-label="Who">
            <option value="">Anyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
            ))}
          </Select>
          <Input name="record" placeholder="Record id" defaultValue={record} aria-label="Record id" />
          <Input name="from" type="date" defaultValue={from} aria-label="From date" />
          <Input name="to" type="date" defaultValue={to} aria-label="To date" />
          <Button type="submit" variant="outline">Search</Button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>What</Th>
              <Th>Changes</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = describeAuditEntry(r);
              return (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap align-top">{formatDate(r.at, true)}</Td>
                  <Td className="align-top">{r.actor_id ? (actorName.get(r.actor_id) ?? "Unknown user") : "System"}</Td>
                  <Td className="align-top">
                    {d.summary}
                    {r.is_restricted && <Badge tone="warning" className="ml-1">restricted</Badge>}
                    <div className="max-w-[16rem] truncate font-mono text-[11px] text-muted-foreground">
                      <Link href={`?entity=${r.entity}&record=${encodeURIComponent(r.entity_id ?? "")}`} className="underline">{r.entity_id}</Link>
                    </div>
                  </Td>
                  <Td className="text-xs align-top">
                    {d.changes.length === 0
                      ? "—"
                      : d.changes.map((c) => (
                          <div key={c.field}>
                            <span className="text-muted-foreground">{c.label}:</span> <s className="text-muted-foreground">{c.from}</s> → {c.to}
                          </div>
                        ))}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No entries match.</p>}
        <div className="mt-4 flex justify-between text-sm">
          {p > 0 ? <Link href={qs(p - 1)} className="text-brand underline">Newer</Link> : <span />}
          {rows.length === PAGE ? <Link href={qs(p + 1)} className="text-brand underline">Older</Link> : <span />}
        </div>
      </Card>
    </>
  );
}
