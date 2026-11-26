import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { RecordPage } from "@/components/shared/record-page";
import { ScanOriginal } from "@/components/shared/scan-original";
import { Alert, Badge, Card, CardTitle, Field, Input, Table, Td, Th } from "@/components/ui";
import { can, getAccess, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addTransferLine, dispatchTransfer, receiveTransfer, removeTransferLine } from "../../actions";
import { qtyFmt, StockLineSelect } from "../../doc-parts";

export const metadata = { title: "Transfer" };

export default async function TransferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "lines" } = await searchParams;
  await requirePermission("inventory.view");
  const access = await getAccess();
  const supabase = await createClient();
  const [{ data }, { data: lines }] = await Promise.all([
    supabase
      .from("stock_transfers")
      .select("*, from:locations!stock_transfers_from_location_id_fkey(name), to:locations!stock_transfers_to_location_id_fkey(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("stock_transfer_lines").select("id, qty, received_qty, products(sku, name, base_unit), batches(lot_no, expiry_date)").eq("transfer_id", id),
  ]);
  if (!data) notFound();
  const t = data as { id: string; number: string; status: string; from_location_id: string; to_location_id: string; notes: string; dispatched_at: string | null; received_at: string | null; from: { name: string } | null; to: { name: string } | null };
  const rows = (lines as unknown as { id: string; qty: string; received_qty: string | null; products: { sku: string; name: string; base_unit: string } | null; batches: { lot_no: string; expiry_date: string | null } | null }[] | null) ?? [];
  const canMove = can(access, "inventory.transfer");
  const draft = t.status === "draft" && canMove;
  const short = rows.some((l) => l.received_qty != null && Number(l.received_qty) < Number(l.qty));

  return (
    <RecordPage
      backHref="/inventory/transfers"
      backLabel="Transfers"
      title={t.number}
      status={<Badge tone={t.status === "received" ? "success" : t.status === "dispatched" ? "warning" : "neutral"}>{t.status === "dispatched" ? "in transit" : t.status}</Badge>}
      subtitle={`${t.from?.name} → ${t.to?.name}${t.dispatched_at ? ` · dispatched ${formatDate(t.dispatched_at, true)}` : ""}${t.received_at ? ` · received ${formatDate(t.received_at, true)}` : ""}`}
      tabs={[{ key: "lines", label: "Lines", count: rows.length }, { key: "history", label: "History" }]}
      activeTab={tab}
      actions={
        draft && rows.length > 0 ? (
          <ActionForm action={dispatchTransfer} submitLabel="Dispatch" className="flex flex-col gap-2" confirm="Dispatch now? The stock leaves the source location.">
            <input type="hidden" name="id" value={t.id} />
          </ActionForm>
        ) : undefined
      }
    >
      {short && <div className="mb-4"><Alert tone="danger">Some items arrived short. The difference is shown as in transit; operations has been notified.</Alert></div>}
      {tab === "lines" && (
        <div className="space-y-4">
          {t.status === "dispatched" && canMove ? (
            <Card>
              <CardTitle>Receive at {t.to?.name}</CardTitle>
              <ActionForm action={receiveTransfer} submitLabel="Confirm received" confirm="Confirm these quantities were received?">
                <input type="hidden" name="id" value={t.id} />
                <Table>
                  <thead><tr><Th>Product</Th><Th>Lot</Th><Th className="text-right">Sent</Th><Th className="text-right">Received</Th></tr></thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.id}>
                        <Td>{l.products?.sku}<div className="text-xs text-muted-foreground">{l.products?.name}</div></Td>
                        <Td className="font-mono text-xs">{l.batches?.lot_no}</Td>
                        <Td className="text-right tabular-nums">{qtyFmt(l.qty)}</Td>
                        <Td className="text-right"><Input name={`received:${l.id}`} type="number" min={0} max={Number(l.qty)} step="any" defaultValue={Number(l.qty)} className="ml-auto w-24 text-right" aria-label={`Received ${l.products?.sku}`} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </ActionForm>
            </Card>
          ) : (
            <Card>
              <Table>
                <thead><tr><Th>Product</Th><Th>Lot</Th><Th>Expiry</Th><Th className="text-right">Qty</Th><Th className="text-right">Received</Th>{draft && <Th />}</tr></thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.products?.sku}<div className="text-xs text-muted-foreground">{l.products?.name}</div></Td>
                      <Td className="font-mono text-xs">{l.batches?.lot_no}</Td>
                      <Td>{formatDate(l.batches?.expiry_date)}</Td>
                      <Td className="text-right tabular-nums">{qtyFmt(l.qty)} {l.products?.base_unit}</Td>
                      <Td className="text-right tabular-nums">{l.received_qty != null ? qtyFmt(l.received_qty) : "—"}</Td>
                      {draft && (
                        <Td>
                          <ActionForm action={removeTransferLine} submitLabel="Remove" variant="outline" className="flex">
                            <input type="hidden" name="line_id" value={l.id} />
                            <input type="hidden" name="transfer_id" value={t.id} />
                          </ActionForm>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
              {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No lines yet.</p>}
            </Card>
          )}
          {draft && (
            <Card>
              <CardTitle>Add a line (released stock only)</CardTitle>
              <ActionForm action={addTransferLine} submitLabel="Add line">
                <input type="hidden" name="transfer_id" value={t.id} />
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-3"><Field label="Item" htmlFor="stock"><StockLineSelect locationId={t.from_location_id} releasedOnly /></Field></div>
                  <Field label="Quantity" htmlFor="qty"><Input id="qty" name="qty" type="number" min={0.0001} step="any" required /></Field>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
      {tab !== "history" && <div className="mt-4 max-w-md"><ScanOriginal table="stock_transfers" id={t.id} /></div>}
      {tab === "history" && <RecordHistory tables={["stock_transfers", "stock_transfer_lines"]} recordIds={[t.id, ...rows.map((l) => l.id)]} />}
    </RecordPage>
  );
}
