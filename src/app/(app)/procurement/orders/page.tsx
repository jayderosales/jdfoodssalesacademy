import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardTitle, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { createPo } from "../actions";
import { stockLocations, supplierOptions } from "../parts";

export const metadata = { title: "Purchase orders" };

const FILTERS: { key: string; label: string; statuses?: string[] }[] = [
  { key: "open", label: "Open", statuses: ["draft", "returned", "submitted", "approved", "sent", "partly_received"] },
  { key: "submitted", label: "Waiting for CEO", statuses: ["submitted"] },
  { key: "receive", label: "To receive", statuses: ["approved", "sent", "partly_received"] },
  { key: "done", label: "Received / closed", statuses: ["received", "closed"] },
  { key: "all", label: "All" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["procurement.view", "procurement.po.create"]);
  const sp = await searchParams;
  const access = await getAccess();
  const f = FILTERS.find((x) => x.key === sp.f) ?? FILTERS[0];
  const supabase = await createClient();
  let q = supabase.from("purchase_orders").select("id, number, status, total, order_date, expected_date, suppliers(name), locations(name)").order("created_at", { ascending: false }).limit(200);
  if (f.statuses) q = q.in("status", f.statuses);
  const canCreate = can(access, "procurement.po.create");
  const [{ data }, suppliers, locations] = await Promise.all([q, canCreate ? supplierOptions(true) : [], canCreate ? stockLocations() : []]);
  const rows = (data as unknown as { id: string; number: string; status: string; total: string; order_date: string; expected_date: string | null; suppliers: { name: string } | null; locations: { name: string } | null }[] | null) ?? [];
  const today = manilaToday();

  return (
    <>
      <PageHeader title="Purchase orders" description="Every PO is approved by the CEO before it goes to the supplier." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            {FILTERS.map((x) => <Link key={x.key} href={`/procurement/orders?f=${x.key}`} className={`rounded-full border px-3 py-1 ${x.key === f.key ? "border-brand bg-brand text-white" : "hover:bg-muted"}`}>{x.label}</Link>)}
          </div>
          <Table>
            <thead><tr><Th>PO</Th><Th>Supplier</Th><Th>Expected</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const late = r.expected_date && r.expected_date < today && ["approved", "sent", "partly_received"].includes(r.status);
                return (
                  <tr key={r.id}>
                    <Td><Link href={`/procurement/orders/${r.id}`} className="font-medium text-brand underline">{r.number}</Link><div className="text-xs text-muted-foreground">{formatDate(r.order_date)} · {r.locations?.name}</div></Td>
                    <Td>{r.suppliers?.name}</Td>
                    <Td className={late ? "font-semibold text-danger" : ""}>{formatDate(r.expected_date)}{late ? " (late)" : ""}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(r.total)}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No purchase orders here.</p>}
        </Card>
        {canCreate && (
          <Card>
            <CardTitle>New purchase order</CardTitle>
            <ActionForm action={createPo} submitLabel="Start PO">
              <Field label="Supplier (approved only)" htmlFor="supplier_id">
                <Select id="supplier_id" name="supplier_id" required defaultValue="">
                  <option value="" disabled>Choose a supplier</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.vat_registered ? "" : " (non-VAT)"}</option>)}
                </Select>
              </Field>
              <p className="-mt-2 text-xs text-muted-foreground">Not listed? <Link href="/procurement/suppliers" className="underline">Add and approve the supplier</Link> first.</p>
              <Field label="Deliver to" htmlFor="location_id">
                <Select id="location_id" name="location_id" required defaultValue={locations[0]?.id}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
              </Field>
              <Field label="Expected delivery" htmlFor="expected_date"><Input id="expected_date" name="expected_date" type="date" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="vat_inclusive" defaultChecked /> Prices I enter include VAT</label>
              <Field label="Notes to supplier" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} /></Field>
            </ActionForm>
            <p className="mt-3 text-xs text-muted-foreground">Or create a PO from <Link href="/procurement/requests" className="underline">purchase requests</Link>.</p>
          </Card>
        )}
      </div>
    </>
  );
}
