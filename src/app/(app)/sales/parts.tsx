import { createClient } from "@/lib/supabase/server";

export const CHANNEL_LABEL: Record<string, string> = {
  shop: "Online shop", phone: "Phone", messenger: "Messenger", field: "Field visit", walk_in: "Walk-in", email: "Email",
  shopify: "Shopify", marketplace: "Marketplace", other: "Other",
};
export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", bank_transfer: "Bank transfer", gcash: "GCash", maya: "Maya", cheque: "Cheque", card: "Card", paymongo: "Online (PayMongo)", other: "Other",
};
export const TYPE_LABEL: Record<string, string> = { retail: "Retail", regular: "Regular", corporate: "Corporate", distributor: "Distributor", reseller: "Reseller" };
export const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export const ACTIVITY_LABEL: Record<string, string> = { call: "Call", visit: "Field visit", message: "Message", email: "Email", meeting: "Meeting", note: "Note", task: "Task" };

/** <datalist id="sell-list"> of every active product that can be sold ("SKU — name · ₱SRP"). */
export async function SellableDatalist() {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("sku, name, srp").eq("active", true).order("sku").limit(3000);
  return (
    <datalist id="sell-list">
      {((data as { sku: string; name: string; srp: string | null }[] | null) ?? []).map((p) => (
        <option key={p.sku} value={`${p.sku} — ${p.name}`}>{p.srp ? `₱${Number(p.srp).toLocaleString("en-PH")}` : "no price"}</option>
      ))}
    </datalist>
  );
}

export async function customerOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("id, code, name, type, payment_terms_days").eq("active", true).order("name").limit(3000);
  return (data as { id: string; code: string; name: string; type: string; payment_terms_days: number }[] | null) ?? [];
}

export async function stockLocations() {
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("id, name, code, is_pickup_point").eq("holds_inventory", true).eq("active", true).order("name");
  return (data as { id: string; name: string; code: string; is_pickup_point: boolean }[] | null) ?? [];
}

/** Staff who can own customers/leads (everyone internal except me; `me` is added first). */
export async function salesPeople(me: { id: string; full_name?: string | null }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("delegation_candidates");
  return [{ id: me.id, name: `${me.full_name || "Me"} (me)` }, ...((data as { id: string; name: string }[] | null) ?? [])];
}
