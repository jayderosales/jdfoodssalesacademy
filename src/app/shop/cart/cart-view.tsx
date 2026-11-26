"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { formatMoney, fromCentavos, toCentavos } from "@/lib/money";
import { lineTotalCentavos, normalizePhMobile } from "@/lib/sales/pricing";
import { placeShopOrder, priceCart, uploadPaymentProof, type PaymentDetails } from "../actions";
import { BankDetails, ProofFields } from "../payment-box";
import { shrinkImage } from "@/lib/image-shrink";
import { rememberOrder, useCart } from "../cart";

type Priced = Awaited<ReturnType<typeof priceCart>>[number];

/** Cart + checkout on one page: fewer steps on a phone. */
export function CartView({ payment }: { payment: PaymentDetails | null }) {
  const { items, ready, setQty, clear } = useCart();
  const [priced, setPriced] = useState<Map<string, Priced>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const skuKey = items.map((i) => i.sku).sort().join(",");

  useEffect(() => {
    if (!skuKey) return;
    priceCart(skuKey.split(",")).then((rows) => setPriced(new Map(rows.map((r) => [r.sku, r]))));
  }, [skuKey]);

  const lines = items.map((i) => {
    const p = priced.get(i.sku);
    const price = p?.price ?? i.price;
    return { ...i, price, available: p ? p.in_stock : true, gone: priced.size > 0 && !p, total: lineTotalCentavos(i.qty, toCentavos(price)) };
  });
  const total = useMemo(() => lines.filter((l) => !l.gone).reduce((s, l) => s + l.total, 0n), [lines]);
  const blocked = lines.some((l) => l.gone || !l.available);

  if (!ready) return <p className="py-16 text-center text-muted-foreground">Loading your cart…</p>;
  if (items.length === 0)
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-lg font-semibold">Your cart is empty.</p>
        <Link href="/shop" className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">Browse products</Link>
      </div>
    );

  function submit(form: HTMLFormElement) {
    setError(null);
    const f = new FormData(form);
    const mobile = normalizePhMobile(String(f.get("mobile") ?? ""));
    if (!mobile) return setError("Please enter a valid PH mobile number (09XXXXXXXXX).");
    const payload = {
      name: String(f.get("name") ?? ""), mobile, email: String(f.get("email") ?? ""),
      line: String(f.get("line") ?? ""), city: String(f.get("city") ?? ""), province: String(f.get("province") ?? ""), zip: String(f.get("zip") ?? ""),
      courier_note: String(f.get("courier_note") ?? ""), notes: String(f.get("notes") ?? ""),
      lines: lines.filter((l) => !l.gone).map((l) => ({ sku: l.sku, qty: l.qty })),
    };
    const proof = f.get("proof");
    const reference = String(f.get("reference") ?? "");
    start(async () => {
      const r = await placeShopOrder(payload);
      if (r.error || !r.number) return setError(r.error ?? "Something went wrong.");
      rememberOrder(r.number, mobile);
      clear();
      // optional proof of payment: upload it against the new order (the order is already placed either way)
      let proofState = "";
      if (proof instanceof File && proof.size > 0) {
        const fd = new FormData();
        fd.set("number", r.number);
        fd.set("mobile", mobile);
        fd.set("proof", await shrinkImage(proof));
        fd.set("reference", reference);
        if (r.total) fd.set("amount", r.total);
        const up = await uploadPaymentProof(fd);
        proofState = up.error ? "&proof=failed" : "&proof=sent";
      }
      router.push(`/shop/order/${r.number}?new=1${proofState}`);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">Your cart</h1>
        <ul className="divide-y rounded-2xl border">
          {lines.map((l) => (
            <li key={l.sku} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <Link href={`/shop/${encodeURIComponent(l.sku)}`} className="line-clamp-2 font-medium hover:text-brand">{l.name}</Link>
                <p className="text-xs text-muted-foreground">{formatMoney(l.price)} each</p>
                {l.gone && <p className="text-xs font-medium text-danger">No longer available. Remove it to continue.</p>}
                {!l.gone && !l.available && <p className="text-xs font-medium text-danger">Out of stock. Remove it to continue.</p>}
              </div>
              <input
                type="number" min={1} max={999} value={l.qty}
                onChange={(e) => setQty(l.sku, Math.floor(Number(e.target.value) || 1))}
                className="h-9 w-16 rounded-lg border text-center" aria-label={`Quantity of ${l.name}`}
              />
              <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(fromCentavos(l.total))}</span>
              <button type="button" onClick={() => setQty(l.sku, 0)} className="rounded p-2 text-muted-foreground hover:text-danger" aria-label={`Remove ${l.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-between rounded-2xl bg-muted p-4 text-lg font-bold">
          <span>Total (items)</span>
          <span className="tabular-nums">{formatMoney(fromCentavos(total))}</span>
        </div>
        <p className="text-sm text-muted-foreground">Shipping isn&apos;t included: you pay the courier directly when you book or receive the parcel.</p>
      </section>

      <section>
        <form
          className="space-y-3 rounded-2xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
        >
          <h2 className="text-lg font-bold">Checkout</h2>
          <Field label="Full name" htmlFor="name"><Input id="name" name="name" required autoComplete="name" /></Field>
          <Field label="Mobile number" htmlFor="mobile" hint="We'll use this to confirm your order."><Input id="mobile" name="mobile" required inputMode="tel" autoComplete="tel" placeholder="09XXXXXXXXX" /></Field>
          <Field label="Email (optional)" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" /></Field>
          <Field label="Street, barangay" htmlFor="line"><Input id="line" name="line" required autoComplete="street-address" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="City / municipality" htmlFor="city"><Input id="city" name="city" required autoComplete="address-level2" /></Field>
            <Field label="Province" htmlFor="province"><Input id="province" name="province" autoComplete="address-level1" /></Field>
          </div>
          <Field label="ZIP code" htmlFor="zip"><Input id="zip" name="zip" inputMode="numeric" autoComplete="postal-code" /></Field>
          <Field label="Courier" htmlFor="courier_note" hint="Which courier will you book (e.g. Lalamove, J&T, LBC)? Or say you'll pick it up."><Input id="courier_note" name="courier_note" /></Field>
          <Field label="Notes (optional)" htmlFor="notes"><Textarea id="notes" name="notes" rows={2} /></Field>
          <div className="space-y-2 border-t pt-3">
            <h3 className="font-semibold">Payment</h3>
            <BankDetails details={payment} amount={fromCentavos(total)} />
            <p className="text-xs text-muted-foreground">Already paid? Attach the receipt now. Or place the order first and send it from your order page later.</p>
            <ProofFields />
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={pending || blocked}>{pending ? "Placing order…" : `Place order · ${formatMoney(fromCentavos(total))}`}</Button>
          <p className="text-xs text-muted-foreground">We pack your order once we confirm your payment. You can also send your proof of payment from the order page after ordering.</p>
        </form>
      </section>
    </div>
  );
}
