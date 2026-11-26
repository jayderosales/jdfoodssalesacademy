import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { createReceipt } from "../actions";
import { catalogOptions } from "../options";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage() {
  await requirePermission("inventory.receive");
  const opts = await catalogOptions();
  const supabase = await createClient();
  const { data } = await supabase.from("stock_receipts").select("id, number, supplier_name, reference, received_on, status, locations(name)").order("created_at", { ascending: false }).limit(100);
  const rows = (data as unknown as { id: string; number: string; supplier_name: string; reference: string; received_on: string; status: string; locations: { name: string } | null }[] | null) ?? [];
  return (
    <>
      <PageHeader title="Receipts" description="Stock coming in (purchase-order receiving arrives with Procurement in Phase 4)." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <thead><tr><Th>No.</Th><Th>Location</Th><Th>From</Th><Th>Date</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td><Link href={`/inventory/receipts/${r.id}`} className="font-medium text-brand underline">{r.number}</Link></Td>
                  <Td>{r.locations?.name}</Td>
                  <Td>{r.supplier_name || "—"}{r.reference && <div className="text-xs text-muted-foreground">Ref {r.reference}</div>}</Td>
                  <Td>{formatDate(r.received_on)}</Td>
                  <Td><StatusBadge status={r.status === "posted" ? "approved" : r.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No receipts yet.</p>}
        </Card>
        <Card>
          <CardTitle>New receipt</CardTitle>
          <ActionForm action={createReceipt} submitLabel="Start receipt">
            <Field label="Into location" htmlFor="location_id">
              <Select id="location_id" name="location_id" required defaultValue={opts.locations[0]?.id}>
                {opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="From (supplier / source)" htmlFor="supplier_name"><Input id="supplier_name" name="supplier_name" placeholder="e.g. Production, or supplier name" /></Field>
            <Field label="Reference (DR / invoice no.)" htmlFor="reference"><Input id="reference" name="reference" /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
