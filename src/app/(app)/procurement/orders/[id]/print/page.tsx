import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const metadata = { title: "Print PO" };

/** Printable purchase order (browser Print → Save as PDF to email it to the supplier). */
export default async function PrintPo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(["procurement.view", "procurement.po.create"]);
  const supabase = await createClient();
  const { data } = await supabase.from("purchase_orders").select("*, suppliers(name, address, tin, email, mobile), locations(name, address, city)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const po = data as unknown as {
    number: string; status: string; order_date: string; expected_date: string | null; vat_inclusive: boolean; vat_rate: string; subtotal: string; vat_amount: string; total: string;
    payment_terms_days: number; notes: string; revision: number;
    suppliers: { name: string; address: string; tin: string; email: string; mobile: string }; locations: { name: string; address: string; city: string };
  };
  const [{ data: lines }, { data: ent }] = await Promise.all([
    supabase.from("purchase_order_lines").select("qty, unit_code, unit_price, discount_pct, amount, products(sku, name)").eq("po_id", id).order("id"),
    supabase.from("entities").select("name, legal_name, tin, address").order("created_at").limit(1).maybeSingle(),
  ]);
  const e = ent as { name: string; legal_name: string; tin: string; address: string } | null;
  const draft = !["approved", "sent", "partly_received", "received", "closed"].includes(po.status);

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-sm print:p-0">
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      {draft && <p className="mb-3 rounded border border-danger p-2 text-center font-bold text-danger">NOT APPROVED: draft, do not send</p>}
      <div className="flex justify-between gap-4 border-b pb-3">
        <div>
          <p className="text-lg font-bold">{e?.legal_name || e?.name || "JD Foods"}</p>
          <p>{e?.address}</p>
          {e?.tin && <p>TIN {e.tin}</p>}
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">PURCHASE ORDER</p>
          <p className="font-mono">{po.number}{po.revision ? ` rev. ${po.revision}` : ""}</p>
          <p>Date {formatDate(po.order_date)}</p>
          {po.expected_date && <p>Deliver by {formatDate(po.expected_date)}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 py-3">
        <div><p className="text-xs uppercase text-muted-foreground">Supplier</p><p className="font-semibold">{po.suppliers.name}</p><p>{po.suppliers.address}</p><p>{po.suppliers.mobile} {po.suppliers.email}</p>{po.suppliers.tin && <p>TIN {po.suppliers.tin}</p>}</div>
        <div><p className="text-xs uppercase text-muted-foreground">Deliver to</p><p className="font-semibold">{po.locations.name}</p><p>{po.locations.address} {po.locations.city}</p><p>Terms: {po.payment_terms_days ? `${po.payment_terms_days} days` : "cash"}</p></div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-y text-left text-xs uppercase"><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit price</th><th className="py-1 text-right">Disc.</th><th className="py-1 text-right">Amount</th></tr></thead>
        <tbody>
          {((lines as unknown as { qty: string; unit_code: string; unit_price: string; discount_pct: string; amount: string; products: { sku: string; name: string } }[] | null) ?? []).map((l, i) => (
            <tr key={i} className="border-b"><td className="py-1">{l.products.name}<span className="text-xs text-muted-foreground"> ({l.products.sku})</span></td><td className="py-1 text-right">{Number(l.qty)} {l.unit_code}</td><td className="py-1 text-right">{formatMoney(l.unit_price)}</td><td className="py-1 text-right">{Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : ""}</td><td className="py-1 text-right">{formatMoney(l.amount)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-right">
        <p>{po.vat_inclusive ? "Amounts include" : "Amounts exclude"} {Number(po.vat_rate)}% VAT</p>
        <p>Net {formatMoney(po.subtotal)} · VAT {formatMoney(po.vat_amount)}</p>
        <p className="text-lg font-bold">Total {formatMoney(po.total)}</p>
      </div>
      {po.notes && <p className="mt-4 whitespace-pre-line"><b>Notes:</b> {po.notes}</p>}
      <p className="mt-8 text-xs text-muted-foreground">Please quote the PO number on your delivery receipt and invoice. Deliveries without a PO number may be refused.</p>
    </div>
  );
}
