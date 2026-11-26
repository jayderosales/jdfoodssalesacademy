import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ScanLink } from "@/components/shared/scan-original";
import { Badge, Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { createTransfer } from "../actions";
import { catalogOptions } from "../options";

export const metadata = { title: "Transfers" };

const TONE: Record<string, "neutral" | "warning" | "success"> = { draft: "neutral", dispatched: "warning", received: "success", cancelled: "neutral" };

export default async function TransfersPage() {
  await requirePermission("inventory.transfer");
  const opts = await catalogOptions();
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_transfers")
    .select("id, number, status, created_at, dispatched_at, received_at, from:locations!stock_transfers_from_location_id_fkey(name), to:locations!stock_transfers_to_location_id_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data as unknown as { id: string; number: string; status: string; created_at: string; dispatched_at: string | null; received_at: string | null; from: { name: string } | null; to: { name: string } | null }[] | null) ?? [];
  return (
    <>
      <PageHeader title="Transfers" description="Moving stock between locations in two steps: dispatch, then receive." actions={<ScanLink kind="stock_transfer" label="Scan a transmittal slip" />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <thead><tr><Th>No.</Th><Th>From → To</Th><Th>Created</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <Td><Link href={`/inventory/transfers/${t.id}`} className="font-medium text-brand underline">{t.number}</Link></Td>
                  <Td>{t.from?.name} → {t.to?.name}</Td>
                  <Td>{formatDate(t.created_at, true)}</Td>
                  <Td><Badge tone={TONE[t.status]}>{t.status === "dispatched" ? "in transit" : t.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No transfers yet.</p>}
        </Card>
        <Card>
          <CardTitle>New transfer</CardTitle>
          <ActionForm action={createTransfer} submitLabel="Start transfer">
            <Field label="From" htmlFor="from_location_id">
              <Select id="from_location_id" name="from_location_id" required defaultValue={opts.locations[0]?.id}>
                {opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="To" htmlFor="to_location_id">
              <Select id="to_location_id" name="to_location_id" required defaultValue={opts.locations[1]?.id}>
                {opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="Notes" htmlFor="notes"><Input id="notes" name="notes" /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
