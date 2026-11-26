import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { retryEvent } from "../engine-actions";

export const metadata = { title: "Background jobs" };

/** Events whose follow-up work (notifications, later: accounting postings, Shopify sync) failed and is retrying or gave up. */
export default async function EventsPage() {
  await requirePermission("admin.settings.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("domain_events").select("id, type, aggregate_table, aggregate_id, status, attempts, last_error, created_at, next_attempt_at").neq("status", "done").order("created_at", { ascending: false }).limit(200);
  const rows = (data as { id: number; type: string; aggregate_table: string; aggregate_id: string; status: string; attempts: number; last_error: string; created_at: string; next_attempt_at: string }[] | null) ?? [];
  return (
    <>
      <PageHeader
        title="Background jobs"
        description="Follow-up work that didn't finish. Pending items retry automatically every minute; stopped items need a look."
        actions={<Link href="/admin/settings" className="text-sm text-brand underline">All settings</Link>}
      />
      <Card>
        <Table>
          <thead><tr><Th>When</Th><Th>Event</Th><Th>Tries</Th><Th>Error</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <Td>{formatDate(e.created_at, true)}</Td>
                <Td><span className="font-mono text-xs">{e.type}</span><div className="text-xs text-muted-foreground">{e.aggregate_table} {e.aggregate_id.slice(0, 8)}</div></Td>
                <Td>{e.attempts}</Td>
                <Td className="max-w-64 truncate text-xs" title={e.last_error}>{e.last_error || "—"}</Td>
                <Td>{e.status === "dead" ? <Badge tone="danger">stopped</Badge> : <Badge tone="warning">retrying {formatDate(e.next_attempt_at, true)}</Badge>}</Td>
                <Td>{e.status === "dead" && <ActionForm action={retryEvent} submitLabel="Retry" variant="outline" className="flex"><input type="hidden" name="id" value={e.id} /></ActionForm>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">All background work is up to date.</p>}
      </Card>
    </>
  );
}
