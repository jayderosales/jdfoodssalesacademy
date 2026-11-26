"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { Scanner } from "@/components/shared/scanner";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { lookupCode, type ScanResult } from "../actions";

export function ScanLookup() {
  const [code, setCode] = useState("");
  const [res, setRes] = useState<ScanResult | null>(null);
  const [pending, start] = useTransition();
  const look = useCallback((c: string) => {
    if (!c.trim()) return;
    setCode(c);
    start(async () => setRes(await lookupCode(c.trim())));
  }, []);
  const total = res?.stock?.reduce((s, x) => s + x.on_hand, 0) ?? 0;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            look(code);
          }}
        >
          <Scanner onScan={look} />
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SKU or barcode" aria-label="SKU or barcode" className="min-w-40 flex-1" autoCapitalize="characters" />
          <Button type="submit" variant="outline" disabled={pending}>{pending ? "Looking…" : "Look up"}</Button>
        </form>
      </Card>
      {res?.error && <Alert tone="danger">{res.error}</Alert>}
      {res?.product && (
        <Card>
          <p className="text-lg font-bold">{res.product.sku}</p>
          <p className="mb-1">{res.product.name}</p>
          <p className="mb-3 text-sm text-muted-foreground">SRP {formatMoney(res.product.srp)} · {total.toLocaleString("en-PH")} {res.product.base_unit} on hand</p>
          {res.stock?.length ? (
            <ul className="divide-y text-sm">
              {res.stock.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {s.location} · {s.bin}
                    <span className="block font-mono text-xs text-muted-foreground">lot {s.lot}{s.expiry ? ` · exp ${formatDate(s.expiry)}` : ""}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{s.on_hand.toLocaleString("en-PH")}</span>
                    {s.qa !== "released" && <Badge tone="warning">{s.qa}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No stock.</p>
          )}
          <Link href={`/inventory/products/${res.product.id}`} className="mt-3 inline-block text-sm text-brand underline">Open product</Link>
        </Card>
      )}
    </div>
  );
}
