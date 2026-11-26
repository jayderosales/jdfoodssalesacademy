import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess, getSettings, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { setBatchStatus } from "../actions";

export const metadata = { title: "Batches" };

interface Batch {
  id: string;
  lot_no: string;
  mfg_date: string | null;
  expiry_date: string | null;
  qa_status: string;
  qa_note: string;
  received_at: string;
  products: { id: string; sku: string; name: string } | null;
  stock_balances: { on_hand: string }[];
}

function expiryTone(days: number | null, critical: number, near: number) {
  if (days == null) return "";
  if (days < 0) return "bg-danger text-white";
  if (days <= critical) return "bg-danger/15 text-danger";
  if (days <= near) return "bg-amber-100 text-amber-900";
  return "bg-success/10 text-success";
}

/** Batches with an expiry heat-map (red: expired/critical, amber: near expiry, green: healthy) and QA actions. */
export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; expiring?: string }> }) {
  await requirePermission("inventory.view");
  const access = await getAccess();
  const settings = await getSettings();
  const near = (settings as unknown as { near_expiry_days?: number })?.near_expiry_days ?? 60;
  const critical = (settings as unknown as { critical_expiry_days?: number })?.critical_expiry_days ?? 30;
  const { q, status, expiring } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("batches")
    .select("id, lot_no, mfg_date, expiry_date, qa_status, qa_note, received_at, products(id, sku, name), stock_balances(on_hand)")
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .limit(300);
  if (status) query = query.eq("qa_status", status);
  if (expiring) query = query.lte("expiry_date", new Date(Date.now() + near * 86400000).toISOString().slice(0, 10)).in("qa_status", ["released", "quarantine", "on_hold"]);
  if (q) query = query.ilike("lot_no", `%${q.replace(/[%,()*]/g, "")}%`);
  const { data } = await query;
  const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()));
  const rows = ((data as unknown as Batch[] | null) ?? [])
    .map((b) => ({ ...b, qty: b.stock_balances.reduce((s, x) => s + Number(x.on_hand), 0), days: b.expiry_date ? Math.round((new Date(b.expiry_date).getTime() - today.getTime()) / 86400000) : null }))
    .filter((b) => b.qty > 0 || status);
  const canQa = can(access, "inventory.qa.release");

  return (
    <>
      <PageHeader title="Batches" description={`Lots in stock. Red = expired or within ${critical} days, amber = within ${near} days.`} />
      <Card>
        <form className="mb-3 flex flex-wrap gap-2">
          <Input name="q" defaultValue={q} placeholder="Lot number" aria-label="Lot number" className="w-44" />
          <Select name="status" defaultValue={status ?? ""} aria-label="QA status" className="w-44">
            <option value="">In stock (any status)</option>
            {["quarantine", "released", "on_hold", "rejected", "expired"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="expiring" value="1" defaultChecked={!!expiring} className="size-4" /> Expiring within {near} days</label>
          <Button type="submit" variant="outline">Show</Button>
        </form>
        <Table>
          <thead><tr><Th>Product</Th><Th>Lot</Th><Th>Expiry</Th><Th>QA status</Th><Th className="text-right">On hand</Th>{canQa && <Th>QA action</Th>}</tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <Td>{b.products && <Link href={`/inventory/products/${b.products.id}?tab=stock`} className="text-brand underline">{b.products.sku}</Link>}<div className="text-xs text-muted-foreground">{b.products?.name}</div></Td>
                <Td className="font-mono text-xs">{b.lot_no}<div className="text-muted-foreground">received {formatDate(b.received_at)}</div></Td>
                <Td><span className={`rounded px-2 py-0.5 text-xs font-medium ${expiryTone(b.days, critical, near)}`}>{b.expiry_date ? `${formatDate(b.expiry_date)}${b.days != null ? ` (${b.days < 0 ? `${-b.days}d ago` : `${b.days}d`})` : ""}` : "No expiry"}</span></Td>
                <Td><Badge tone={b.qa_status === "released" ? "success" : b.qa_status === "quarantine" ? "warning" : "danger"}>{b.qa_status.replace("_", " ")}</Badge>{b.qa_note && <div className="text-xs text-muted-foreground">{b.qa_note}</div>}</Td>
                <Td className="text-right tabular-nums">{b.qty.toLocaleString("en-PH")}</Td>
                {canQa && (
                  <Td>
                    {b.qa_status !== "expired" && (
                      <ActionForm action={setBatchStatus} submitLabel="Set" variant="outline" className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="id" value={b.id} />
                        <Select name="status" defaultValue={b.qa_status === "quarantine" ? "released" : b.qa_status} aria-label="New status" className="w-32">
                          <option value="released">Release</option>
                          <option value="on_hold">Hold</option>
                          <option value="rejected">Reject</option>
                          <option value="quarantine">Quarantine</option>
                        </Select>
                        <Input name="note" placeholder="Reason" aria-label="Reason" className="w-32" />
                      </ActionForm>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No batches match.</p>}
      </Card>
    </>
  );
}
