import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { createOrder } from "../actions";
import { CHANNEL_LABEL, customerOptions, stockLocations } from "../parts";

export const metadata = { title: "Sales orders" };

const FILTERS: { key: string; label: string; statuses?: string[] }[] = [
  { key: "open", label: "Open", statuses: ["draft", "credit_review", "awaiting_payment", "confirmed", "packing", "ready_for_pickup", "dispatched"] },
  { key: "unpaid", label: "Waiting for payment", statuses: ["awaiting_payment"] },
  { key: "topack", label: "To pack", statuses: ["confirmed", "packing"] },
  { key: "done", label: "Delivered", statuses: ["delivered"] },
  { key: "cancelled", label: "Cancelled / returned", statuses: ["cancelled", "returned"] },
  { key: "all", label: "All" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["sales.view", "sales.orders.create"]);
  const sp = await searchParams;
  const access = await getAccess();
  const f = FILTERS.find((x) => x.key === sp.f) ?? FILTERS[0];
  const q = (sp.q ?? "").trim();
  const supabase = await createClient();
  let query = supabase
    .from("sales_orders")
    .select("id, number, status, channel, total, paid_amount, placed_at, created_at, payment_mode, customers(name, code)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (f.statuses) query = query.in("status", f.statuses);
  if (sp.channel) query = query.eq("channel", sp.channel);
  if (q) query = query.ilike("number", `%${q.replace(/[%_]/g, "")}%`);
  const [{ data }, customers, locations] = await Promise.all([query, can(access, "sales.orders.create") ? customerOptions() : [], stockLocations()]);
  const rows = (data as unknown as { id: string; number: string; status: string; channel: string; total: string; paid_amount: string; placed_at: string | null; created_at: string; payment_mode: string; customers: { name: string; code: string } | null }[] | null) ?? [];

  return (
    <>
      <PageHeader title="Sales orders" description="Every channel in one list. Stock is reserved when an order is placed and deducted when it's ready for pickup." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {FILTERS.map((x) => (
              <Link key={x.key} href={`/sales/orders?f=${x.key}${sp.channel ? `&channel=${sp.channel}` : ""}`} className={`rounded-full border px-3 py-1 ${x.key === f.key ? "border-brand bg-brand text-white" : "hover:bg-muted"}`}>{x.label}</Link>
            ))}
            <form className="ml-auto flex gap-2" action="/sales/orders">
              <input type="hidden" name="f" value={f.key} />
              <Input name="q" defaultValue={q} placeholder="Order no." className="h-8 w-32" aria-label="Search order number" />
            </form>
          </div>
          <Table>
            <thead><tr><Th>Order</Th><Th>Customer</Th><Th>Channel</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/sales/orders/${r.id}`} className="font-medium text-brand underline">{r.number}</Link>
                    <div className="text-xs text-muted-foreground">{formatDate(r.placed_at ?? r.created_at, true)}</div>
                  </Td>
                  <Td>{r.customers?.name}<div className="text-xs text-muted-foreground">{r.payment_mode === "terms" ? "On terms" : "Pay first"}</div></Td>
                  <Td>{CHANNEL_LABEL[r.channel] ?? r.channel}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(r.total)}{Number(r.paid_amount) > 0 && Number(r.paid_amount) < Number(r.total) && <div className="text-xs text-amber-700">paid {formatMoney(r.paid_amount)}</div>}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No orders here.</p>}
        </Card>
        {can(access, "sales.orders.create") && (
          <Card>
            <CardTitle>New order</CardTitle>
            <ActionForm action={createOrder} submitLabel="Start order">
              <Field label="Customer" htmlFor="customer_id">
                <Select id="customer_id" name="customer_id" required defaultValue="">
                  <option value="" disabled>Choose a customer</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </Select>
              </Field>
              <p className="-mt-2 text-xs text-muted-foreground">New customer? <Link href="/sales/customers" className="underline">Add them first</Link>.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Channel" htmlFor="channel">
                  <Select id="channel" name="channel" defaultValue="phone">
                    {Object.entries(CHANNEL_LABEL).filter(([k]) => k !== "shop").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Payment" htmlFor="payment_mode">
                  <Select id="payment_mode" name="payment_mode" defaultValue="prepaid">
                    <option value="prepaid">Pay before release</option>
                    <option value="terms">On credit terms</option>
                  </Select>
                </Field>
              </div>
              <Field label="Ships from" htmlFor="location_id">
                <Select id="location_id" name="location_id" required defaultValue={locations.find((l) => l.code === "PLR-FG")?.id ?? locations[0]?.id}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
              <Field label="Courier / pickup note" htmlFor="courier_note"><Input id="courier_note" name="courier_note" placeholder="e.g. Customer books Lalamove" /></Field>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
