import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts a PayMongo checkout for a shop order (card, GCash, Maya). Off unless PAYMONGO_SECRET_KEY is set and
 * "Online payment" is switched on in Settings. The webhook (../webhook) marks the order paid.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const number = String(form.get("number") ?? "").toUpperCase();
  const mobile = String(form.get("mobile") ?? "");
  const back = new URL(`/shop/order/${encodeURIComponent(number)}`, req.url);
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) return NextResponse.redirect(back, 303);

  const supabase = await createClient();
  const { data } = await supabase.rpc("shop_order_status", { p_number: number, p_mobile: mobile });
  const o = data as { number: string; status: string; total: string; paid: string; paymongo: boolean; lines: { name: string }[] } | null;
  if (!o || !o.paymongo || o.status !== "awaiting_payment") return NextResponse.redirect(back, 303);
  const due = Math.round((Number(o.total) - Number(o.paid)) * 100);
  if (due <= 0) return NextResponse.redirect(back, 303);

  const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    body: JSON.stringify({
      data: {
        attributes: {
          reference_number: o.number,
          description: `JD Foods order ${o.number}`,
          line_items: [{ currency: "PHP", amount: due, name: `Order ${o.number} (${o.lines.length} items)`, quantity: 1 }],
          payment_method_types: ["gcash", "paymaya", "card"],
          success_url: back.toString(),
          cancel_url: back.toString(),
          send_email_receipt: false,
          show_line_items: true,
        },
      },
    }),
  });
  if (!res.ok) {
    console.error("paymongo checkout", res.status, await res.text().catch(() => ""));
    return NextResponse.redirect(back, 303);
  }
  const json = (await res.json()) as { data?: { attributes?: { checkout_url?: string } } };
  const url = json.data?.attributes?.checkout_url;
  return NextResponse.redirect(url && url.startsWith("https://") ? url : back.toString(), 303);
}
