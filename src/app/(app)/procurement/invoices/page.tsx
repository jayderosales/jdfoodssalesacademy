import Link from "next/link";
import { ScanLink } from "@/components/shared/scan-original";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate, manilaToday } from "@/lib/utils";
import { INVOICE_STATUS_LABEL } from "../parts";

export const metadata = { title: "Supplier invoices" };

/** Supplier invoices and their 3-way match. "Ready to pay" ones feed accounts payable (Phase 5). */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission(["procurement.invoices.manage", "procurement.view"]);
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("supplier_invoices").select("id, number, invoice_no, invoice_date, due_date, total, status, suppliers(name), purchase_orders(id, number)").order("created_at", { ascending: false }).limit(200);
  if (sp.f === "ready") q = q.in("status", ["matched", "approved"]);
  else if (sp.f === "issues") q = q.in("status", ["draft", "variance", "submitted", "returned"]);
  const { data } = await q;
  const rows = (data as unknown as { id: string; number: string; invoice_no: string; invoice_date: string; due_date: string | null; total: string; status: string; suppliers: { name: string } | null; purchase_orders: { id: string; number: string } | null }[] | null) ?? [];
  const today = manilaToday();
  const tabs = [["", "All"], ["issues", "To match / variances"], ["ready", "Ready to pay"]];

  return (
    <>
      <PageHeader title="Supplier invoices" description="Record the supplier's invoice from its PO page (Received items → Record supplier invoice). Then match it against the PO and what was received. Bills without a PO (rent, utilities, services) can be photographed." actions={<ScanLink kind="supplier_bill" label="Scan a supplier bill" />} />
      <Card>
        <div className="mb-3 flex gap-2 text-sm">
          {tabs.map(([k, l]) => <Link key={k} href={k ? `/procurement/invoices?f=${k}` : "/procurement/invoices"} className={`rounded-full border px-3 py-1 ${(sp.f ?? "") === k ? "border-brand bg-brand text-white" : "hover:bg-muted"}`}>{l}</Link>)}
        </div>
        <Table>
          <thead><tr><Th>Invoice</Th><Th>Supplier</Th><Th>PO</Th><Th>Due</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const overdue = r.due_date && r.due_date < today && ["matched", "approved"].includes(r.status);
              return (
                <tr key={r.id}>
                  <Td><Link href={`/procurement/invoices/${r.id}`} className="font-medium text-brand underline">{r.invoice_no}</Link><div className="text-xs text-muted-foreground">{r.number} · {formatDate(r.invoice_date)}</div></Td>
                  <Td>{r.suppliers?.name}</Td>
                  <Td>{r.purchase_orders ? <Link href={`/procurement/orders/${r.purchase_orders.id}`} className="underline">{r.purchase_orders.number}</Link> : "—"}</Td>
                  <Td className={overdue ? "font-semibold text-danger" : ""}>{formatDate(r.due_date)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(r.total)}</Td>
                  <Td className={["matched", "approved"].includes(r.status) ? "text-success" : ["variance", "submitted"].includes(r.status) ? "text-amber-700" : ""}>{INVOICE_STATUS_LABEL[r.status]}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No supplier invoices here.</p>}
      </Card>
    </>
  );
}
