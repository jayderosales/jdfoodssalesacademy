"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { getShopOrder, submitShopPayment, type ShopOrderStatus } from "../actions";
import { recalledMobile, rememberOrder } from "../cart";

const STEPS: { key: string; label: string; help: string }[] = [
  { key: "awaiting_payment", label: "Waiting for payment", help: "Pay and enter your reference number below." },
  { key: "confirmed", label: "Payment confirmed", help: "We're preparing your order." },
  { key: "packing", label: "Packing", help: "Your items are being packed." },
  { key: "ready_for_pickup", label: "Ready for the courier", help: "Book your courier for pickup if you haven't yet." },
  { key: "dispatched", label: "With the courier", help: "On its way to you." },
  { key: "delivered", label: "Delivered", help: "Thank you for ordering!" },
];
const METHOD: Record<string, string> = { bank_transfer: "Bank transfer", gcash: "GCash", maya: "Maya", paymongo: "Online", cash: "Cash", cheque: "Cheque", card: "Card", other: "Other" };

/** Order page for shop customers: needs the order number + the mobile used (remembered on this device after checkout). */
export function OrderView({ number, isNew }: { number: string; isNew?: boolean }) {
  const [mobile, setMobile] = useState("");
  const [order, setOrder] = useState<ShopOrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback((m: string) => {
    start(async () => {
      const r = await getShopOrder(number, m);
      if (r.error) {
        setError(r.error);
        setOrder(null);
      } else {
        setError(null);
        setOrder(r.order!);
        rememberOrder(number, m);
      }
    });
  }, [number]);

  useEffect(() => {
    const m = recalledMobile(number);
    setMobile(m);
    if (m) load(m);
  }, [number, load]);

  if (!order) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-6">
        <h1 className="text-2xl font-bold">Order {number}</h1>
        <form
          className="space-y-3 rounded-2xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            load(mobile);
          }}
        >
          <Field label="Mobile number used for the order" htmlFor="m"><Input id="m" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" required /></Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" disabled={pending}>{pending ? "Looking…" : "Show my order"}</Button>
        </form>
      </div>
    );
  }

  const cancelled = order.status === "cancelled" || order.status === "returned";
  const idx = STEPS.findIndex((s) => s.key === order.status);
  const balance = Math.max(0, Number(order.total) - Number(order.paid));
  const waitingCheck = order.payments.some((p) => p.status === "pending");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {isNew && <Alert tone="success">Order placed! Save your order number: <b>{order.number}</b>. Next step: pay and enter your reference number below.</Alert>}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Order {order.number}</h1>
          <p className="text-sm text-muted-foreground">Placed {formatDate(order.placed_at, true)}</p>
        </div>
        <p className="text-2xl font-bold">{formatMoney(order.total)}</p>
      </div>

      {cancelled ? (
        <Alert tone="danger">This order was {order.status}. If you think this is a mistake, please contact us with your order number.</Alert>
      ) : (
        <ol className="grid gap-2 sm:grid-cols-6">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`rounded-xl border p-2 text-xs ${i < idx ? "border-green-600 bg-green-50" : i === idx ? "border-brand bg-brand/5 font-semibold" : "text-muted-foreground"}`}>
              <span className="block">{s.label}</span>
              {i === idx && <span className="mt-1 block font-normal">{s.help}</span>}
            </li>
          ))}
        </ol>
      )}

      {order.status === "awaiting_payment" && (
        <section className="space-y-3 rounded-2xl border p-4">
          <h2 className="text-lg font-bold">Pay {formatMoney(balance.toFixed(2))}</h2>
          <p className="whitespace-pre-line text-sm">{order.instructions}</p>
          {waitingCheck ? (
            <Alert tone="neutral">We received your payment details and are checking them. This page updates once confirmed.</Alert>
          ) : (
            <form
              className="grid gap-3 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                start(async () => {
                  const r = await submitShopPayment(order.number, mobile, { method: String(f.get("method")), reference: String(f.get("reference")), amount: String(f.get("amount")) });
                  if (r.error) setError(r.error);
                  else {
                    setError(null);
                    setMsg(r.message ?? null);
                    load(mobile);
                  }
                });
              }}
            >
              <Field label="Paid by" htmlFor="method">
                <Select id="method" name="method" defaultValue="gcash"><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option></Select>
              </Field>
              <Field label="Reference number" htmlFor="reference"><Input id="reference" name="reference" required minLength={4} /></Field>
              <Field label="Amount paid (₱)" htmlFor="amount"><Input id="amount" name="amount" required inputMode="decimal" defaultValue={balance.toFixed(2)} /></Field>
              <div className="sm:col-span-3"><Button type="submit" disabled={pending}>{pending ? "Sending…" : "I've paid: send reference"}</Button></div>
            </form>
          )}
          {order.paymongo && (
            <form action="/api/paymongo/checkout" method="post">
              <input type="hidden" name="number" value={order.number} />
              <input type="hidden" name="mobile" value={mobile} />
              <Button type="submit" variant="outline">Pay online now (card, GCash, Maya)</Button>
            </form>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          {msg && <Alert tone="success">{msg}</Alert>}
        </section>
      )}

      {order.shipment && (
        <section className="rounded-2xl border p-4 text-sm">
          <h2 className="mb-1 text-lg font-bold">Courier</h2>
          <p>{order.shipment.courier}{order.shipment.tracking_no ? ` · tracking ${order.shipment.tracking_no}` : ""}</p>
          <p className="text-muted-foreground">Handed over {formatDate(order.shipment.dispatched_at, true)}{order.shipment.delivered_at ? ` · delivered ${formatDate(order.shipment.delivered_at, true)}` : ""}</p>
        </section>
      )}

      <section className="rounded-2xl border">
        <ul className="divide-y text-sm">
          {order.lines.map((l) => (
            <li key={l.sku} className="flex justify-between gap-3 p-3">
              <span>{l.name} <span className="text-muted-foreground">× {Number(l.qty)}</span></span>
              <span className="tabular-nums">{formatMoney(l.total)}</span>
            </li>
          ))}
          <li className="flex justify-between p-3 font-bold"><span>Total</span><span>{formatMoney(order.total)}</span></li>
          {Number(order.paid) > 0 && <li className="flex justify-between p-3 text-green-700"><span>Paid</span><span>{formatMoney(order.paid)}</span></li>}
        </ul>
      </section>

      {order.payments.length > 0 && (
        <section className="text-sm">
          <h2 className="mb-1 font-bold">Payments</h2>
          <ul className="space-y-1">
            {order.payments.map((p, i) => (
              <li key={i}>{METHOD[p.method] ?? p.method} {formatMoney(p.amount)} · ref …{p.reference} · <b>{p.status === "pending" ? "being checked" : p.status}</b></li>
            ))}
          </ul>
        </section>
      )}

      <section className="text-sm text-muted-foreground">
        <p><b>Deliver to:</b> {order.ship_to.recipient}, {order.ship_to.line}, {order.ship_to.city}{order.ship_to.province ? `, ${order.ship_to.province}` : ""}</p>
        {order.courier_note && <p><b>Courier:</b> {order.courier_note}</p>}
      </section>
    </div>
  );
}
