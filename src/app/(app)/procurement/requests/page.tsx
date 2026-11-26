import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { peopleNames } from "@/components/shared/approval-timeline";
import { createRequest } from "../actions";
import { stockLocations } from "../parts";

export const metadata = { title: "Purchase requests" };

const LABEL: Record<string, string> = { draft: "draft", submitted: "pending", ordered: "approved", declined: "rejected", cancelled: "cancelled" };

/** Anyone can ask for items to be bought; the buyer orders them (Requests to order) or declines with a reason. */
export default async function RequestsPage() {
  const me = await requirePermission(["procurement.request", "procurement.po.create"]);
  const access = await getAccess();
  const buyer = can(access, "procurement.po.create");
  const supabase = await createClient();
  const sel = "id, number, status, needed_by, reason, created_at, requested_by, locations(name), purchase_request_lines(id)";
  const [{ data: toOrder }, { data: mine }, locations] = await Promise.all([
    buyer ? supabase.from("purchase_requests").select(sel).eq("status", "submitted").order("submitted_at") : Promise.resolve({ data: [] }),
    supabase.from("purchase_requests").select(sel).eq("requested_by", me.id).order("created_at", { ascending: false }).limit(50),
    stockLocations(),
  ]);
  type Row = { id: string; number: string; status: string; needed_by: string | null; reason: string; created_at: string; requested_by: string; locations: { name: string } | null; purchase_request_lines: { id: string }[] };
  const queue = (toOrder as unknown as Row[] | null) ?? [];
  const my = (mine as unknown as Row[] | null) ?? [];
  const names = await peopleNames(queue.map((r) => r.requested_by));

  const table = (rows: Row[], showWho: boolean) => (
    <Table>
      <thead><tr><Th>Request</Th>{showWho && <Th>From</Th>}<Th>For</Th><Th>Needed by</Th><Th className="text-right">Items</Th><Th>Status</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td><Link href={`/procurement/requests/${r.id}`} className="font-medium text-brand underline">{r.number}</Link><div className="text-xs text-muted-foreground">{r.reason}</div></Td>
            {showWho && <Td>{names.get(r.requested_by) ?? "—"}</Td>}
            <Td>{r.locations?.name}</Td>
            <Td>{formatDate(r.needed_by)}</Td>
            <Td className="text-right">{r.purchase_request_lines.length}</Td>
            <Td><StatusBadge status={LABEL[r.status] ?? r.status} /></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  return (
    <>
      <PageHeader title="Purchase requests" description="Ask for items to be bought. The buyer turns requests into purchase orders (approved by the CEO)." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {buyer && (
            <Card>
              <CardTitle>Requests to order ({queue.length})</CardTitle>
              {queue.length ? table(queue, true) : <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
            </Card>
          )}
          <Card>
            <CardTitle>My requests</CardTitle>
            {my.length ? table(my, false) : <p className="text-sm text-muted-foreground">You haven&apos;t asked for anything yet.</p>}
          </Card>
        </div>
        {can(access, "procurement.request") && (
          <Card>
            <CardTitle>New request</CardTitle>
            <ActionForm action={createRequest} submitLabel="Start request">
              <Field label="Needed at" htmlFor="location_id">
                <Select id="location_id" name="location_id" required defaultValue={locations[0]?.id}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
              </Field>
              <Field label="Needed by" htmlFor="needed_by"><Input id="needed_by" name="needed_by" type="date" /></Field>
              <Field label="Why" htmlFor="reason"><Textarea id="reason" name="reason" rows={2} placeholder="e.g. Production run next week" /></Field>
            </ActionForm>
            <p className="mt-3 text-xs text-muted-foreground">Low stock? <Link href="/inventory/reorder" className="underline">Inventory → Reorder</Link> can create a request from everything below its minimum.</p>
          </Card>
        )}
      </div>
    </>
  );
}
