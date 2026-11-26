import Link from "next/link";
import { Table, Td, Th } from "@/components/ui";
import { BUCKETS, type PartyAging, totals } from "@/lib/accounting/aging";
import { formatMoney, fromCentavos, toCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export interface Account { id: string; code: string; name: string; type: string; subtype: string; is_header: boolean; active: boolean; system_key: string | null }

export async function accounts(opts: { postingOnly?: boolean; types?: string[]; subtypes?: string[] } = {}) {
  const supabase = await createClient();
  let q = supabase.from("accounts").select("id, code, name, type, subtype, is_header, active, system_key").order("code");
  if (opts.postingOnly) q = q.eq("is_header", false).eq("active", true);
  if (opts.types) q = q.in("type", opts.types);
  if (opts.subtypes) q = q.in("subtype", opts.subtypes);
  const { data } = await q;
  return (data as Account[] | null) ?? [];
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual", sale: "Sale", sale_void: "Sale void", payment: "Customer payment", stock: "Stock", revaluation: "Revaluation",
  purchase_invoice: "Supplier invoice", purchase_invoice_void: "Supplier invoice void", supplier_payment: "Supplier payment",
  petty_cash: "Petty cash", opening: "Opening balance", reversal: "Reversal", closing: "Closing",
};

export const PAY_STATUS: Record<string, string> = { draft: "Draft", submitted: "Waiting for CEO", approved: "Approved, not yet paid", returned: "Returned", rejected: "Rejected", cancelled: "Cancelled", paid: "Paid" };

/** Link from a journal entry to the document it came from. */
export function sourceHref(table: string, id: string): string | null {
  switch (table) {
    case "sales_orders": return `/sales/orders/${id}`;
    case "payments": return "/sales/payments";
    case "supplier_invoices": return `/procurement/invoices/${id}`;
    case "supplier_payments": return `/accounting/payables/${id}`;
    case "petty_cash_requests": return `/requests/petty-cash/${id}`;
    case "stock_movements": return "/inventory/stock";
    default: return null;
  }
}

/** Banner while the books are in the parallel (test) run. */
export async function BooksBanner() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("books_live_from").limit(1).maybeSingle();
  const live = (data as { books_live_from: string | null } | null)?.books_live_from;
  if (live) return <p className="mb-4 rounded-lg bg-green-50 p-2 text-sm text-green-900">Official books since {formatDate(live)}.</p>;
  return (
    <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
      <b>Parallel run (test books).</b> Every posting is a test entry to compare with the Excel books. When the accountant is happy, the finance head starts the official books in <Link href="/accounting/periods" className="underline">Periods &amp; setup</Link> (test entries are removed). The chart of accounts and VAT/EWT rates still need the accountant&apos;s review.
    </p>
  );
}

/** Aging table shared by receivables and payables. */
export function AgingTable({ rows, names, partyHref, itemHref }: { rows: PartyAging[]; names: Map<string, string>; partyHref: (party: string) => string; itemHref: (key: string) => string | null }) {
  const t = totals(rows);
  const c = (v: bigint) => (v ? formatMoney(fromCentavos(v)) : "");
  return (
    <Table>
      <thead><tr><Th>Name</Th>{BUCKETS.map((b) => <Th key={b} className="text-right">{b === "current" ? "Not yet due" : `${b} days late`}</Th>)}<Th className="text-right">Total</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.party} className="align-top">
            <Td>
              <details>
                <summary className="cursor-pointer font-medium">{names.get(r.party) ?? "?"}</summary>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {r.items.map((i) => {
                    const href = itemHref(i.key);
                    return <li key={i.key}>{href ? <Link href={href} className="underline">{i.label}</Link> : i.label} · due {formatDate(i.due)}{i.daysLate ? ` · ${i.daysLate} days late` : ""} · {formatMoney(fromCentavos(i.open))}</li>;
                  })}
                  {r.credit > 0n && <li>Unapplied money / credit: {formatMoney(fromCentavos(r.credit))}</li>}
                  <li><Link href={partyHref(r.party)} className="underline">Open record</Link></li>
                </ul>
              </details>
            </Td>
            {BUCKETS.map((b) => <Td key={b} className={`text-right tabular-nums ${b !== "current" && r.buckets[b] ? "text-danger" : ""}`}>{c(r.buckets[b])}</Td>)}
            <Td className="text-right font-semibold tabular-nums">{c(r.total)}</Td>
          </tr>
        ))}
        <tr className="font-bold"><Td>Total</Td>{BUCKETS.map((b) => <Td key={b} className="text-right tabular-nums">{c(t.buckets[b])}</Td>)}<Td className="text-right tabular-nums">{c(t.total)}</Td></tr>
      </tbody>
    </Table>
  );
}

/** Signed decimal string → centavos. */
export const cents = (s: string | number | null | undefined) => {
  const v = String(s ?? "0");
  return v.startsWith("-") ? -toCentavos(v.slice(1)) : toCentavos(v);
};

export const monthStart =(d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(d) + "-01";
