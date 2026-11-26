import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { RecordPage } from "@/components/shared/record-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addReceiptLine, postReceipt, removeReceiptLine } from "../../actions";
import { ProductDatalist, qtyFmt } from "../../doc-parts";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "lines" } = await searchParams;
  await requirePermission("inventory.view");
  const access = await getAccess();
  const supabase = await createClient();
  const [{ data }, { data: lines }, { data: units }] = await Promise.all([
    supabase.from("stock_receipts").select("*, locations(name)").eq("id", id).maybeSingle(),
    supabase.from("stock_receipt_lines").select("id, qty, unit_code, unit_cost, lot_no, mfg_date, expiry_date, products(sku, name, base_unit)").eq("receipt_id", id),
    supabase.from("units").select("code, name").order("name"),
  ]);
  if (!data) notFound();
  const r = data as { id: string; number: string; status: string; location_id: string; supplier_name: string; reference: string; received_on: string; locations: { name: string } | null };
  const draft = r.status === "draft" && can(access, "inventory.receive");
  const rows = (lines as unknown as { id: string; qty: string; unit_code: string; unit_cost: string | null; lot_no: string; mfg_date: string | null; expiry_date: string | null; products: { sku: string; name: string; base_unit: string } | null }[] | null) ?? [];
  const seeCost = can(access, "inventory.view_cost");

  return (
    <RecordPage
      backHref="/inventory/receipts"
      backLabel="Receipts"
      title={r.number}
      status={<StatusBadge status={r.status === "posted" ? "approved" : r.status} />}
      subtitle={`Into ${r.locations?.name} · ${r.supplier_name || "no source"}${r.reference ? ` · ref ${r.reference}` : ""} · ${formatDate(r.received_on)}`}
      tabs={[{ key: "lines", label: "Lines", count: rows.length }, { key: "history", label: "History" }]}
      activeTab={tab}
      actions={
        draft && rows.length > 0 ? (
          <ActionForm action={postReceipt} submitLabel="Post receipt" className="flex flex-col gap-2" confirm="Post this receipt? Stock will be added and this can't be edited afterwards.">
            <input type="hidden" name="id" value={r.id} />
          </ActionForm>
        ) : undefined
      }
    >
      {tab === "lines" && (
        <div className="space-y-4">
          <Card>
            <Table>
              <thead><tr><Th>Product</Th><Th className="text-right">Qty</Th><Th>Lot</Th><Th>Mfg</Th><Th>Expiry</Th>{seeCost && <Th className="text-right">Cost / unit</Th>}{draft && <Th />}</tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <Td>{l.products?.sku}<div className="text-xs text-muted-foreground">{l.products?.name}</div></Td>
                    <Td className="text-right tabular-nums">{qtyFmt(l.qty)} {l.unit_code}</Td>
                    <Td className="font-mono text-xs">{l.lot_no || "—"}</Td>
                    <Td>{formatDate(l.mfg_date)}</Td>
                    <Td>{formatDate(l.expiry_date)}</Td>
                    {seeCost && <Td className="text-right tabular-nums">{l.unit_cost != null ? formatMoney(Number(l.unit_cost).toFixed(2)) : "avg"}</Td>}
                    {draft && (
                      <Td>
                        <ActionForm action={removeReceiptLine} submitLabel="Remove" variant="outline" className="flex">
                          <input type="hidden" name="line_id" value={l.id} />
                          <input type="hidden" name="receipt_id" value={r.id} />
                        </ActionForm>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
            {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No lines yet.</p>}
          </Card>
          {draft && (
            <Card>
              <CardTitle>Add a line</CardTitle>
              <ProductDatalist />
              <ActionForm action={addReceiptLine} submitLabel="Add line">
                <input type="hidden" name="receipt_id" value={r.id} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2">
                    <Field label="Product (type SKU or name, or scan)" htmlFor="product"><Input id="product" name="product" list="product-list" required autoComplete="off" /></Field>
                  </div>
                  <Field label="Quantity" htmlFor="qty"><Input id="qty" name="qty" type="number" min={0.0001} step="any" required /></Field>
                  <Field label="Unit (blank = product's unit)" htmlFor="unit_code">
                    <Select id="unit_code" name="unit_code" defaultValue="">
                      <option value="">Product&apos;s unit</option>
                      {((units as { code: string; name: string }[] | null) ?? []).map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Lot no." htmlFor="lot_no"><Input id="lot_no" name="lot_no" /></Field>
                  <Field label="Manufactured" htmlFor="mfg_date"><Input id="mfg_date" name="mfg_date" type="date" /></Field>
                  <Field label="Expiry (blank = from shelf life)" htmlFor="expiry_date"><Input id="expiry_date" name="expiry_date" type="date" /></Field>
                  {seeCost && <Field label="Cost per unit entered (blank = average)" htmlFor="unit_cost"><Input id="unit_cost" name="unit_cost" inputMode="decimal" /></Field>}
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
      {tab === "history" && <RecordHistory tables={["stock_receipts", "stock_receipt_lines"]} recordIds={[r.id, ...rows.map((l) => l.id)]} />}
    </RecordPage>
  );
}
