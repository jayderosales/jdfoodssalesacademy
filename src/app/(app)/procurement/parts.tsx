import { createClient } from "@/lib/supabase/server";

export { stockLocations } from "../sales/parts";

export const PO_STATUS_HELP: Record<string, string> = {
  draft: "Add the items, then submit for CEO approval.",
  returned: "The CEO sent it back for changes. Edit and submit again.",
  submitted: "Waiting for the CEO's approval.",
  approved: "Approved. Send it to the supplier (print or email), then mark it sent.",
  sent: "With the supplier. Receive the items when they arrive.",
  partly_received: "Some items arrived. Receive the rest, or close the PO if they won't come.",
  received: "Everything arrived. Record the supplier's invoice.",
  closed: "Closed.",
  cancelled: "Cancelled.",
  rejected: "The CEO rejected this PO.",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", matched: "Matched: ready to pay", variance: "Doesn't match", submitted: "Variance waiting for CEO",
  approved: "Variance approved: ready to pay", rejected: "Rejected", returned: "Returned", void: "Void",
};

/** <datalist id="item-list"> of every active stocked item ("SKU — name"). */
export async function ItemDatalist() {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("sku, name").eq("active", true).not("item_type", "in", "(service,bundle)").order("sku").limit(3000);
  return (
    <datalist id="item-list">
      {((data as { sku: string; name: string }[] | null) ?? []).map((p) => <option key={p.sku} value={`${p.sku} — ${p.name}`} />)}
    </datalist>
  );
}

export async function supplierOptions(approvedOnly = false) {
  const supabase = await createClient();
  let q = supabase.from("suppliers").select("id, code, name, status, vat_registered").order("name").limit(2000);
  if (approvedOnly) q = q.eq("status", "approved");
  const { data } = await q;
  return (data as { id: string; code: string; name: string; status: string; vat_registered: boolean }[] | null) ?? [];
}

export async function unitOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("units").select("code, name").order("code");
  return (data as { code: string; name: string }[] | null) ?? [];
}
