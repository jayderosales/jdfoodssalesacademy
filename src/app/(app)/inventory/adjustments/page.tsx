import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { createAdjustment } from "../actions";
import { catalogOptions } from "../options";
import { REASONS } from "./reasons";

export const metadata = { title: "Adjustments" };


export default async function AdjustmentsPage() {
  await requirePermission(["inventory.adjust.request", "inventory.view_cost"]);
  const access = await getAccess();
  const opts = await catalogOptions();
  const supabase = await createClient();
  const { data } = await supabase.from("stock_adjustments").select("id, number, reason_type, status, total_value, created_at, locations(name)").order("created_at", { ascending: false }).limit(100);
  const rows = (data as unknown as { id: string; number: string; reason_type: string; status: string; total_value: string; created_at: string; locations: { name: string } | null }[] | null) ?? [];
  return (
    <>
      <PageHeader title="Adjustments" description="Damage, disposal, samples, internal use and corrections. Up to ₱5,000 is approved by the operations manager, above that by the CEO. Stock changes only after approval." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <thead><tr><Th>No.</Th><Th>Reason</Th><Th>Location</Th><Th className="text-right">Value</Th><Th>Date</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <Td><Link href={`/inventory/adjustments/${a.id}`} className="font-medium text-brand underline">{a.number}</Link></Td>
                  <Td>{REASONS[a.reason_type]}</Td>
                  <Td>{a.locations?.name}</Td>
                  <Td className="text-right tabular-nums">{Number(a.total_value) ? formatMoney(a.total_value) : "—"}</Td>
                  <Td>{formatDate(a.created_at)}</Td>
                  <Td><StatusBadge status={a.status === "posted" ? "approved" : a.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No adjustments yet.</p>}
        </Card>
        {can(access, "inventory.adjust.request") && (
          <Card>
            <CardTitle>New adjustment</CardTitle>
            <ActionForm action={createAdjustment} submitLabel="Start">
              <Field label="Location" htmlFor="location_id">
                <Select id="location_id" name="location_id" required defaultValue={opts.locations[0]?.id}>
                  {opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
              <Field label="Reason" htmlFor="reason_type">
                <Select id="reason_type" name="reason_type" defaultValue="damage">
                  {Object.entries(REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Notes" htmlFor="notes"><Input id="notes" name="notes" placeholder="What happened?" /></Field>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
