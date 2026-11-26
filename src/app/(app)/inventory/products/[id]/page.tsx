import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { RecordPage } from "@/components/shared/record-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, Badge, Card, CardTitle, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { ITEM_TYPE_LABEL } from "@/lib/tables/registry";
import { formatDate } from "@/lib/utils";
import { catalogOptions } from "../../options";
import { addBarcode, addComponent, addUnit, removeBarcode, removeComponent, removeUnit, setCost } from "../actions";
import { ProductForm, type ProductValues } from "../product-form";

export const metadata = { title: "Product" };

const qty = (n: string | number) => Number(n).toLocaleString("en-PH", { maximumFractionDigits: 4 });

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const { id } = await params;
  const { tab = "details", created } = await searchParams;
  await requirePermission("inventory.view");
  const access = await getAccess();
  const canEdit = can(access, "inventory.products.manage");
  const seeCost = can(access, "inventory.view_cost");
  const canCost = can(access, "inventory.cost.manage");
  const supabase = await createClient();
  const [{ data }, opts, { data: units }, { data: barcodes }, { data: comps }, { data: balances }, { data: cost }, { data: costLog }, { data: allProducts }] = await Promise.all([
    supabase.from("products").select("*, brands(name), product_categories(name)").eq("id", id).maybeSingle(),
    catalogOptions(),
    supabase.from("product_units").select("unit_code, factor").eq("product_id", id),
    supabase.from("product_barcodes").select("barcode, unit_code").eq("product_id", id),
    supabase.from("bundle_components").select("component_id, qty, products!bundle_components_component_id_fkey(sku, name)").eq("bundle_id", id),
    supabase.from("stock_balances").select("on_hand, reserved, locations(name), bins(code), batches(lot_no, expiry_date, qa_status)").eq("product_id", id).gt("on_hand", 0),
    supabase.from("product_costs").select("avg_cost, updated_at").eq("product_id", id).maybeSingle(),
    supabase.from("product_cost_changes").select("old_cost, new_cost, qty_on_hand, value_change, reason, changed_at").eq("product_id", id).order("changed_at", { ascending: false }).limit(10),
    supabase.from("products").select("id, sku, name").neq("id", id).not("item_type", "in", "(bundle,service)").eq("active", true).order("sku").limit(1000),
  ]);
  if (!data) notFound();
  const p = data as ProductValues & { id: string; sku: string; name: string; item_type: string; base_unit: string; srp: string | null; active: boolean; brands: { name: string } | null; product_categories: { name: string } | null };
  const stockRows = (balances as unknown as { on_hand: string; reserved: string; locations: { name: string } | null; bins: { code: string } | null; batches: { lot_no: string; expiry_date: string | null; qa_status: string } | null }[] | null) ?? [];
  const totalQty = stockRows.reduce((s, r) => s + Number(r.on_hand), 0);
  const avg = (cost as { avg_cost: string } | null)?.avg_cost ?? null;
  const stocked = !["service", "bundle"].includes(p.item_type);

  return (
    <RecordPage
      backHref="/inventory/products"
      backLabel="Products"
      title={`${p.sku} · ${p.name}`}
      status={!p.active ? <StatusBadge status="inactive" /> : undefined}
      subtitle={`${p.brands?.name ?? "No brand"} · ${p.product_categories?.name ?? "No category"} · ${ITEM_TYPE_LABEL[p.item_type]} · SRP ${formatMoney(p.srp)}`}
      tabs={[{ key: "details", label: "Details" }, ...(stocked ? [{ key: "stock", label: "Stock", count: stockRows.length }] : []), { key: "history", label: "History" }]}
      activeTab={tab}
      actions={stocked ? <Link href={`/inventory/stock-card/${p.id}`} className="text-sm text-brand underline">Stock card →</Link> : undefined}
    >
      {created && <div className="mb-4"><Alert tone="success">Product added. Set its cost below, and add other units (e.g. case) and barcodes.</Alert></div>}
      {tab === "details" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle>Product</CardTitle>
            <ProductForm p={p} brands={opts.brands} categories={opts.categories} units={opts.units} readOnly={!canEdit} />
          </Card>
          <div className="space-y-4">
            {seeCost && stocked && (
              <Card>
                <CardTitle>Cost</CardTitle>
                <p className="text-2xl font-bold">{avg != null ? `${formatMoney(Number(avg).toFixed(2))}` : "—"} <span className="text-sm font-normal text-muted-foreground">per {p.base_unit}</span></p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Moving average, updated automatically by receipts. {totalQty > 0 ? `${qty(totalQty)} on hand worth ${formatMoney((totalQty * Number(avg ?? 0)).toFixed(2))}.` : "No stock on hand."}
                  {p.srp && avg && Number(avg) > 0 && ` Margin at SRP: ${Math.round(((Number(p.srp) - Number(avg)) / Number(p.srp)) * 100)}%.`}
                </p>
                {canCost && (
                  <ActionForm action={setCost} submitLabel={totalQty > 0 ? "Revalue" : "Save cost"} variant="outline">
                    <input type="hidden" name="id" value={p.id} />
                    <Field label={`New cost per ${p.base_unit} (₱)`} htmlFor="cost"><Input id="cost" name="cost" inputMode="decimal" required placeholder="85.50" /></Field>
                    {totalQty > 0 && (
                      <Field label="Reason (required: there's stock on hand)" htmlFor="reason"><Input id="reason" name="reason" required placeholder="e.g. Supplier price increase" /></Field>
                    )}
                  </ActionForm>
                )}
                {(costLog ?? []).length > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Cost changes</summary>
                    <ul className="mt-1 space-y-1">
                      {(costLog as { old_cost: string; new_cost: string; qty_on_hand: string; value_change: string; reason: string; changed_at: string }[]).map((c, i) => (
                        <li key={i}>{formatDate(c.changed_at, true)}: {formatMoney(Number(c.old_cost).toFixed(2))} → {formatMoney(Number(c.new_cost).toFixed(2))}{Number(c.qty_on_hand) > 0 && ` (${formatMoney(c.value_change)} on ${qty(c.qty_on_hand)})`} · {c.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            )}
            {stocked && (
              <Card>
                <CardTitle>Other units</CardTitle>
                <p className="mb-2 text-xs text-muted-foreground">For receiving and counting by the case or box. Stock is always kept in {p.base_unit}.</p>
                <ul className="mb-3 divide-y text-sm">
                  {((units as { unit_code: string; factor: string }[] | null) ?? []).map((u) => (
                    <li key={u.unit_code} className="flex items-center justify-between py-1">
                      <span>1 {u.unit_code} = {qty(u.factor)} {p.base_unit}</span>
                      {canEdit && <ActionForm action={removeUnit} submitLabel="Remove" variant="outline" className="flex"><input type="hidden" name="product_id" value={p.id} /><input type="hidden" name="unit_code" value={u.unit_code} /></ActionForm>}
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <ActionForm action={addUnit} submitLabel="Add unit" variant="outline" className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="product_id" value={p.id} />
                    <Field label="1" htmlFor="unit_code">
                      <Select id="unit_code" name="unit_code" defaultValue="case" className="w-28">
                        {opts.units.filter((u) => u.code !== p.base_unit).map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
                      </Select>
                    </Field>
                    <Field label={`= how many ${p.base_unit}`} htmlFor="factor"><Input id="factor" name="factor" type="number" min={0.0001} step="any" required className="w-24" /></Field>
                  </ActionForm>
                )}
              </Card>
            )}
            <Card>
              <CardTitle>Barcodes</CardTitle>
              <ul className="mb-3 divide-y text-sm">
                {((barcodes as { barcode: string; unit_code: string }[] | null) ?? []).map((b) => (
                  <li key={b.barcode} className="flex items-center justify-between py-1">
                    <span className="font-mono">{b.barcode} <span className="text-xs text-muted-foreground">({b.unit_code})</span></span>
                    {canEdit && <ActionForm action={removeBarcode} submitLabel="Remove" variant="outline" className="flex"><input type="hidden" name="product_id" value={p.id} /><input type="hidden" name="barcode" value={b.barcode} /></ActionForm>}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <ActionForm action={addBarcode} submitLabel="Add barcode" variant="outline" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="product_id" value={p.id} />
                  <Field label="Barcode" htmlFor="barcode"><Input id="barcode" name="barcode" required className="w-40" /></Field>
                  <Field label="For" htmlFor="bunit">
                    <Select id="bunit" name="unit_code" defaultValue={p.base_unit} className="w-28">
                      {[p.base_unit, ...((units as { unit_code: string }[] | null) ?? []).map((u) => u.unit_code)].map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </Field>
                </ActionForm>
              )}
            </Card>
            {p.item_type === "bundle" && (
              <Card>
                <CardTitle>What&apos;s in the bundle</CardTitle>
                <p className="mb-2 text-xs text-muted-foreground">Selling one bundle takes these items out of stock.</p>
                <ul className="mb-3 divide-y text-sm">
                  {((comps as unknown as { component_id: string; qty: string; products: { sku: string; name: string } | null }[] | null) ?? []).map((c) => (
                    <li key={c.component_id} className="flex items-center justify-between py-1">
                      <span>{qty(c.qty)} × {c.products?.sku} {c.products?.name}</span>
                      {canEdit && <ActionForm action={removeComponent} submitLabel="Remove" variant="outline" className="flex"><input type="hidden" name="bundle_id" value={p.id} /><input type="hidden" name="component_id" value={c.component_id} /></ActionForm>}
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <ActionForm action={addComponent} submitLabel="Add item" variant="outline">
                    <input type="hidden" name="bundle_id" value={p.id} />
                    <Field label="Product" htmlFor="component_id">
                      <Select id="component_id" name="component_id" required defaultValue="">
                        <option value="" disabled>Choose</option>
                        {((allProducts as { id: string; sku: string; name: string }[] | null) ?? []).map((o) => <option key={o.id} value={o.id}>{o.sku} · {o.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Quantity" htmlFor="cqty"><Input id="cqty" name="qty" type="number" min={0.0001} step="any" defaultValue={1} required /></Field>
                  </ActionForm>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
      {tab === "stock" && (
        <Card>
          <CardTitle>Stock by location and batch · {qty(totalQty)} {p.base_unit}</CardTitle>
          {stockRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock on hand.</p>
          ) : (
            <Table>
              <thead><tr><Th>Location</Th><Th>Bin</Th><Th>Lot</Th><Th>Expiry</Th><Th>QA</Th><Th className="text-right">On hand</Th><Th className="text-right">Reserved</Th></tr></thead>
              <tbody>
                {stockRows.map((r, i) => (
                  <tr key={i}>
                    <Td>{r.locations?.name}</Td>
                    <Td>{r.bins?.code}</Td>
                    <Td className="font-mono">{r.batches?.lot_no}</Td>
                    <Td>{formatDate(r.batches?.expiry_date)}</Td>
                    <Td><Badge tone={r.batches?.qa_status === "released" ? "success" : r.batches?.qa_status === "quarantine" ? "warning" : "danger"}>{r.batches?.qa_status}</Badge></Td>
                    <Td className="text-right tabular-nums">{qty(r.on_hand)}</Td>
                    <Td className="text-right tabular-nums">{qty(r.reserved)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
      {tab === "history" && <RecordHistory tables={["products"]} recordIds={[p.id]} />}
    </RecordPage>
  );
}
