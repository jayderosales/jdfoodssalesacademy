import "server-only";
import { ageItems, type OpenItem, type PartyAging } from "@/lib/accounting/aging";
import { toCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;
/** Exact decimal string → centavos (no floating point on money). */
const cents = (s: string | number | null | undefined) => {
  const v = String(s ?? "0");
  return v.startsWith("-") ? -toCentavos(v.slice(1)) : toCentavos(v);
};

/** What customers owe: released orders not fully paid + opening balances, less money paid on account. */
export async function loadReceivables(supabase: Supa, today: string): Promise<{ rows: PartyAging[]; names: Map<string, string> }> {
  const [{ data: orders }, { data: openings }, { data: onAccount }] = await Promise.all([
    supabase.from("sales_orders").select("id, number, customer_id, total, paid_amount, due_date, ready_at").in("status", ["ready_for_pickup", "dispatched", "delivered"]).limit(5000),
    supabase.from("customers").select("id, opening_balance, opening_due_date, created_at").gt("opening_balance", 0),
    supabase.from("payments").select("customer_id, amount").eq("status", "confirmed").is("order_id", null).limit(5000),
  ]);
  type O = { id: string; number: string; customer_id: string; total: string; paid_amount: string; due_date: string | null; ready_at: string | null };
  const items: OpenItem[] = [];
  for (const o of (orders as O[] | null) ?? []) {
    if (Number(o.paid_amount) >= Number(o.total)) continue;
    const issued = (o.ready_at ?? today).slice(0, 10);
    items.push({ key: o.id, party: o.customer_id, label: o.number, date: issued, due: o.due_date ?? issued, amount: cents(o.total), paid: cents(o.paid_amount) });
  }
  for (const c of (openings as { id: string; opening_balance: string; opening_due_date: string | null; created_at: string }[] | null) ?? []) {
    const d = c.opening_due_date ?? c.created_at.slice(0, 10);
    items.push({ key: `opening:${c.id}`, party: c.id, label: "Opening balance", date: d, due: d, amount: cents(c.opening_balance), paid: 0n });
  }
  const rows = ageItems(items, ((onAccount as { customer_id: string; amount: string }[] | null) ?? []).map((p) => ({ party: p.customer_id, amount: cents(p.amount) })), today);
  const ids = rows.map((r) => r.party);
  const { data: custs } = ids.length ? await supabase.from("customers").select("id, name, code").in("id", ids) : { data: [] };
  return { rows, names: new Map(((custs as { id: string; name: string; code: string }[] | null) ?? []).map((c) => [c.id, `${c.name}${c.code ? ` (${c.code})` : ""}`])) };
}

/** What we owe suppliers: matched/approved invoices not fully paid + supplier opening balances. */
export async function loadPayables(supabase: Supa, today: string): Promise<{ rows: PartyAging[]; names: Map<string, string> }> {
  const [{ data: invs }, { data: openings }] = await Promise.all([
    supabase.from("supplier_invoices").select("id, number, invoice_no, supplier_id, invoice_date, due_date, total, paid_amount").in("status", ["matched", "approved"]).limit(5000),
    supabase.from("suppliers").select("id, opening_balance, created_at").gt("opening_balance", 0),
  ]);
  type I = { id: string; number: string; invoice_no: string; supplier_id: string; invoice_date: string; due_date: string | null; total: string; paid_amount: string };
  const items: OpenItem[] = ((invs as I[] | null) ?? []).map((i) => ({ key: i.id, party: i.supplier_id, label: `Invoice ${i.invoice_no}`, date: i.invoice_date, due: i.due_date ?? i.invoice_date, amount: cents(i.total), paid: cents(i.paid_amount) }));
  for (const s of (openings as { id: string; opening_balance: string; created_at: string }[] | null) ?? []) {
    items.push({ key: `opening:${s.id}`, party: s.id, label: "Opening balance", date: s.created_at.slice(0, 10), due: s.created_at.slice(0, 10), amount: cents(s.opening_balance), paid: 0n });
  }
  const rows = ageItems(items, [], today);
  const ids = rows.map((r) => r.party);
  const { data: sups } = ids.length ? await supabase.from("suppliers").select("id, name").in("id", ids) : { data: [] };
  return { rows, names: new Map(((sups as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s.name])) };
}
