import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PayMongo webhook signature check. Header "Paymongo-Signature: t=<unix>,te=<hmac test>,li=<hmac live>";
 * the HMAC-SHA256 is over "<t>.<raw body>" with the webhook secret. Rejects signatures older than 5 minutes.
 */
export function verifyPaymongoSignature(header: string | null, rawBody: string, secret: string, nowSec = Math.floor(Date.now() / 1000), live = true): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > 300) return false;
  const given = live ? parts.li : parts.te;
  if (!given) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pulls what we need from a "checkout_session.payment.paid" event. Amounts are centavos. */
export function parsePaidEvent(body: unknown): { reference: string; amountCentavos: number; paymentId: string; livemode: boolean } | null {
  const ev = (body as { data?: { attributes?: { type?: string; livemode?: boolean; data?: { attributes?: Record<string, unknown> } } } })?.data?.attributes;
  if (ev?.type !== "checkout_session.payment.paid") return null;
  const cs = ev.data?.attributes as { reference_number?: string; payments?: { id?: string; attributes?: { amount?: number; status?: string } }[] } | undefined;
  const pay = cs?.payments?.find((p) => p.attributes?.status === "paid") ?? cs?.payments?.[0];
  if (!cs?.reference_number || !pay?.id || typeof pay.attributes?.amount !== "number") return null;
  return { reference: cs.reference_number, amountCentavos: pay.attributes.amount, paymentId: pay.id, livemode: Boolean(ev.livemode) };
}
