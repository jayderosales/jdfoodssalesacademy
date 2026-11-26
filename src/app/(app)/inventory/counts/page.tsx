import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { createCount } from "../actions";
import { catalogOptions } from "../options";

export const metadata = { title: "Cycle counts" };

export default async function CountsPage() {
  await requirePermission("inventory.count");
  const opts = await catalogOptions();
  const supabase = await createClient();
  const { data } = await supabase.from("stock_counts").select("id, number, scope_label, status, total_variance_value, created_at, locations(name)").order("created_at", { ascending: false }).limit(100);
  const rows = (data as unknown as { id: string; number: string; scope_label: string; status: string; total_variance_value: string; created_at: string; locations: { name: string } | null }[] | null) ?? [];
  return (
    <>
      <PageHeader title="Cycle counts" description="Count part of the warehouse, compare with the system, and post differences after approval." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table>
            <thead><tr><Th>No.</Th><Th>What</Th><Th>Location</Th><Th className="text-right">Variance</Th><Th>Started</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <Td><Link href={`/inventory/counts/${c.id}`} className="font-medium text-brand underline">{c.number}</Link></Td>
                  <Td>{c.scope_label}</Td>
                  <Td>{c.locations?.name}</Td>
                  <Td className="text-right tabular-nums">{Number(c.total_variance_value) ? formatMoney(c.total_variance_value) : "—"}</Td>
                  <Td>{formatDate(c.created_at)}</Td>
                  <Td><StatusBadge status={c.status === "posted" ? "approved" : c.status === "counting" ? "draft" : c.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No counts yet.</p>}
        </Card>
        <Card>
          <CardTitle>New count</CardTitle>
          <ActionForm action={createCount} submitLabel="Create count sheet">
            <Field label="Location" htmlFor="location_id">
              <Select id="location_id" name="location_id" required defaultValue={opts.locations[0]?.id}>
                {opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label="Zone (optional)" htmlFor="zone"><Input id="zone" name="zone" placeholder="Leave blank for all bins" /></Field>
            <Field label="ABC class (optional)" htmlFor="abc" hint="A = the 80% of value that moves most.">
              <Select id="abc" name="abc" defaultValue="">
                <option value="">All products</option>
                <option value="A">A items</option>
                <option value="B">B items</option>
                <option value="C">C items</option>
              </Select>
            </Field>
            <Field label="Name (optional)" htmlFor="label"><Input id="label" name="label" placeholder="e.g. Monthly sauces count" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="blind" defaultChecked className="size-4" /> Blind count (counters don&apos;t see system quantities)</label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
