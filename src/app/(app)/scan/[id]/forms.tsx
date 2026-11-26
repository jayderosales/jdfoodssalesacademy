import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { bestMatch, cleanAmount, cleanDate, cleanQty } from "@/lib/scan/match";
import { createClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/utils";
import { scanCreateBill, scanCreateReceipt, scanCreateTransfer, scanCreateTransmittal, scanReceivePo, scanRecordExpense, scanRecordPayment } from "../actions";

type Props = { scanId: string; x: Record<string, unknown>; sp: Record<string, string | undefined> };
type Item = Record<string, string>;
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const items = (v: unknown): Item[] => (Array.isArray(v) ? (v as Item[]) : []);
const EXTRA_ROWS = 3;

/** A "matched by …" hint next to a field the system filled in. */
function Hint({ how, read }: { how: string; read: string }) {
  if (!read) return null;
  return <span className="mt-0.5 block text-xs text-muted-foreground">On the paper: “{read}”{how === "none" ? " (no match found, choose one)" : how === "name" ? " (closest match, please check)" : ""}</span>;
}

async function products() {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, sku, name, base_unit").eq("active", true).order("sku").limit(3000);
  return ((data as { id: string; sku: string; name: string; base_unit: string }[] | null) ?? []).map((p) => ({ ...p, code: p.sku }));
}

function ProductList({ list }: { list: { sku: string; name: string }[] }) {
  return <datalist id="scan-products">{list.map((p) => <option key={p.sku} value={`${p.sku} — ${p.name}`} />)}</datalist>;
}

async function stockLocations() {
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("id, code, name").eq("holds_inventory", true).eq("active", true).order("name");
  return ((data as { id: string; code: string; name: string }[] | null) ?? []).map((l) => ({ ...l, alt: [l.code] }));
}

// ================================================================ supplier delivery slip
export async function DeliveryForm({ scanId, x, sp }: Props) {
  const supabase = await createClient();
  const [{ data: sups }, { data: pos }, locs, prods] = await Promise.all([
    supabase.from("suppliers").select("id, code, name, tin").neq("status", "blocked").order("name"),
    supabase.from("purchase_orders").select("id, number, supplier_id, location_id, status").in("status", ["approved", "sent", "partly_received"]).order("created_at", { ascending: false }).limit(300),
    stockLocations(),
    products(),
  ]);
  const suppliers = (sups as { id: string; code: string; name: string; tin: string }[] | null) ?? [];
  const openPos = (pos as { id: string; number: string; supplier_id: string; location_id: string }[] | null) ?? [];
  const sup = bestMatch({ name: txt(x.supplier_name), tin: txt(x.supplier_tin) }, suppliers);
  const readPo = txt(x.po_number).toUpperCase();
  const poGuess = openPos.find((p) => readPo && (p.number.toUpperCase() === readPo || p.number.toUpperCase().endsWith(readPo.replace(/^PO-?/, "")))) ?? (sup.candidate ? openPos.filter((p) => p.supplier_id === sup.candidate!.id).length === 1 ? openPos.find((p) => p.supplier_id === sup.candidate!.id) : undefined : undefined);
  const poId = sp.po === "none" ? null : (sp.po && openPos.some((p) => p.id === sp.po) ? sp.po : poGuess?.id ?? null);
  const read = items(x.items);
  const choosePo = (
    <form className="mb-3 flex flex-wrap items-end gap-2 rounded-lg bg-muted/50 p-2 text-sm">
      <label className="text-xs">Purchase order
        <Select name="po" defaultValue={poId ?? "none"} className="h-9 w-72">
          <option value="none">No PO (direct receipt)</option>
          {openPos.filter((p) => !sup.candidate || p.supplier_id === sup.candidate.id || p.id === poId).map((p) => <option key={p.id} value={p.id}>{p.number}{suppliers.find((s) => s.id === p.supplier_id) ? ` · ${suppliers.find((s) => s.id === p.supplier_id)!.name}` : ""}</option>)}
        </Select>
      </label>
      <button className="h-9 rounded-lg border bg-card px-3">Use this</button>
      {readPo && <span className="text-xs text-muted-foreground">PO on the slip: “{readPo}”</span>}
    </form>
  );

  if (poId) {
    const { data: lines } = await supabase.from("purchase_order_lines").select("id, product_id, qty, received_qty, unit_code, products(sku, name)").eq("po_id", poId).order("id");
    const pl = ((lines as unknown as { id: string; product_id: string; qty: string; received_qty: string; unit_code: string; products: { sku: string; name: string } }[] | null) ?? []);
    const cands = pl.map((l) => ({ id: l.id, name: l.products.name, code: l.products.sku }));
    const byLine = new Map<string, Item>();
    const unmatched: Item[] = [];
    for (const it of read) {
      const m = bestMatch({ code: txt(it.code), name: txt(it.description) }, cands.filter((c) => !byLine.has(c.id)), 0.45);
      if (m.candidate) byLine.set(m.candidate.id, it);
      else unmatched.push(it);
    }
    return (
      <>
        {choosePo}
        <ActionForm action={scanReceivePo} submitLabel="Receive against this PO" className="space-y-3">
          <input type="hidden" name="scan_id" value={scanId} /><input type="hidden" name="po_id" value={poId} /><input type="hidden" name="rows" value={pl.length} />
          <Field label="Delivery receipt / slip no." htmlFor="reference"><Input id="reference" name="reference" defaultValue={txt(x.document_no)} /></Field>
          <div className="overflow-x-auto">
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">Ordered / received</Th><Th>Qty now</Th><Th>Lot</Th><Th>Expiry</Th></tr></thead>
              <tbody>
                {pl.map((l, i) => {
                  const it = byLine.get(l.id);
                  return (
                    <tr key={l.id} className={it ? "" : "text-muted-foreground"}>
                      <Td>{l.products.sku}<div className="text-xs">{l.products.name}</div>{it && <div className="text-xs text-muted-foreground">Slip: {txt(it.description) || txt(it.code)} · {txt(it.qty)} {txt(it.unit)}</div>}</Td>
                      <Td className="text-right tabular-nums">{Number(l.qty)} / {Number(l.received_qty)} {l.unit_code}</Td>
                      <Td>
                        <input type="hidden" name={`l${i}_po_line_id`} value={l.id} />
                        <Input name={`l${i}_qty`} defaultValue={it ? cleanQty(it.qty) : ""} inputMode="decimal" className="h-8 w-20" aria-label={`Quantity received ${l.products.sku}`} />
                      </Td>
                      <Td><Input name={`l${i}_lot_no`} defaultValue={it ? txt(it.lot_no) : ""} className="h-8 w-28" aria-label="Lot" /></Td>
                      <Td><Input name={`l${i}_expiry_date`} type="date" defaultValue={it ? cleanDate(it.expiry_date) : ""} className="h-8" aria-label="Expiry" /><input type="hidden" name={`l${i}_mfg_date`} value={it ? cleanDate(it.mfg_date) : ""} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          {unmatched.length > 0 && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">On the slip but not on this PO: {unmatched.map((u) => `${txt(u.description) || txt(u.code)} (${txt(u.qty)} ${txt(u.unit)})`).join("; ")}. Receive them separately or ask the buyer.</p>}
          <p className="text-xs text-muted-foreground">Quantities are in the PO&apos;s unit. Lots go to QA quarantine until released. Over-receiving beyond the allowed percentage is blocked.</p>
        </ActionForm>
      </>
    );
  }

  const units = new Set(((await supabase.from("units").select("code")).data as { code: string }[] | null ?? []).map((u) => u.code));
  const rowsData = [...read, ...Array.from({ length: EXTRA_ROWS }, () => ({} as Item))];
  return (
    <>
      {choosePo}
      <ActionForm action={scanCreateReceipt} submitLabel="Create stock receipt (draft)" className="space-y-3">
        <ProductList list={prods} />
        <input type="hidden" name="scan_id" value={scanId} /><input type="hidden" name="rows" value={rowsData.length} />
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Received at" htmlFor="location_id">
            <Select id="location_id" name="location_id" defaultValue={locs[0]?.id} required>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
          </Field>
          <Field label="Supplier" htmlFor="supplier_name"><Input id="supplier_name" name="supplier_name" defaultValue={sup.candidate?.name ?? txt(x.supplier_name)} /></Field>
          <Field label="Slip no." htmlFor="reference"><Input id="reference" name="reference" defaultValue={txt(x.document_no)} /></Field>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <thead><tr><Th>Product</Th><Th>Qty</Th><Th>Unit</Th><Th>Lot</Th><Th>Expiry</Th></tr></thead>
            <tbody>
              {rowsData.map((it, i) => {
                const m = it.description || it.code ? bestMatch({ code: txt(it.code), name: txt(it.description) }, prods, 0.45) : null;
                const unit = txt(it.unit).toLowerCase();
                return (
                  <tr key={i}>
                    <Td><Input name={`l${i}_product`} list="scan-products" defaultValue={m?.candidate ? `${m.candidate.sku} — ${m.candidate.name}` : ""} className="h-8 min-w-56" aria-label={`Product line ${i + 1}`} />{m && <Hint how={m.how} read={txt(it.description) || txt(it.code)} />}</Td>
                    <Td><Input name={`l${i}_qty`} defaultValue={cleanQty(it.qty)} inputMode="decimal" className="h-8 w-20" aria-label="Quantity" /></Td>
                    <Td><Input name={`l${i}_unit_code`} defaultValue={units.has(unit) ? unit : m?.candidate?.base_unit ?? ""} className="h-8 w-20" aria-label="Unit" />{unit && !units.has(unit) && <span className="block text-xs text-muted-foreground">Slip: {unit}</span>}</Td>
                    <Td><Input name={`l${i}_lot_no`} defaultValue={txt(it.lot_no)} className="h-8 w-28" aria-label="Lot" /></Td>
                    <Td><Input name={`l${i}_expiry_date`} type="date" defaultValue={cleanDate(it.expiry_date)} className="h-8" aria-label="Expiry" /><input type="hidden" name={`l${i}_mfg_date`} value={cleanDate(it.mfg_date)} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">Creates a draft receipt. Check it and press Post on the next page; lots go to QA quarantine.</p>
      </ActionForm>
    </>
  );
}

// ================================================================ goods sent between sites
export async function TransferForm({ scanId, x }: Props) {
  const [locs, prods] = await Promise.all([stockLocations(), products()]);
  const from = bestMatch({ name: txt(x.from_location) }, locs, 0.4);
  const to = bestMatch({ name: txt(x.to_location) }, locs.filter((l) => l.id !== from.candidate?.id), 0.4);
  const rowsData = [...items(x.items), ...Array.from({ length: EXTRA_ROWS }, () => ({} as Item))];
  return (
    <ActionForm action={scanCreateTransfer} submitLabel="Create transfer (draft)" className="space-y-3">
      <ProductList list={prods} />
      <input type="hidden" name="scan_id" value={scanId} /><input type="hidden" name="rows" value={rowsData.length} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="From" htmlFor="from_location_id">
          <Select id="from_location_id" name="from_location_id" defaultValue={from.candidate?.id ?? ""} required><option value="" disabled>Choose…</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
          <Hint how={from.how} read={txt(x.from_location)} />
        </Field>
        <Field label="To" htmlFor="to_location_id">
          <Select id="to_location_id" name="to_location_id" defaultValue={to.candidate?.id ?? ""} required><option value="" disabled>Choose…</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
          <Hint how={to.how} read={txt(x.to_location)} />
        </Field>
        <Field label="Slip no." htmlFor="reference"><Input id="reference" name="reference" defaultValue={txt(x.document_no)} /></Field>
      </div>
      <Table>
        <thead><tr><Th>Product</Th><Th>Qty (base unit)</Th><Th>Lot (optional)</Th></tr></thead>
        <tbody>
          {rowsData.map((it, i) => {
            const m = it.description || it.code ? bestMatch({ code: txt(it.code), name: txt(it.description) }, prods, 0.45) : null;
            return (
              <tr key={i}>
                <Td><Input name={`l${i}_product`} list="scan-products" defaultValue={m?.candidate ? `${m.candidate.sku} — ${m.candidate.name}` : ""} className="h-8 min-w-56" aria-label={`Product line ${i + 1}`} />{m && <Hint how={m.how} read={txt(it.description) || txt(it.code)} />}</Td>
                <Td><Input name={`l${i}_qty`} defaultValue={cleanQty(it.qty)} inputMode="decimal" className="h-8 w-24" aria-label="Quantity" />{it.unit && <span className="block text-xs text-muted-foreground">Slip: {txt(it.qty)} {txt(it.unit)}{m?.candidate ? ` · base unit: ${m.candidate.base_unit}` : ""}</span>}</Td>
                <Td><Input name={`l${i}_lot_no`} defaultValue={txt(it.lot_no)} className="h-8 w-28" aria-label="Lot" /></Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="text-xs text-muted-foreground">Quantities are in each product&apos;s base unit (convert boxes/cases). Released stock is picked earliest-expiry first, or the lot you name. Dispatch it from the transfer page.</p>
    </ActionForm>
  );
}

// ================================================================ documents sent to accounting
export async function TransmittalForm({ scanId, x }: Props) {
  const rowsData = [...items(x.items), ...Array.from({ length: EXTRA_ROWS }, () => ({} as Item))];
  return (
    <ActionForm action={scanCreateTransmittal} submitLabel="Save transmittal" className="space-y-3">
      <input type="hidden" name="scan_id" value={scanId} /><input type="hidden" name="rows" value={rowsData.length} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="From (person / branch)" htmlFor="from_name"><Input id="from_name" name="from_name" defaultValue={txt(x.from_name)} required /></Field>
        <Field label="To" htmlFor="to_name"><Input id="to_name" name="to_name" defaultValue={txt(x.to_name) || "Accounting"} /></Field>
        <Field label="Date sent" htmlFor="sent_on"><Input id="sent_on" name="sent_on" type="date" defaultValue={cleanDate(txt(x.date)) || manilaToday()} /></Field>
      </div>
      <Field label="Notes" htmlFor="notes"><Input id="notes" name="notes" defaultValue={txt(x.document_no) ? `Transmittal no. ${txt(x.document_no)}` : ""} /></Field>
      <div className="overflow-x-auto">
        <Table>
          <thead><tr><Th>Document type</Th><Th>No.</Th><Th>Customer / supplier</Th><Th>Date</Th><Th>Amount</Th></tr></thead>
          <tbody>
            {rowsData.map((it, i) => (
              <tr key={i}>
                <Td><Input name={`l${i}_doc_type`} defaultValue={txt(it.doc_type)} className="h-8 min-w-36" aria-label={`Document type line ${i + 1}`} /></Td>
                <Td><Input name={`l${i}_doc_no`} defaultValue={txt(it.doc_no)} className="h-8 w-28" aria-label="Document number" /></Td>
                <Td><Input name={`l${i}_party`} defaultValue={txt(it.party)} className="h-8 min-w-40" aria-label="Customer or supplier" /></Td>
                <Td><Input name={`l${i}_doc_date`} type="date" defaultValue={cleanDate(it.doc_date)} className="h-8" aria-label="Document date" /></Td>
                <Td><Input name={`l${i}_amount`} defaultValue={cleanAmount(it.amount)} inputMode="decimal" className="h-8 w-28" aria-label="Amount" /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Accounting ticks off each document when it arrives. Hand over the papers with this transmittal.</p>
    </ActionForm>
  );
}

// ================================================================ supplier bill
export async function BillForm({ scanId, x }: Props) {
  const supabase = await createClient();
  const [{ data: sups }, { data: pos }, { data: accs }] = await Promise.all([
    supabase.from("suppliers").select("id, code, name, tin, vat_registered").neq("status", "blocked").order("name"),
    supabase.from("purchase_orders").select("id, number, supplier_id").in("status", ["approved", "sent", "partly_received", "received"]).order("created_at", { ascending: false }).limit(300),
    supabase.from("accounts").select("id, code, name, system_key").eq("type", "expense").eq("is_header", false).eq("active", true).order("code"),
  ]);
  const suppliers = (sups as { id: string; code: string; name: string; tin: string; vat_registered: boolean }[] | null) ?? [];
  const openPos = (pos as { id: string; number: string; supplier_id: string }[] | null) ?? [];
  const expense = (accs as { id: string; code: string; name: string; system_key: string | null }[] | null) ?? [];
  const sup = bestMatch({ name: txt(x.supplier_name), tin: txt(x.supplier_tin) }, suppliers);
  const readPo = txt(x.po_number).toUpperCase();
  const po = openPos.find((p) => readPo && (p.number.toUpperCase() === readPo || p.number.toUpperCase().endsWith(readPo.replace(/^PO-?/, ""))));
  const other = expense.find((a) => a.system_key === "purchase_other")?.id ?? "";
  const rowsData = [...items(x.items), ...Array.from({ length: EXTRA_ROWS }, () => ({} as Item))];
  const total = cleanAmount(txt(x.total));
  return (
    <ActionForm action={scanCreateBill} submitLabel="Create supplier invoice (draft)" className="space-y-3">
      <input type="hidden" name="scan_id" value={scanId} /><input type="hidden" name="rows" value={rowsData.length} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="supplier_id">
          <Select id="supplier_id" name="supplier_id" defaultValue={sup.candidate?.id ?? ""} required><option value="" disabled>Choose…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Hint how={sup.how} read={[txt(x.supplier_name), txt(x.supplier_tin) && `TIN ${txt(x.supplier_tin)}`].filter(Boolean).join(", ")} />
          {!sup.candidate && <Link href="/procurement/suppliers" className="text-xs underline">Add the supplier first</Link>}
        </Field>
        <Field label="Purchase order (if any)" htmlFor="po_id">
          <Select id="po_id" name="po_id" defaultValue={po?.id ?? ""}><option value="">No PO (expense bill: rent, utilities, services…)</option>{openPos.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}</Select>
          {readPo && <span className="text-xs text-muted-foreground">PO on the bill: “{readPo}”</span>}
        </Field>
        <Field label="Invoice no." htmlFor="invoice_no"><Input id="invoice_no" name="invoice_no" defaultValue={txt(x.invoice_no)} required /></Field>
        <Field label="Invoice date" htmlFor="invoice_date"><Input id="invoice_date" name="invoice_date" type="date" defaultValue={cleanDate(txt(x.invoice_date))} required /></Field>
        <Field label="Due date" htmlFor="due_date"><Input id="due_date" name="due_date" type="date" defaultValue={cleanDate(txt(x.due_date))} /></Field>
        <div className="text-sm"><p className="text-xs text-muted-foreground">Totals on the bill</p><p>Net {formatMoney(cleanAmount(txt(x.subtotal)) || null)} · VAT {formatMoney(cleanAmount(txt(x.vat_amount)) || null)}</p><p className="font-semibold">Total {formatMoney(total || null)}</p></div>
      </div>
      <details open={!po} className="rounded-lg border p-2">
        <summary className="cursor-pointer text-sm font-medium">Bill lines (used only when there&apos;s no PO)</summary>
        <p className="my-1 text-xs text-muted-foreground">With a PO, the lines come from what was received and you compare them on the next page. Without a PO, enter prices <b>including VAT</b>{txt(x.vat_inclusive) === "no" ? ". This bill shows prices before VAT, so add the VAT" : ""}. Bills without a PO go to the CEO as a variance.</p>
        <Table>
          <thead><tr><Th>Description</Th><Th>Qty</Th><Th>Unit price</Th><Th>Expense account</Th></tr></thead>
          <tbody>
            {rowsData.map((it, i) => (
              <tr key={i}>
                <Td><Input name={`l${i}_description`} defaultValue={txt(it.description) || txt(it.code)} className="h-8 min-w-48" aria-label={`Description line ${i + 1}`} /></Td>
                <Td><Input name={`l${i}_qty`} defaultValue={cleanQty(it.qty) || (it.description ? "1" : "")} inputMode="decimal" className="h-8 w-20" aria-label="Quantity" /></Td>
                <Td><Input name={`l${i}_unit_price`} defaultValue={cleanAmount(it.unit_price) || cleanAmount(it.amount)} inputMode="decimal" className="h-8 w-28" aria-label="Unit price" /></Td>
                <Td><Select name={`l${i}_expense_account_id`} defaultValue={other} className="h-8" aria-label="Expense account">{expense.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</Select></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </details>
    </ActionForm>
  );
}

// ================================================================ expense receipt
const CATEGORY_ACCOUNT: Record<string, string> = { fuel: "6100", transportation: "6100", meals: "6190", supplies: "6060", courier: "6040", repairs: "6090", utilities: "6030", communication: "6110", other: "6190" };

export async function ExpenseForm({ scanId, x }: Props) {
  const supabase = await createClient();
  const access = await getAccess();
  const accounting = can(access, "accounting.journals.create");
  const [{ data: accs }, { data: pcs }, { data: liq }] = await Promise.all([
    supabase.from("accounts").select("id, code, name, subtype, type").eq("is_header", false).eq("active", true).in("type", ["expense", "asset"]).order("code"),
    supabase.from("petty_cash_requests").select("id, number, amount, purpose, requested_by").eq("status", "approved").not("released_at", "is", null).order("released_at", { ascending: false }).limit(100),
    supabase.from("expense_receipts").select("petty_cash_request_id, amount").not("petty_cash_request_id", "is", null),
  ]);
  const all = (accs as { id: string; code: string; name: string; subtype: string; type: string }[] | null) ?? [];
  const expense = all.filter((a) => a.type === "expense");
  const cashBank = all.filter((a) => ["cash", "bank"].includes(a.subtype));
  const used = new Map<string, number>();
  for (const l of (liq as { petty_cash_request_id: string; amount: string }[] | null) ?? []) used.set(l.petty_cash_request_id, (used.get(l.petty_cash_request_id) ?? 0) + Number(l.amount));
  const open = ((pcs as { id: string; number: string; amount: string; purpose: string }[] | null) ?? []).map((p) => ({ ...p, left: Number(p.amount) - (used.get(p.id) ?? 0) })).filter((p) => p.left > 0);
  const amount = cleanAmount(txt(x.total));
  const guess = expense.find((a) => a.code === CATEGORY_ACCOUNT[txt(x.category)])?.id ?? expense[0]?.id;
  const pcGuess = open.find((p) => amount && Number(amount) <= p.left);
  return (
    <ActionForm action={scanRecordExpense} submitLabel="Save receipt" className="space-y-3">
      <input type="hidden" name="scan_id" value={scanId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Store / vendor" htmlFor="vendor_name"><Input id="vendor_name" name="vendor_name" defaultValue={txt(x.vendor_name)} required /></Field>
        <Field label="Vendor TIN" htmlFor="vendor_tin"><Input id="vendor_tin" name="vendor_tin" defaultValue={txt(x.vendor_tin)} /></Field>
        <Field label="OR / invoice no." htmlFor="receipt_no"><Input id="receipt_no" name="receipt_no" defaultValue={txt(x.receipt_no)} /></Field>
        <Field label="Date" htmlFor="receipt_date"><Input id="receipt_date" name="receipt_date" type="date" defaultValue={cleanDate(txt(x.date))} required /></Field>
        <Field label="Amount paid" htmlFor="amount"><Input id="amount" name="amount" defaultValue={amount} inputMode="decimal" required /></Field>
        <Field label="VAT included in the amount" htmlFor="vat_amount" hint="0 if the receipt shows no VAT (e.g. non-VAT store)."><Input id="vat_amount" name="vat_amount" defaultValue={cleanAmount(txt(x.vat_amount)) || "0"} inputMode="decimal" /></Field>
        <Field label="What it's for" htmlFor="expense_account_id">
          <Select id="expense_account_id" name="expense_account_id" defaultValue={guess} required>{expense.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</Select>
        </Field>
        <Field label="Description" htmlFor="description"><Input id="description" name="description" defaultValue={txt(x.description)} /></Field>
      </div>
      <Field label="Paid with" htmlFor="paid_by" hint="Petty cash: the receipt liquidates it (already in the books). Company account: a draft journal goes to the CEO.">
        <Select id="paid_by" name="paid_by" defaultValue={pcGuess ? `pc:${pcGuess.id}` : ""} required>
          <option value="" disabled>Choose…</option>
          {open.length > 0 && <optgroup label="Petty cash (released)">{open.map((p) => <option key={p.id} value={`pc:${p.id}`}>{p.number} · {p.purpose.slice(0, 40)} · {formatMoney(p.left.toFixed(2))} left</option>)}</optgroup>}
          {accounting && <optgroup label="Company cash / bank">{cashBank.map((a) => <option key={a.id} value={`acct:${a.id}`}>{a.code} {a.name}</option>)}</optgroup>}
        </Select>
      </Field>
      {!open.length && !accounting && <p className="text-sm text-amber-700">You have no released petty cash to liquidate. Ask accounting to record this receipt.</p>}
    </ActionForm>
  );
}

// ================================================================ customer payment slip
export async function PaymentForm({ scanId, x, sp }: Props) {
  const supabase = await createClient();
  const readOrder = txt(x.order_number).toUpperCase();
  const { data: byOrder } = readOrder ? await supabase.from("sales_orders").select("id, customer_id").ilike("number", `%${readOrder.replace(/[^A-Z0-9-]/g, "")}%`).limit(1).maybeSingle() : { data: null };
  const orderHit = byOrder as { id: string; customer_id: string } | null;
  const { data: custs } = await supabase.from("customers").select("id, code, name").order("name").limit(5000);
  const customers = (custs as { id: string; code: string; name: string }[] | null) ?? [];
  const nameHit = bestMatch({ name: txt(x.payer_name) }, customers, 0.55);
  const customerId = sp.customer && customers.some((c) => c.id === sp.customer) ? sp.customer : orderHit?.customer_id ?? nameHit.candidate?.id ?? null;
  const { data: orders } = customerId
    ? await supabase.from("sales_orders").select("id, number, total, paid_amount, status").eq("customer_id", customerId).not("status", "in", "(draft,cancelled,returned)").order("created_at", { ascending: false }).limit(50)
    : { data: [] };
  const open = ((orders as { id: string; number: string; total: string; paid_amount: string }[] | null) ?? []).filter((o) => Number(o.total) > Number(o.paid_amount));
  const method = txt(x.method);
  return (
    <>
      <form className="mb-3 flex flex-wrap items-end gap-2 rounded-lg bg-muted/50 p-2 text-sm">
        <label className="text-xs">Customer
          <Select name="customer" defaultValue={customerId ?? ""} className="h-9 w-72">
            <option value="" disabled>Choose…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </Select>
        </label>
        <button className="h-9 rounded-lg border bg-card px-3">Use this customer</button>
        <span className="text-xs text-muted-foreground">{orderHit ? "Found from the order number on the slip." : txt(x.payer_name) ? `Payer on the slip: “${txt(x.payer_name)}”${nameHit.candidate ? " (closest match, please check)" : ""}` : ""}</span>
      </form>
      {customerId ? (
        <ActionForm action={scanRecordPayment} submitLabel="Record payment (finance confirms)" className="space-y-3">
          <input type="hidden" name="scan_id" value={scanId} /><input type="hidden" name="customer_id" value={customerId} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="For order" htmlFor="order_id">
              <Select id="order_id" name="order_id" defaultValue={orderHit?.customer_id === customerId ? orderHit.id : open.length === 1 ? open[0].id : ""}>
                <option value="">On account (no specific order)</option>
                {open.map((o) => <option key={o.id} value={o.id}>{o.number} · balance {formatMoney((Number(o.total) - Number(o.paid_amount)).toFixed(2))}</option>)}
              </Select>
              {readOrder && <span className="text-xs text-muted-foreground">Order on the slip: “{readOrder}”</span>}
            </Field>
            <Field label="Method" htmlFor="method">
              <Select id="method" name="method" defaultValue={["bank_transfer", "gcash", "maya", "cheque", "cash"].includes(method) ? method : "bank_transfer"}>
                <option value="bank_transfer">Bank transfer / deposit</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Amount" htmlFor="amount"><Input id="amount" name="amount" defaultValue={cleanAmount(txt(x.amount))} inputMode="decimal" required /></Field>
            <Field label="Date paid" htmlFor="paid_on"><Input id="paid_on" name="paid_on" type="date" defaultValue={cleanDate(txt(x.date))} /></Field>
            <Field label="Reference / transaction no." htmlFor="reference"><Input id="reference" name="reference" defaultValue={txt(x.reference)} /></Field>
            <Field label="Notes" htmlFor="notes"><Input id="notes" name="notes" defaultValue={txt(x.bank)} /></Field>
          </div>
          <p className="text-xs text-muted-foreground">The payment is recorded as pending. Finance checks it against the bank or e-wallet before confirming. Whoever records it can&apos;t confirm it.</p>
        </ActionForm>
      ) : (
        <p className="text-sm text-muted-foreground">Choose the customer first.</p>
      )}
    </>
  );
}
