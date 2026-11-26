"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card } from "@/components/ui";
import { parseMoney } from "@/lib/money";
import { savePriceListSheet } from "../actions";

interface Row { id: string; sku: string; name: string; srp: string | null; cost: string | null; price: string | null }

const shown = (v: string | null) => (v == null ? "" : Number(v).toFixed(2));

/** Type prices into the cells, then Save. Changed cells are highlighted; margin uses the current average cost. */
export function ListSheet({ listId, listName, rows }: { listId: string; listName: string; rows: Row[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changes = useMemo(
    () => Object.entries(edit).filter(([id, v]) => (parseMoney(v) ?? (v === "" ? "" : v)) !== shown(rows.find((r) => r.id === id)?.price ?? null)).map(([productId, price]) => ({ productId, price: price === "" ? null : price })),
    [edit, rows],
  );
  const invalid = changes.some((c) => c.price !== null && !parseMoney(c.price));

  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <Button
          disabled={pending || changes.length === 0 || invalid}
          onClick={() =>
            start(async () => {
              const r = await savePriceListSheet(listId, changes);
              if (r.error) setMsg({ tone: "danger", text: r.error });
              else {
                setMsg({ tone: "success", text: `Saved ${r.saved} price(s) in ${listName}.` });
                setEdit({});
                router.refresh();
              }
            })
          }
        >
          {pending ? "Saving…" : `Save ${changes.length || ""} change${changes.length === 1 ? "" : "s"}`}
        </Button>
        {invalid && <span className="text-sm text-danger">Some prices aren&apos;t valid.</span>}
      </div>
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-2 py-2">SKU</th><th className="px-2 py-2">Product</th><th className="px-2 py-2 text-right">SRP</th>
              <th className="px-2 py-2 text-right">{listName}</th><th className="px-2 py-2 text-right">vs SRP</th><th className="px-2 py-2 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = r.id in edit ? edit[r.id] : shown(r.price);
              const changed = r.id in edit && (parseMoney(edit[r.id]) ?? edit[r.id]) !== shown(r.price);
              const eff = Number(parseMoney(v) ?? r.srp ?? 0);
              const disc = r.srp && v ? Math.round((1 - eff / Number(r.srp)) * 100) : null;
              const margin = r.cost && Number(r.cost) > 0 && eff > 0 ? Math.round(((eff - Number(r.cost)) / eff) * 100) : null;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-2 py-1 font-mono text-xs">{r.sku}</td>
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{r.srp ? Number(r.srp).toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "—"}</td>
                  <td className="px-2 py-1 text-right">
                    <input
                      value={v}
                      onChange={(e) => setEdit((s) => ({ ...s, [r.id]: e.target.value }))}
                      placeholder="SRP"
                      inputMode="decimal"
                      aria-label={`${listName} price for ${r.sku}`}
                      className={`h-8 w-28 rounded border px-2 text-right tabular-nums ${changed ? "border-amber-500 bg-amber-50" : ""}`}
                    />
                  </td>
                  <td className="px-2 py-1 text-right text-xs">{disc != null && disc !== 0 ? `${disc > 0 ? "−" : "+"}${Math.abs(disc)}%` : ""}</td>
                  <td className={`px-2 py-1 text-right text-xs ${margin != null && margin < 10 ? "text-danger" : ""}`}>{margin != null ? `${margin}%` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
