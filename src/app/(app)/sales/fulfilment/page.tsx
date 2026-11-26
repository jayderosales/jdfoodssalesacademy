import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { orderShortages, totalShort, type Shortage } from "@/lib/sales/shortage";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { fulfilAction } from "../actions";

export const metadata = { title: "Fulfilment" };

const COLS: { status: string; title: string; hint: string; step?: string; button?: string }[] = [
  { status: "confirmed", title: "To pack", hint: "Paid or credit approved.", step: "pack", button: "Start packing" },
  { status: "packing", title: "Packing", hint: "Pick the lots on the pick list.", step: "ready", button: "Ready for pickup" },
  { status: "ready_for_pickup", title: "Waiting for courier", hint: "Stock already deducted." },
  { status: "dispatched", title: "With courier", hint: "Mark delivered when confirmed." },
];
const STATUS_LABEL: Record<string, string> = { confirmed: "To pack", packing: "Packing" };

type Line = { id: string; product_id: string; qty: string; products: { sku: string; name: string; item_type: string; pre_order: boolean } };
type Order = {
  id: string; number: string; status: string; total: string; location_id: string; confirmed_at: string | null; ready_at: string | null; dispatched_at: string | null;
  courier_note: string; channel: string; customers: { name: string } | null; sales_order_lines: Line[];
};
const qty = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 4 });

