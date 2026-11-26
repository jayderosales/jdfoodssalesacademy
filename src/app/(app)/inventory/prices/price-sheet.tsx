"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { parseMoney } from "@/lib/money";
import { savePriceSheet } from "../products/actions";

export interface SheetRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  srp: string | null;
  cost: string | null;
  onHand: number;
  stocked: boolean;
}

const fmtCost = (c: string | null) => (c == null ? "" : String(Number(c)));
const validCost = (v: string) => v === "" || /^\d+(\.\d{1,6})?$/.test(v.replace(/[₱,\s]/g, ""));

/** Spreadsheet-style editing: type in the cells, then Save. Changed cells are highlighted. */
export function PriceSheet({ rows, canPrice, canCost, seeCost }: { rows: SheetRow[]; canPrice: boolean; canCost: boolean; seeCost: boolean }) {
  const router = useRouter();
  const [srp, setSrp] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const changes = useMemo(() => {
    const out: { id: string; srp?: string | null; cost?: string }[] = [];
    for (const r of rows) {
      const c: { id: string; srp?: string | null; cost?: string } = { id: r.id };
      if (r.id in srp && (parseMoney(srp[r.id]) ?? srp[r.id]) !== (r.srp ? Number(r.srp).toFixed(2) : "")) c.srp = srp[r.id] === "" ? null : srp[r.id];
      if (r.id in cost && cost[r.id] !== "" && Number(cost[r.id].replace(/[₱,\s]/g, "")) !== Number(r.cost ?? NaN)) c.cost = cost[r.id];
      if (c.srp !== undefined || c.cost !== undefined) out.push(c);
    }
    return out;
  }, [rows, srp, cost]);
  const invalid = changes.some((c) => (c.srp && !parseMoney(c.srp)) || (c.cost && !validCost(c.cost)));
  const needsReason = changes.some((c) => c.cost !== undefined && (rows.find((r) => r.id === c.id)?.onHand ?? 0) > 0);

  function save() {
    setMsg(null);
    start(async () => {
      const res = await savePriceSheet(changes, reason);
      if (res.error) setMsg({ tone: "danger", text: res.error });
      else {
        setMsg({ tone: "success", text: `Saved ${res.saved} change(s).` });
        setSrp({});
        setCost({});
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Button onClick={save} disabled={pending || changes.length === 0 || invalid || (needsReason && reason.trim().length < 3)}>
          {pending ? "Saving…" : `Save ${changes.length || ""} change${changes.length === 1 ? "" : "s"}`}
        </Button>
        {needsReason && (
          <Field label="Reason for revaluing items with stock on hand" htmlFor="reason">
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. New supplier prices May 2026" className="w-80" />
          </Field>
        )}
        {invalid && <span className="text-sm text-danger">Some amounts aren&apos;t valid.</span>}
      </div>
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-2 py-2">SKU</th>
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2 text-right">On hand</th>
              <th className="px-2 py-2 text-right">SRP (₱)</th>
              {seeCost && <th className="px-2 py-2 text-right">Cost per unit (₱)</th>}
              {seeCost && <th className="px-2 py-2 text-right">Margin</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const srpVal = r.id in srp ? srp[r.id] : r.srp ? Number(r.srp).toFixed(2) : "";
              const costVal = r.id in cost ? cost[r.id] : fmtCost(r.cost);
              const srpNum = Number(parseMoney(srpVal) ?? NaN);
              const costNum = Number(costVal.replace(/[₱,\s]/g, ""));
              const margin = srpNum > 0 && costNum > 0 ? Math.round(((srpNum - costNum) / srpNum) * 100) : null;
              const srpChanged = changes.some((c) => c.id === r.id && c.srp !== undefined);
              const costChanged = changes.some((c) => c.id === r.id && c.cost !== undefined);
              return (
                <tr key={r.id} className="border-b">
                  <td className="px-2 py-1 font-mono text-xs">{r.sku}</td>
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{r.stocked ? `${r.onHand.toLocaleString("en-PH")} ${r.unit}` : "—"}</td>
                  <td className="px-2 py-1 text-right">
                    <input
                      aria-label={`SRP for ${r.sku}`}
                      inputMode="decimal"
                      disabled={!canPrice}
                      value={srpVal}
                      onChange={(e) => setSrp({ ...srp, [r.id]: e.target.value })}
                      className={`w-28 rounded border px-2 py-1 text-right tabular-nums ${srpChanged ? "border-brand bg-brand/5" : ""} ${srpVal && !parseMoney(srpVal) ? "border-danger" : ""}`}
                    />
                  </td>
                  {seeCost && (
                    <td className="px-2 py-1 text-right">
                      {r.stocked ? (
                        <input
                          aria-label={`Cost for ${r.sku}`}
                          inputMode="decimal"
                          disabled={!canCost}
                          value={costVal}
                          placeholder="—"
                          onChange={(e) => setCost({ ...cost, [r.id]: e.target.value })}
                          className={`w-28 rounded border px-2 py-1 text-right tabular-nums ${costChanged ? "border-brand bg-brand/5" : ""} ${!validCost(costVal) ? "border-danger" : ""}`}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">no stock</span>
                      )}
                    </td>
                  )}
                  {seeCost && (
                    <td className={`px-2 py-1 text-right tabular-nums ${margin != null && margin < 20 ? "text-danger" : ""}`}>{margin != null ? `${margin}%` : "—"}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No products match.</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        Cost is per unit shown in the On hand column (e.g. per bottle). For items with stock, a new cost revalues the stock and is logged with your reason. Margins under 20% are shown in red.
      </p>
    </Card>
  );
}
