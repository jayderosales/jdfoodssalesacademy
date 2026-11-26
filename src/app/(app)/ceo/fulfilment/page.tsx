import Link from "next/link";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { orderShortages, totalShort, type Shortage } from "@/lib/sales/shortage";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { peso, Tile } from "../parts";

export const metadata = { title: "CEO reports: incomplete fulfilment" };

type O = {
  id: string; number: string; status: string; total: string; location_id: string; confirmed_at: string | null; placed_at: string | null;
  customers: { name: string } | null;
  sales_order_lines: { id: string; product_id: string; qty: string; products: { item_type: string } }[];
  sales_order_allocations: { line_id: string; product_id: string; qty: string }[];
};

export default async function CeoFulfilment() {
  await requirePermission("ceo.reports.view");
  const supabase = await createClient();
  const today = manilaToday();
  const { data } = await supabase
    .from("sales_orders")
    .select("id, number, status, total, location_id, confirmed_at, placed_at, customers(name), sales_order_lines(id, product_id, qty, products(item_type)), sales_order_allocations(line_id, product_id, qty)")
    .in("status", ["confirmed", "packing"])
    .order("confirmed_at", { ascending: true })
    .limit(500);
  const orders = (data as unknown as O[] | null) ?? [];
  const bundleIds = [...new Set(orders.flatMap((o) => o.sales_order_lines.filter((l) => l.products.item_type === "bundle").map((l) => l.product_id)))];
  const { data: comps } = bundleIds.length ? await supabase.from("bundle_components").select("bundle_id, component_id, qty").in("bundle_id", bundleIds) : { data: [] };
  const components = new Map<string, { componentId: string; qty: number }[]>();
  for (const c of (comps as { bundle_id: string; component_id: string; qty: string }[] | null) ?? []) components.set(c.bundle_id, [...(components.get(c.bundle_id) ?? []), { componentId: c.component_id, qty: Number(c.qty) }]);

  const incomplete = orders
    .map((o) => ({
      o,
      short: orderShortages(
        o.sales_order_lines.map((l) => ({ lineId: l.id, productId: l.product_id, qty: Number(l.qty), itemType: l.products.item_type })),
        o.sales_order_allocations.map((a) => ({ lineId: a.line_id, productId: a.product_id, qty: Number(a.qty) })),
        components,
      ),
    }))
    .filter((x) => x.short.length > 0);
  const productIds = [...new Set(incomplete.flatMap((x) => x.short.map((s) => s.productId)))];
  const [{ data: prods }, { data: avail }] = productIds.length
    ? await Promise.all([
        supabase.from("products").select("id, sku, name, base_unit, pre_order").in("id", productIds),
        supabase.from("stock_available").select("product_id, location_id, available").in("product_id", productIds),
      ])
    : [{ data: [] }, { data: [] }];
  const P = new Map(((prods as { id: string; sku: string; name: string; base_unit: string; pre_order: boolean }[] | null) ?? []).map((p) => [p.id, p]));
  const availAt = (product: string, location: string) => Number(((avail as { product_id: string; location_id: string; available: string }[] | null) ?? []).find((a) => a.product_id === product && a.location_id === location)?.available ?? 0);
  const availAll = (product: string) => ((avail as { product_id: string; available: string }[] | null) ?? []).filter((a) => a.product_id === product).reduce((s, a) => s + Number(a.available), 0);
  const totals = totalShort(incomplete.map((x) => x.short));
  const value = incomplete.reduce((s, x) => s + Number(x.o.total), 0);
  const age = (d: string | null) => (d ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(d.slice(0, 10) + "T00:00:00Z")) / 86_400_000)) : 0);
  const line = (s: Shortage, loc: string) => {
    const p = P.get(s.productId);
    const a = availAt(s.productId, loc);
    return <li key={s.productId}><b>{p?.sku}</b> short {s.short} {p?.base_unit}{p?.pre_order ? " (pre-order)" : ""} · <span className={a >= s.short ? "text-success" : "text-danger"}>available now {a}</span></li>;
  };

  return (
    <>
      <PageHeader title="Incomplete fulfilment" description="Paid or credit-approved orders that can't be released yet because items aren't in stock. Usually pre-order products waiting for production." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Orders waiting for stock" value={incomplete.length} tone={incomplete.length ? "warn" : "good"} />
        <Tile label="Value of those orders" value={peso(value)} />
        <Tile label="Products short" value={totals.size} href="#short" />
      </div>
      <Card className="mb-4">
        <CardTitle>Orders</CardTitle>
        {incomplete.length === 0 ? <p className="text-sm text-muted-foreground">Every paid order has its stock. Nothing is waiting.</p> : (
          <Table>
            <thead><tr><Th>Order</Th><Th>Customer</Th><Th>Waiting</Th><Th>Missing items</Th><Th className="text-right">Value</Th></tr></thead>
            <tbody>
              {incomplete.sort((a, b) => age(b.o.confirmed_at ?? b.o.placed_at) - age(a.o.confirmed_at ?? a.o.placed_at)).map(({ o, short }) => {
                const days = age(o.confirmed_at ?? o.placed_at);
                return (
                  <tr key={o.id} className="align-top">
                    <Td><Link href={`/sales/orders/${o.id}`} className="font-medium text-brand underline">{o.number}</Link><div className="text-xs text-muted-foreground">{o.status === "packing" ? "Packing" : "To pack"}</div></Td>
                    <Td>{o.customers?.name}</Td>
                    <Td className={days >= 3 ? "font-semibold text-danger" : ""}>{days} day{days === 1 ? "" : "s"}<div className="text-xs font-normal text-muted-foreground">since {formatDate(o.confirmed_at ?? o.placed_at)}</div></Td>
                    <Td><ul className="space-y-0.5 text-xs">{short.map((s) => line(s, o.location_id))}</ul></Td>
                    <Td className="text-right tabular-nums">{peso(o.total)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <Card id="short">
        <CardTitle>Products short (to make or buy)</CardTitle>
        {totals.size === 0 ? <p className="text-sm text-muted-foreground">Nothing short.</p> : (
          <Table>
            <thead><tr><Th>Product</Th><Th className="text-right">Orders need</Th><Th className="text-right">Available (all sites)</Th><Th className="text-right">Still to make / buy</Th></tr></thead>
            <tbody>
              {[...totals.entries()].sort((a, b) => b[1] - a[1]).map(([pid, need]) => {
                const p = P.get(pid);
                const a = availAll(pid);
                return (
                  <tr key={pid}>
                    <Td><b>{p?.sku}</b> <span className="text-muted-foreground">{p?.name}</span>{p?.pre_order && <span className="ml-1 rounded bg-muted px-1 text-xs">pre-order</span>}</Td>
                    <Td className="text-right tabular-nums">{need} {p?.base_unit}</Td>
                    <Td className="text-right tabular-nums">{a}</Td>
                    <Td className={`text-right font-semibold tabular-nums ${need - a > 0 ? "text-danger" : "text-success"}`}>{Math.max(0, Math.round((need - a) * 10000) / 10000)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