/** Warehouse board. "Ready for pickup" is where stock leaves the books. Orders missing stock wait in "Incomplete". */
export default async function FulfilmentPage() {
  await requirePermission("sales.fulfil");
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_orders")
    .select("id, number, status, total, location_id, confirmed_at, ready_at, dispatched_at, courier_note, channel, customers(name), sales_order_lines(id, product_id, qty, products(sku, name, item_type, pre_order))")
    .in("status", COLS.map((c) => c.status))
    .order("confirmed_at", { ascending: true })
    .limit(300);
  const rows = (data as unknown as Order[] | null) ?? [];

  // ---------------------------------------------------------------- shortages for orders not yet released
  const open = rows.filter((r) => r.status === "confirmed" || r.status === "packing");
  const openIds = open.map((r) => r.id);
  const bundleIds = [...new Set(open.flatMap((r) => r.sales_order_lines.filter((l) => l.products.item_type === "bundle").map((l) => l.product_id)))];
  const [{ data: allocs }, { data: comps }] = await Promise.all([
    openIds.length ? supabase.from("sales_order_allocations").select("order_id, line_id, product_id, qty").in("order_id", openIds) : Promise.resolve({ data: [] }),
    bundleIds.length ? supabase.from("bundle_components").select("bundle_id, component_id, qty").in("bundle_id", bundleIds) : Promise.resolve({ data: [] }),
  ]);
  const components = new Map<string, { componentId: string; qty: number }[]>();
  for (const c of (comps as { bundle_id: string; component_id: string; qty: string }[] | null) ?? []) {
    components.set(c.bundle_id, [...(components.get(c.bundle_id) ?? []), { componentId: c.component_id, qty: Number(c.qty) }]);
  }
  const allocations = (allocs as { order_id: string; line_id: string; product_id: string; qty: string }[] | null) ?? [];
  const short = new Map<string, Shortage[]>();
  for (const o of open) {
    const s = orderShortages(
      o.sales_order_lines.map((l) => ({ lineId: l.id, productId: l.product_id, qty: Number(l.qty), itemType: l.products.item_type })),
      allocations.filter((a) => a.order_id === o.id).map((a) => ({ lineId: a.line_id, productId: a.product_id, qty: Number(a.qty) })),
      components,
    );
    if (s.length) short.set(o.id, s);
  }
  const incomplete = open.filter((o) => short.has(o.id));
  const shortProducts = [...new Set([...short.values()].flat().map((s) => s.productId))];
  const locations = [...new Set(incomplete.map((o) => o.location_id))];
  const [{ data: avail }, { data: prods }] = await Promise.all([
    shortProducts.length ? supabase.from("stock_available").select("product_id, location_id, available").in("product_id", shortProducts).in("location_id", locations) : Promise.resolve({ data: [] }),
    shortProducts.length ? supabase.from("products").select("id, sku, name, base_unit, pre_order").in("id", shortProducts) : Promise.resolve({ data: [] }),
  ]);
  const available = new Map(((avail as { product_id: string; location_id: string; available: string }[] | null) ?? []).map((a) => [`${a.product_id}|${a.location_id}`, Number(a.available)]));
  const product = new Map(((prods as { id: string; sku: string; name: string; base_unit: string; pre_order: boolean }[] | null) ?? []).map((p) => [p.id, p]));
  const availAt = (productId: string, locationId: string) => available.get(`${productId}|${locationId}`) ?? 0;
  const coverable = (o: Order) => (short.get(o.id) ?? []).every((s) => availAt(s.productId, o.location_id) >= s.short);
  const totals = totalShort([...short.values()]);
  const availAll = (productId: string) => locations.reduce((sum, l) => sum + availAt(productId, l), 0);
  const waitingOrders = (productId: string) => incomplete.filter((o) => short.get(o.id)!.some((s) => s.productId === productId)).length;

  const card = (r: Order, c?: (typeof COLS)[number]) => (
    <Card key={r.id} className="p-3 text-sm">
      <div className="flex justify-between gap-2">
        <Link href={`/sales/orders/${r.id}`} className="font-semibold text-brand underline">{r.number}</Link>
        <span className="tabular-nums">{formatMoney(r.total)}</span>
      </div>
      <p>{r.customers?.name}</p>
      <p className="text-xs text-muted-foreground">{r.sales_order_lines.map((l) => `${l.products.sku} × ${Number(l.qty)}`).join(", ")}</p>
      {r.courier_note && <p className="text-xs">🚚 {r.courier_note}</p>}
      <p className="text-xs text-muted-foreground">{formatDate(r.dispatched_at ?? r.ready_at ?? r.confirmed_at, true)}</p>
      {c?.step && (
        <ActionForm action={fulfilAction} submitLabel={c.button!} className="mt-2" confirm={c.step === "ready" ? "Mark ready for pickup? Stock will be deducted." : undefined}>
          <input type="hidden" name="id" value={r.id} /><input type="hidden" name="step" value={c.step} />
        </ActionForm>
      )}
      {c && !c.step && <Link href={`/sales/orders/${r.id}`} className="mt-2 inline-block text-xs font-semibold text-brand underline">{c.status === "ready_for_pickup" ? "Hand to courier →" : "Mark delivered →"}</Link>}
    </Card>
  );

  return (
    <>
      <PageHeader title="Fulfilment" description="Pack paid orders, mark them ready for the courier (this deducts stock), then hand them over. Orders missing stock wait under Incomplete." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-2">
          <p className="px-1 font-semibold">Incomplete — waiting for stock ({incomplete.length})</p>
          <p className="mb-2 px-1 text-xs text-muted-foreground">Some items aren&apos;t in stock yet (often pre-orders).</p>
          <div className="space-y-2">
            {incomplete.map((r) => {
              const col = COLS.find((c) => c.status === r.status)!;
              const ready = coverable(r);
              return (
                <Card key={r.id} className="p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <Link href={`/sales/orders/${r.id}`} className="font-semibold text-brand underline">{r.number}</Link>
                    <span className="tabular-nums">{formatMoney(r.total)}</span>
                  </div>
                  <p>{r.customers?.name}</p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {short.get(r.id)!.map((s) => {
                      const p = product.get(s.productId);
                      const a = availAt(s.productId, r.location_id);
                      return (
                        <li key={s.productId} className={a >= s.short ? "text-success" : "text-danger"}>
                          <b>{p?.sku ?? "?"}</b> short {qty(s.short)} {p?.base_unit} (available now: {qty(Math.max(a, 0))}){p?.pre_order ? " · pre-order" : ""}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">Status: {STATUS_LABEL[r.status]} · {formatDate(r.confirmed_at, true)}</p>
                  {ready ? (
                    <ActionForm action={fulfilAction} submitLabel={col.button!} className="mt-2" confirm={col.step === "ready" ? "Mark ready for pickup? Stock will be deducted." : undefined}>
                      <input type="hidden" name="id" value={r.id} /><input type="hidden" name="step" value={col.step!} />
                    </ActionForm>
                  ) : (
                    <p className="mt-2 text-xs text-amber-800">Waiting for stock. It can be packed once the missing items arrive.</p>
                  )}
                </Card>
              );
            })}
            {incomplete.length === 0 && <p className="px-1 text-xs text-muted-foreground">None. Every open order has its stock.</p>}
          </div>
        </div>
        {COLS.map((c) => {
          const col = rows.filter((r) => r.status === c.status && !short.has(r.id));
          return (
            <div key={c.status} className="rounded-xl bg-muted/50 p-2">
              <p className="px-1 font-semibold">{c.title} ({col.length})</p>
              <p className="mb-2 px-1 text-xs text-muted-foreground">{c.hint}</p>
              <div className="space-y-2">
                {col.map((r) => card(r, c))}
                {col.length === 0 && <p className="px-1 text-xs text-muted-foreground">Empty.</p>}
              </div>
            </div>
          );
        })}
      </div>
      {totals.size > 0 && (
        <Card className="mt-4">
          <CardTitle>Products short</CardTitle>
          <p className="mb-2 text-sm text-muted-foreground">What the incomplete orders still need, so production or purchasing knows what to make or buy.</p>
          <Table>
            <thead><tr><Th>Product</Th><Th className="text-right">Short</Th><Th className="text-right">Available now</Th><Th className="text-right">Still to make / buy</Th><Th className="text-right">Orders waiting</Th></tr></thead>
            <tbody>
              {[...totals.entries()].sort((a, b) => b[1] - a[1]).map(([pid, need]) => {
                const p = product.get(pid);
                const a = Math.max(availAll(pid), 0);
                const gap = Math.max(need - a, 0);
                return (
                  <tr key={pid}>
                    <Td><b>{p?.sku ?? "?"}</b> <span className="text-muted-foreground">{p?.name}</span>{p?.pre_order && <span className="ml-1 rounded bg-muted px-1 text-xs">pre-order</span>}</Td>
                    <Td className="text-right tabular-nums">{qty(need)} {p?.base_unit}</Td>
                    <Td className="text-right tabular-nums">{qty(a)}</Td>
                    <Td className={`text-right font-semibold tabular-nums ${gap > 0 ? "text-danger" : "text-success"}`}>{gap > 0 ? `${qty(gap)} ${p?.base_unit ?? ""}` : "Covered"}</Td>
                    <Td className="text-right">{waitingOrders(pid)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">Available counts released, unexpired stock not already reserved, at the orders&apos; ship-from locations. <Link href="/inventory/reorder" className="underline">Reorder</Link> · <Link href="/manufacturing" className="underline">Daily production</Link></p>
        </Card>
      )}
    </>
  );
}
