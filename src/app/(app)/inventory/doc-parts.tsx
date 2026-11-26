import { Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/** <datalist id="product-list"> of active products ("SKU — name"), for type-to-search product inputs. */
export async function ProductDatalist() {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("sku, name").eq("active", true).not("item_type", "in", "(service,bundle)").order("sku").limit(3000);
  return (
    <datalist id="product-list">
      {((data as { sku: string; name: string }[] | null) ?? []).map((p) => (
        <option key={p.sku} value={`${p.sku} — ${p.name}`} />
      ))}
    </datalist>
  );
}

/** Select of stock lines at a location (product · lot · bin · on hand); value "productId:batchId:binId". */
export async function StockLineSelect({ locationId, name = "stock", releasedOnly = false }: { locationId: string; name?: string; releasedOnly?: boolean }) {
  const supabase = await createClient();
  let q = supabase.from("stock_on_hand").select("product_id, batch_id, bin_id, sku, product_name, lot_no, bin_code, expiry_date, qa_status, on_hand, reserved").eq("location_id", locationId).order("sku").limit(2000);
  if (releasedOnly) q = q.eq("qa_status", "released");
  const { data } = await q;
  const rows = (data as { product_id: string; batch_id: string; bin_id: string; sku: string; product_name: string; lot_no: string; bin_code: string; expiry_date: string | null; qa_status: string; on_hand: string; reserved: string }[] | null) ?? [];
  return (
    <Select name={name} required defaultValue="" aria-label="Item">
      <option value="" disabled>{rows.length ? "Choose an item in stock" : "No stock at this location"}</option>
      {rows.map((r) => (
        <option key={`${r.product_id}:${r.batch_id}:${r.bin_id}`} value={`${r.product_id}:${r.batch_id}:${r.bin_id}`}>
          {r.sku} · lot {r.lot_no} · {r.bin_code} · {Number(r.on_hand) - Number(r.reserved)} free{r.expiry_date ? ` · exp ${formatDate(r.expiry_date)}` : ""}{r.qa_status !== "released" ? ` · ${r.qa_status}` : ""} · {r.product_name}
        </option>
      ))}
    </Select>
  );
}

export const qtyFmt = (n: string | number) => Number(n).toLocaleString("en-PH", { maximumFractionDigits: 4 });
