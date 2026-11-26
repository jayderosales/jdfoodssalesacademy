import { NextResponse, type NextRequest } from "next/server";
import { parsePaidEvent, verifyPaymongoSignature } from "@/lib/sales/paymongo";
import { createAdminClient, serviceKeyMissing } from "@/lib/supabase/server";

/**
 * PayMongo webhook: "checkout_session.payment.paid" → record a confirmed online payment on the order
 * (public.record_online_payment, service role only; idempotent on the PayMongo payment id).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET ?? "";
  const raw = await req.text();
  const live = process.env.PAYMONGO_LIVE === "1";
  if (!verifyPaymongoSignature(req.headers.get("paymongo-signature"), raw, secret, undefined, live)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const ev = parsePaidEvent(body);
  if (!ev) return NextResponse.json({ ok: true, ignored: true });
  if (ev.livemode !== live) return NextResponse.json({ ok: true, ignored: "mode" });
  if (serviceKeyMissing()) return NextResponse.json({ error: "server not configured" }, { status: 500 });

  const admin = createAdminClient();
  const { error } = await admin.rpc("record_online_payment", {
    p_order_number: ev.reference,
    p_amount: (ev.amountCentavos / 100).toFixed(2),
    p_provider_id: ev.paymentId,
  });
  if (error) {
    console.error("paymongo webhook", error.message);
    return NextResponse.json({ error: "could not record" }, { status: 500 }); // PayMongo retries
  }
  return NextResponse.json({ ok: true });
}
