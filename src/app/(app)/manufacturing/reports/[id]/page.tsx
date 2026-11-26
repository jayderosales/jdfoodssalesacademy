import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { RecordHistory } from "@/components/record-history";
import { Attachments } from "@/components/shared/attachments";
import { Card, CardTitle, Field, Input, PageHeader, Table, Td, Textarea, Th } from "@/components/ui";
import { requirePermission, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { addProductionLine, deleteProductionReport, removeProductionLine, saveReportNotes, submitProductionReport } from "../../actions";

export const metadata = { title: "Production report" };

export default async function ProductionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(["production.report", "production.view", "readonly.all"]);
  const me = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("production_reports").select("*, locations(name), author:created_by(full_name), submitter:submitted_by(full_name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as unknown as { id: string; number: string; report_date: string; shift: string; notes: string; status: string; created_by: string; submitted_at: string | null; locations: { name: string } | null; author: { full_name: string } | null; submitter: { full_name: string } | null };
  const { data: lines } = await supabase.from("production_report_lines").select("id, qty, unit_code, lot_no, mfg_date, expiry_date, notes, products(sku, name)").eq("report_id", id).order("created_at");
  type L = { id: string; qty: string; unit_code: string; lot_no: string; mfg_date: string; expiry_date: string | null; notes: string; products: { sku: string; name: string } | null };
  const ls = (lines as unknown as L[] | null) ?? [];
  const editable = r.status === "draft" && r.created_by === me.id;
  const { data: prods } = editable ? await supabase.from("products").select("sku, name, base_unit").eq("item_type", "finished_good").eq("active", true).order("sku").limit(3000) : { data: [] };
  const products = (prods as { sku: string; name: string; base_unit: string }[] | null) ?? [];
  const units = editable ? (((await supabase.from("units").select("code").order("code")).data as { code: string }[] | null) ?? []) : [];

  return (
    <>
      <PageHeader
        title={`Production report ${r.number}`}
        description={`${formatDate(r.report_date)} · ${r.locations?.name ?? ""}${r.shift ? ` · ${r.shift}` : ""} · by ${r.author?.full_name ?? "?"}`}
        actions={<span className={`rounded-full px-3 py-1 text-sm font-medium ${r.status === "draft" ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>{r.status === "draft" ? "Not submitted" : "Submitted"}</span>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>What was produced</CardTitle>
            <div className="overflow-x-auto">
              <Table>
                <thead><tr><Th>Product</Th><Th className="text-right">Quantity</Th><Th>Lot</Th><Th>Mfg date</Th><Th>Expiry</Th>{editable && <Th />}</tr></thead>
                <tbody>
                  {ls.map((l) => (
                    <tr key={l.id}>
                      <Td><b>{l.products?.sku}</b><div className="text-xs text-muted-foreground">{l.products?.name}{l.notes ? ` · ${l.notes}` : ""}</div></Td>
                      <Td className="text-right tabular-nums">{Number(l.qty).toLocaleString("en-PH")} {l.unit_code}</Td>
                      <Td className="font-mono">{l.lot_no}</Td>
                      <Td>{formatDate(l.mfg_date)}</Td>
                      <Td>{formatDate(l.expiry_date)}</Td>
                      {editable && <Td><ActionForm action={removeProductionLine} submitLabel="Remove" variant="outline" className="flex"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="report_id" value={id} /></ActionForm></Td>}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {ls.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nothing added yet.</p>}
            {editable && (
              <ActionForm action={addProductionLine} submitLabel="Add" className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-6 sm:items-end">
                <input type="hidden" name="report_id" value={id} />
                <datalist id="fg-products">{products.map((p) => <option key={p.sku} value={`${p.sku} — ${p.name}`} />)}</datalist>
                <datalist id="units">{units.map((u) => <option key={u.code} value={u.code} />)}</datalist>
                <div className="sm:col-span-3"><Field label="Product" htmlFor="product"><Input id="product" name="product" list="fg-products" required autoComplete="off" placeholder="Type the SKU or name" /></Field></div>
                <Field label="Quantity" htmlFor="qty"><Input id="qty" name="qty" type="number" min={0} step="any" inputMode="decimal" required /></Field>
                <Field label="Unit" htmlFor="unit_code" hint="Blank = the product's base unit"><Input id="unit_code" name="unit_code" list="units" autoComplete="off" /></Field>
                <Field label="Lot no." htmlFor="lot_no"><Input id="lot_no" name="lot_no" required autoComplete="off" /></Field>
                <Field label="Mfg date" htmlFor="mfg_date"><Input id="mfg_date" name="mfg_date" type="date" defaultValue={r.report_date} required /></Field>
                <Field label="Expiry" htmlFor="expiry_date" hint="Blank = mfg date + shelf life"><Input id="expiry_date" name="expiry_date" type="date" /></Field>
                <div className="sm:col-span-3"><Field label="Note (optional)" htmlFor="notes"><Input id="notes" name="notes" /></Field></div>
              </ActionForm>
            )}
          </Card>
          <Card><CardTitle>History</CardTitle><RecordHistory tables={["production_reports", "production_report_lines"]} recordIds={[id, ...ls.map((l) => l.id)]} /></Card>
        </div>
        <div className="space-y-4">
          {editable ? (
            <>
              <Card>
                <CardTitle>Details</CardTitle>
                <ActionForm action={saveReportNotes} submitLabel="Save" variant="outline">
                  <input type="hidden" name="id" value={id} />
                  <Field label="Production date" htmlFor="report_date"><Input id="report_date" name="report_date" type="date" defaultValue={r.report_date} required /></Field>
                  <Field label="Shift / line" htmlFor="shift"><Input id="shift" name="shift" defaultValue={r.shift} /></Field>
                  <Field label="Notes (issues, remarks)" htmlFor="notes-r"><Textarea id="notes-r" name="notes" rows={3} defaultValue={r.notes} /></Field>
                </ActionForm>
              </Card>
              <Card>
                <CardTitle>Submit</CardTitle>
                <p className="mb-2 text-sm text-muted-foreground">Check every lot number and quantity. After submitting, the report can&apos;t be changed.</p>
                <ActionForm action={submitProductionReport} submitLabel="Submit report" confirm="Submit this report? It will be locked."><input type="hidden" name="id" value={id} /></ActionForm>
                <ActionForm action={deleteProductionReport} submitLabel="Delete draft" variant="outline" className="mt-2" confirm="Delete this draft report?"><input type="hidden" name="id" value={id} /></ActionForm>
              </Card>
            </>
          ) : (
            <Card>
              <CardTitle>Details</CardTitle>
              <dl className="grid grid-cols-[7rem_1fr] gap-1 text-sm">
                <dt className="text-muted-foreground">Status</dt><dd>{r.status === "draft" ? "Not submitted" : `Submitted ${formatDate(r.submitted_at)} by ${r.submitter?.full_name ?? "?"}`}</dd>
                <dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{r.notes || "—"}</dd>
              </dl>
            </Card>
          )}
          <Card><CardTitle>Photos / files</CardTitle><Attachments table="production_reports" id={id} canAdd={r.created_by === me.id} userId={me.id} /></Card>
          <p className="text-xs text-muted-foreground">This report is a record only. Finished goods still go into stock through Inventory → Receipts until the full manufacturing module is built.</p>
        </div>
      </div>
    </>
  );
}
