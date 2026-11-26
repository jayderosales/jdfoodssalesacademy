"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { getShopOrder } from "../actions";
import { rememberOrder } from "../cart";

export function TrackForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3 rounded-2xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const number = String(f.get("number") ?? "").trim().toUpperCase();
        const mobile = String(f.get("mobile") ?? "");
        start(async () => {
          const r = await getShopOrder(number, mobile);
          if (r.error) return setError(r.error);
          rememberOrder(number, mobile);
          router.push(`/shop/order/${number}`);
        });
      }}
    >
      <Field label="Order number" htmlFor="number"><Input id="number" name="number" required placeholder="SO-2026-00001" autoCapitalize="characters" /></Field>
      <Field label="Mobile number" htmlFor="mobile"><Input id="mobile" name="mobile" required inputMode="tel" placeholder="09XXXXXXXXX" /></Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" disabled={pending}>{pending ? "Looking…" : "Track order"}</Button>
    </form>
  );
}
