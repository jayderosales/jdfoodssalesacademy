import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteReorderRule, saveReorderRule } from "../actions";
import { ProductDatalist, qtyFmt } from "../doc-parts";
import { catalogOptions } from "../options";

export const metadata = { title: "Reorder" };

export default async function ReorderPage() {
  await requirePermission(["inventory.reorder.manage", "inventory.view_cost"]);
  const access = await getAccess();
  const canEdit = can(access, "inventory.reorder.manage");
  const opts = await catalogOptions();
  const supabase = await createClient();
  const [{ data: suggestions }, { data: rules }] = await Promise.all([
    supabase.from("reorder_suggestions").select("*").order("sku"),
    supabase.from("reorder_rules").select("product_id, location_id, min_qty, max_qty, safety_qty, lead_time_days, products(sku, name), locations(name)").order("product_id").limit(1000),
  ]);
  const sug = (suggestions as { product_id: string; location_id: string; sku: string; name: string; location_name: string; min_qty: string; max_qty: string; available: string; suggested_qty: string; lead_time_days: number }[] | null) ?? [];
  const rs = (rules as unknown as { product_id: string; location_id: string; min_qty: string; max_qty: string; safety_qty: string; lead_time_days: number; products: { sku: string; name: string } | null; locations: { name: string } | null }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Reorder" description="Products at or below their minimum. Suggested quantity = maximum − available (purchase orders come with Procurement in Phase 4)." />
      <Card className="mb-4">
        <CardTitle>To reorder ({sug.length})</CardTitle>
        {sug.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is below its reorder level.</p>
        ) : (
          <Table>
            <thead><tr><Th>Product</Th><Th>Location</Th><Th className="text-right">Available</Th><Th className="text-right">Min / Max</Th><Th className="text-right">Suggested</Th><Th>Lead time</Th></tr></thead>
            <tbody>
              {sug.map((s) => (
                <tr key={`${s.product_id}:${s.location_id}`}>
                  <Td>{s.sku}<div className="text-xs text-muted-foreground">{s.name}</div></Td>
                  <Td>{s.location_name}</Td>
                  <Td className="text-right tabular-nums text-danger">{qtyFmt(s.available)}</Td>
                  <Td className="text-right tabular-nums">{qtyFmt(s.min_qty)} / {qtyFmt(s.max_qty)}</Td>
                  <Td className="text-right font-semibold tabular-nums">{qtyFmt(s.suggested_qty)}</Td>
                  <Td>{s.lead_time_days} days</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Reorder levels</CardTitle>
          <Table>
            <thead><tr><Th>Product</Th><Th>Location</Th><Th className="text-right">Min</Th><Th className="text-right">Max</Th><Th className="text-right">Safety</Th><Th>Lead</Th>{canEdit && <Th />}</tr></thead>
            <tbody>
              {rs.map((r) => (
                <tr key={`${r.product_id}:${r.location_id}`}>
                  <Td>{r.products?.sku}<div className="text-xs text-muted-foreground">{r.products?.name}</div></Td>
                  <Td>{r.locations?.name}</Td>
                  <Td className="text-right tabular-nums">{qtyFmt(r.min_qty)}</Td>
                  <Td className="text-right tabular-nums">{qtyFmt(r.max_qty)}</Td>
                  <Td className="text-right tabular-nums">{qtyFmt(r.safety_qty)}</Td>
                  <Td>{r.lead_time_days}d</Td>
                  {canEdit && (
                    <Td>
                      <ActionForm action={deleteReorderRule} submitLabel="Remove" variant="outline" className="flex">
                        <input type="hidden" name="product_id" value={r.product_id} />
                        <input type="hidden" name="location_id" value={r.location_id} />
                      </ActionForm>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          {rs.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No reorder levels set yet.</p>}
        </Card>
        {canEdit && (
          <Card>
            <CardTitle>Set a reorder level</CardTitle>
            <ProductDatalist />
            <ActionForm action={saveReorderRule} submitLabel="Save">
              <Field label="Product" htmlFor="product"><Input id="product" name="product" list="product-list" required autoComplete="off" /></Field>
              <Field label="Location" htmlFor="location_id">
                <Select id="location_id" name="location_id" defaultValue={opts.locations[0]?.id}>
                  {opts.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Minimum" htmlFor="min_qty"><Input id="min_qty" name="min_qty" type="number" min={0} step="any" required /></Field>
                <Field label="Maximum" htmlFor="max_qty"><Input id="max_qty" name="max_qty" type="number" min={0} step="any" required /></Field>
                <Field label="Safety stock" htmlFor="safety_qty"><Input id="safety_qty" name="safety_qty" type="number" min={0} step="any" defaultValue={0} /></Field>
                <Field label="Lead time (days)" htmlFor="lead_time_days"><Input id="lead_time_days" name="lead_time_days" type="number" min={0} defaultValue={7} /></Field>
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
