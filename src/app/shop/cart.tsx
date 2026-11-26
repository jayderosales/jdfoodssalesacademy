"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui";
import { addToCart } from "@/lib/sales/pricing";

/** The cart lives in the browser until checkout; prices are re-checked on the server when the order is placed. */
export interface CartItem {
  sku: string;
  qty: number;
  name: string;
  price: string; // decimal string, display only
  size: string;
}

const KEY = "jdos:cart";
const EVENT = "jdos:cart-changed";

function read(): CartItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    // tolerate old or damaged saved carts: keep the SKU and quantity, fill the display fields (prices are re-checked anyway)
    return Array.isArray(v)
      ? v
          .filter((x) => x && typeof x.sku === "string" && Number.isFinite(x.qty))
          .map((x) => ({
            sku: x.sku,
            qty: x.qty,
            name: typeof x.name === "string" ? x.name : x.sku,
            price: typeof x.price === "string" && /^\d+(\.\d{1,2})?$/.test(x.price) ? x.price : "0",
            size: typeof x.size === "string" ? x.size : "",
          }))
      : [];
  } catch {
    return [];
  }
}
function write(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const add = useCallback((item: CartItem) => write(addToCart(read(), item)), []);
  const setQty = useCallback((sku: string, qty: number) => {
    const cur = read();
    write(qty <= 0 ? cur.filter((c) => c.sku !== sku) : cur.map((c) => (c.sku === sku ? { ...c, qty: Math.min(Math.floor(qty), 999) } : c)));
  }, []);
  const clear = useCallback(() => write([]), []);
  return { items, ready, add, setQty, clear, count: items.reduce((s, i) => s + i.qty, 0) };
}

export function CartLink() {
  const { count } = useCart();
  return (
    <Link href="/shop/cart" className="relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" aria-label={`Cart, ${count} items`}>
      <ShoppingCart className="h-4 w-4" />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && <span className="rounded-full bg-brand px-2 text-xs font-bold text-white">{count}</span>}
    </Link>
  );
}

export function AddToCart({ item, disabled }: { item: Omit<CartItem, "qty">; disabled?: boolean }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        max={999}
        value={qty}
        onChange={(e) => setQty(Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))))}
        className="h-10 w-20 rounded-lg border px-2 text-center"
        aria-label="Quantity"
        disabled={disabled}
      />
      <Button
        type="button"
        disabled={disabled}
        onClick={() => {
          add({ ...item, qty });
          setAdded(true);
          setTimeout(() => setAdded(false), 1500);
        }}
      >
        {disabled ? "Out of stock" : added ? "Added ✓" : "Add to cart"}
      </Button>
    </div>
  );
}

/** Remembers the mobile number used for each order on this device, so the order page can show it without asking. */
export const ORDERS_KEY = "jdos:orders";
export function rememberOrder(number: string, mobile: string) {
  try {
    const cur = JSON.parse(localStorage.getItem(ORDERS_KEY) || "{}");
    cur[number] = mobile;
    localStorage.setItem(ORDERS_KEY, JSON.stringify(cur));
  } catch {
    /* storage full or blocked: the order page will ask for the mobile number */
  }
}
export function recalledMobile(number: string): string {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || "{}")[number] ?? "";
  } catch {
    return "";
  }
}
