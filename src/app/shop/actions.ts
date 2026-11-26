"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, getShopPrices } from "@/lib/sales/shop";
import { parseMoney } from "@/lib/money";

/** Plain-English message from a Postgres exception (our functions raise friendly text). */
function friendly(e: { message?: string } | null): string {
  const m = e?.message ?? "";
  if (!m) return "Something went wrong. Please try again.";
  if (/violates|syntax|relation|permission denied|function/i.test(m)) {
    console.error("shop", m);
    return "Something went wrong. Please try again or contact us.";
  }
  return m;
}

/** Current price and availability for the items in a cart (prices can change between adding and checkout). */
export async function priceCart(skus: string[]) {
  const wanted = new Set(skus.slice(0, 60).map((s) => s.toUpperCase()));
  const items = (await getCatalog()).filter((p) => wanted.has(p.sku));
  const prices = await getShopPrices(items.map((p) => p.id));
  return items.map((p) => ({ sku: p.sku, name: p.name, size: p.size_label, price: prices.get(p.id) ?? p.srp, in_stock: p.in_stock, pre_order: p.pre_order }));
}

const OrderSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  mobile: z.string().trim().min(10, "Please enter your mobile number.").max(20),
  email: z.union([z.literal(""), z.string().trim().email("That email address doesn't look right.")]),
  line: z.string().trim().min(5, "Please enter your street address.").max(300),
  city: z.string().trim().min(2, "Please enter your city.").max(80),
  province: z.string().trim().max(80),
  zip: z.string().trim().max(10),
  courier_note: z.string().trim().max(300),
  notes: z.string().trim().max(500),
  lines: z.array(z.object({ sku: z.string().min(1).max(40), qty: z.number().int().min(1).max(999) })).min(1, "Your cart is empty.").max(50),
});

export async function placeShopOrder(input: unknown): Promise<{ error?: string; number?: string; total?: string }> {
  const parsed = OrderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_shop_order", {
    p: {
      name: d.name, mobile: d.mobile, email: d.email, courier_note: d.courier_note, notes: d.notes,
      address: { line: d.line, city: d.city, province: d.province, zip: d.zip },
      lines: d.lines,
    },
  });
  if (error) return { error: friendly(error) };
  const r = data as { number: string; total: string | number };
  return { number: r.number, total: String(r.total) };
}

export interface ShopOrderStatus {
  number: string;
  status: string;
  placed_at: string;
  total: string;
  paid: string;
  ship_to: { recipient: string; phone: string; line: string; city: string; province: string; zip: string };
  courier_note: string;
  lines: { name: string; sku: string; qty: number; price: string; total: string }[];
  payments: { method: string; amount: string; status: string; reference: string }[];
  shipment: { courier: string; tracking_no: string; dispatched_at: string; delivered_at: string | null } | null;
  instructions: string;
  paymongo: boolean;
}

export async function getShopOrder(number: string, mobile: string): Promise<{ error?: string; order?: ShopOrderStatus }> {
  if (!/^[A-Z0-9-]{3,30}$/i.test(number.trim())) return { error: "Check the order number." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shop_order_status", { p_number: number.trim(), p_mobile: mobile });
  if (error) return { error: friendly(error) };
  if (!data) return { error: "We couldn't find that order. Check the order number and the mobile number you used." };
  const o = data as ShopOrderStatus;
  return { order: { ...o, paymongo: Boolean(o.paymongo) && Boolean(process.env.PAYMONGO_SECRET_KEY) } };
}

export async function submitShopPayment(number: string, mobile: string, form: { method: string; reference: string; amount: string }) {
  const amount = parseMoney(form.amount);
  if (!amount || Number(amount) <= 0) return { error: "Enter the amount you paid." };
  if (!["bank_transfer", "gcash", "maya"].includes(form.method)) return { error: "Choose how you paid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_shop_payment", {
    p_number: number, p_mobile: mobile, p_method: form.method, p_reference: form.reference.trim().slice(0, 60), p_amount: amount,
  });
  if (error) return { error: friendly(error) };
  return { message: "Thanks! We'll check your payment and update this page." };
}
