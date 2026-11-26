import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
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

/** Warehouse board. "Ready for pickup" is where stock leaves the books. */
export default async function FulfilmentPage() {
  await requirePermission("sales.fulfil");
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_orders")
    .select("id, number, status, total, confirmed_at, ready_at, dispatched_at, courier_note, channel, customers(name), sales_order_lines(qty, products(sku))")
    .in("status", COLS.map((c) => c.status))
    .order("confirmed_at", { ascending: true })
    .limit(300);
  const rows = (data as unknown as { id: string; number: string; status: string; total: string; confirmed_at: string | null; ready_at: string | null; dispatched_at: string | null; courier_note: string; channel: string; customers: { name: string } | null; sales_order_lines: { qty: string; products: { sku: string } }[] }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Fulfilment" description="Pack paid orders, mark them ready for the courier (this deducts stock), then hand them over." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((c) => {
          const col = rows.filter((r) => r.status === c.status);
          return (
            <div key={c.status} className="rounded-xl bg-muted/50 p-2">
              <p className="px-1 font-semibold">{c.title} ({col.length})</p>
              <p className="mb-2 px-1 text-xs text-muted-foreground">{c.hint}</p>
              <div className="space-y-2">
                {col.map((r) => (
                  <Card key={r.id} className="p-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <Link href={`/sales/orders/${r.id}`} className="font-semibold text-brand underline">{r.number}</Link>
                      <span className="tabular-nums">{formatMoney(r.total)}</span>
                    </div>
                    <p>{r.customers?.name}</p>
                    <p className="text-xs text-muted-foreground">{r.sales_order_lines.map((l) => `${l.products.sku} × ${Number(l.qty)}`).join(", ")}</p>
                    {r.courier_note && <p className="text-xs">🚚 {r.courier_note}</p>}
                    <p className="text-xs text-muted-foreground">{formatDate(r.dispatched_at ?? r.ready_at ?? r.confirmed_at, true)}</p>
                    {c.step && (
                      <ActionForm action={fulfilAction} submitLabel={c.button!} className="mt-2" confirm={c.step === "ready" ? "Mark ready for pickup? Stock will be deducted." : undefined}>
                        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="step" value={c.step} />
                      </ActionForm>
                    )}
                    {!c.step && <Link href={`/sales/orders/${r.id}`} className="mt-2 inline-block text-xs font-semibold text-brand underline">{c.status === "ready_for_pickup" ? "Hand to courier →" : "Mark delivered →"}</Link>}
                  </Card>
                ))}
                {col.length === 0 && <p className="px-1 text-xs text-muted-foreground">Empty.</p>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
