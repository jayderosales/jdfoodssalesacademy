"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getAccess, requirePermission, requireUser } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { KIND_INFO, SCAN_KINDS, type ScanKind } from "@/lib/scan/kinds";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };
type Supa = Awaited<ReturnType<typeof createClient>>;

const uuid = z.string().uuid();
const date = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const str = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);

function friendly(msg: string) {
  if (/row-level security/.test(msg)) return "You don't have permission to do that.";
  if (/duplicate key/.test(msg)) return "That document was already entered.";
  if (/violates (check|foreign key|not-null)/.test(msg)) {
    console.error("scan", msg);
    return "Some details aren't valid. Please check the form.";
  }
  return msg;
}

/** Rows posted as l0_field, l1_field…; `rows` holds the count. Blank rows are skipped by the caller. */
function rows(form: FormData, fields: string[]) {
  const n = Math.min(Number(form.get("rows") ?? 0) || 0, 200);
  return Array.from({ length: n }, (_, i) => Object.fromEntries(fields.map((f) => [f, str(form.get(`l${i}_${f}`), 200)])) as Record<string, string>);
}

/** "P1-1L — Sweet BBQ…" / "P1-1L" / barcode → product. */
async function resolveProduct(supabase: Supa, input: string) {
  const code = input.split(" — ")[0].trim();
  if (!code) return null;
  const { data } = await supabase.from("products").select("id, sku, base_unit").eq("sku", code.toUpperCase()).maybeSingle();
  if (data) return data as { id: string; sku: string; base_unit: string };
  const { data: bc } = await supabase.from("product_barcodes").select("products(id, sku, base_unit)").eq("barcode", code).maybeSingle();
  return (bc as unknown as { products: { id: string; sku: string; base_unit: string } } | null)?.products ?? null;
}

async function loadScan(supabase: Supa, id: string, kind: ScanKind) {
  const { data } = await supabase.from("document_scans").select("id, kind, status").eq("id", id).maybeSingle();
  const s = data as { id: string; kind: ScanKind; status: string } | null;
  if (!s || s.kind !== kind) return { error: "Scan not found." } as const;
  if (s.status === "done") return { error: "This scan was already saved." } as const;
  if (s.status === "discarded") return { error: "This scan was discarded." } as const;
  return { scan: s } as const;
}

async function finish(supabase: Supa, id: string, table: string, recordId: string) {
  const { error } = await supabase.from("document_scans").update({ status: "done", record_table: table, record_id: recordId }).eq("id", id);
  if (error) console.error("scan finish", error.message);
  revalidatePath("/scan");
}

// ================================================================ start / discard
export async function startScan(kind: string, filename: string): Promise<{ id: string } | { error: string }> {
  await requireUser();
  if (!SCAN_KINDS.includes(kind as ScanKind)) return { error: "Choose what you're scanning." };
  const perm = KIND_INFO[kind as ScanKind].perm;
  if (perm && !can(await getAccess(), perm)) return { error: "You don't have permission to enter this kind of document." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("document_scans").insert({ kind, filename: filename.slice(0, 200) }).select("id").single();
  if (error) return { error: friendly(error.message) };
  return { id: (data as { id: string }).id };
}

export async function discardScan(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("document_scans").update({ status: "discarded" }).eq("id", uuid.parse(form.get("id")));
  if (error) return { error: friendly(error.message) };
  redirect("/scan");
}

// ================================================================ inventory: supplier delivery slip
/** Against a PO: same as the PO page's Receive section, prefilled from the slip. Lots go to QA quarantine. */
export async function scanReceivePo(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.receive");
  const id = uuid.parse(form.get("scan_id"));
  const po = uuid.parse(form.get("po_id"));
  const supabase = await createClient();
  const loaded = await loadScan(supabase, id, "delivery_receipt");
  if ("error" in loaded) return { error: loaded.error };
  const lines = rows(form, ["po_line_id", "qty", "lot_no", "expiry_date", "mfg_date"]).filter((l) => l.po_line_id && l.qty && Number(l.qty) > 0);
  if (!lines.length) return { error: "Enter the quantity received for at least one item." };
  if (lines.some((l) => !Number.isFinite(Number(l.qty)))) return { error: "Quantities must be numbers." };
  const { data, error } = await supabase.rpc("receive_purchase_order", { p_po: po, p_lines: lines, p_reference: str(form.get("reference"), 80) });
  if (error) return { error: friendly(error.message) };
  await finish(supabase, id, "stock_receipts", data as string);
  revalidatePath(`/procurement/orders/${po}`);
  redirect(`/inventory/receipts/${data as string}`);
}

/** No PO: a draft stock receipt to check and post on the receipt page. */
export async function scanCreateReceipt(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.receive");
  const id = uuid.parse(form.get("scan_id"));
  const location = uuid.safeParse(form.get("location_id"));
  if (!location.success) return { error: "Choose where the goods were received." };
  const supabase = await createClient();
  const loaded = await loadScan(supabase, id, "delivery_receipt");
  if ("error" in loaded) return { error: loaded.error };
  const lines = rows(form, ["product", "qty", "unit_code", "lot_no", "expiry_date", "mfg_date"]).filter((l) => l.product || l.qty);
  if (!lines.length) return { error: "Add at least one item." };
  const resolved = [];
  for (const [i, l] of lines.entries()) {
    const p = await resolveProduct(supabase, l.product);
    if (!p) return { error: `Line ${i + 1}: choose the product from the list.` };
    if (!(Number(l.qty) > 0)) return { error: `Line ${i + 1}: enter the quantity.` };
    resolved.push({ product_id: p.id, unit_code: /^[a-z]{1,12}$/.test(l.unit_code) ? l.unit_code : p.base_unit, qty: Number(l.qty), lot_no: l.lot_no.slice(0, 60), expiry_date: date(l.expiry_date), mfg_date: date(l.mfg_date) });
  }
  const { data, error } = await supabase
    .from("stock_receipts")
    .insert({ number: "new", location_id: location.data, supplier_name: str(form.get("supplier_name"), 160), reference: str(form.get("reference"), 80), notes: "Entered from a scanned delivery slip" })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  const rid = (data as { id: string }).id;
  const { error: lErr } = await supabase.from("stock_receipt_lines").insert(resolved.map((l) => ({ ...l, receipt_id: rid })));
  if (lErr) return { error: friendly(lErr.message) };
  await finish(supabase, id, "stock_receipts", rid);
  redirect(`/inventory/receipts/${rid}`);
}

// ================================================================ inventory: goods sent between sites
/** A draft transfer. Each line takes released stock at the sending site, earliest expiry first (the slip's lot if it's there). */
export async function scanCreateTransfer(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.transfer");
  const id = uuid.parse(form.get("scan_id"));
  const from = uuid.safeParse(form.get("from_location_id"));
  const to = uuid.safeParse(form.get("to_location_id"));
  if (!from.success || !to.success) return { error: "Choose both locations." };
  if (from.data === to.data) return { error: "Choose two different locations." };
  const supabase = await createClient();
  const loaded = await loadScan(supabase, id, "stock_transfer");
  if ("error" in loaded) return { error: loaded.error };
  const lines = rows(form, ["product", "qty", "lot_no"]).filter((l) => l.product || l.qty);
  if (!lines.length) return { error: "Add at least one item." };
  const planned: { product_id: string; batch_id: string; from_bin_id: string; qty: number }[] = [];
  const short: string[] = [];
  for (const [i, l] of lines.entries()) {
    const p = await resolveProduct(supabase, l.product);
    if (!p) return { error: `Line ${i + 1}: choose the product from the list.` };
    let need = Number(l.qty);
    if (!(need > 0)) return { error: `Line ${i + 1}: enter the quantity (in ${p.base_unit}).` };
    const { data: bal } = await supabase
      .from("stock_balances")
      .select("bin_id, batch_id, on_hand, reserved, batches!inner(lot_no, expiry_date, qa_status)")
      .eq("product_id", p.id)
      .eq("location_id", from.data)
      .eq("batches.qa_status", "released");
    const avail = ((bal as unknown as { bin_id: string; batch_id: string; on_hand: string; reserved: string; batches: { lot_no: string; expiry_date: string | null } }[] | null) ?? [])
      .map((b) => ({ ...b, free: Number(b.on_hand) - Number(b.reserved) }))
      .filter((b) => b.free > 0)
      .sort((a, b) => Number(b.batches.lot_no === l.lot_no) - Number(a.batches.lot_no === l.lot_no) || (a.batches.expiry_date ?? "9999").localeCompare(b.batches.expiry_date ?? "9999"));
    for (const b of avail) {
      if (need <= 0) break;
      const take = Math.min(need, b.free);
      planned.push({ product_id: p.id, batch_id: b.batch_id, from_bin_id: b.bin_id, qty: take });
      need -= take;
    }
    if (need > 0) short.push(`${p.sku}: ${need} ${p.base_unit} short`);
  }
  if (!planned.length) return { error: `There's no released stock at the sending site for these items (${short.join("; ")}).` };
  const notes = ["Entered from a scanned transmittal slip", str(form.get("reference"), 80) && `ref ${str(form.get("reference"), 80)}`, short.length && `Not enough stock: ${short.join("; ")}`].filter(Boolean).join(". ");
  const { data, error } = await supabase.from("stock_transfers").insert({ number: "new", from_location_id: from.data, to_location_id: to.data, notes: notes.slice(0, 500) }).select("id").single();
  if (error) return { error: friendly(error.message) };
  const tid = (data as { id: string }).id;
  const { error: lErr } = await supabase.from("stock_transfer_lines").insert(planned.map((p) => ({ ...p, transfer_id: tid })));
  if (lErr) return { error: friendly(lErr.message) };
  await finish(supabase, id, "stock_transfers", tid);
  redirect(`/inventory/transfers/${tid}`);
}

// ================================================================ accounting: documents sent to accounting
export async function scanCreateTransmittal(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = form.get("scan_id") ? uuid.parse(form.get("scan_id")) : null;
  const fromName = str(form.get("from_name"), 120);
  if (fromName.length < 2) return { error: "Who is sending the documents?" };
  const lines = rows(form, ["doc_type", "doc_no", "party", "doc_date", "amount"]).filter((l) => l.doc_type || l.doc_no || l.party);
  if (!lines.length) return { error: "List at least one document." };
  for (const [i, l] of lines.entries()) if (l.amount && parseMoney(l.amount) == null) return { error: `Line ${i + 1}: check the amount.` };
  const supabase = await createClient();
  if (id) {
    const loaded = await loadScan(supabase, id, "doc_transmittal");
    if ("error" in loaded) return { error: loaded.error };
  }
  const { data, error } = await supabase
    .from("document_transmittals")
    .insert({ number: "", from_name: fromName, to_name: str(form.get("to_name"), 120) || "Accounting", sent_on: date(form.get("sent_on")) ?? undefined, notes: str(form.get("notes"), 500), scan_id: id })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  const tid = (data as { id: string }).id;
  const { error: lErr } = await supabase.from("document_transmittal_lines").insert(
    lines.map((l, i) => ({ transmittal_id: tid, line_no: i + 1, doc_type: l.doc_type.slice(0, 60), doc_no: l.doc_no.slice(0, 60), party: l.party.slice(0, 160), doc_date: date(l.doc_date), amount: l.amount ? parseMoney(l.amount) : null })),
  );
  if (lErr) return { error: friendly(lErr.message) };
  if (id) await finish(supabase, id, "document_transmittals", tid);
  redirect(`/accounting/transmittals/${tid}`);
}

export async function receiveTransmittal(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("transmittals.receive");
  const id = uuid.parse(form.get("id"));
  const lines = form.getAll("line").map(String).filter((x) => uuid.safeParse(x).success);
  if (!lines.length) return { error: "Tick the documents you received." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_transmittal", { p_id: id, p_lines: lines, p_note: str(form.get("note"), 300) });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/accounting/transmittals/${id}`);
  revalidatePath("/accounting/transmittals");
  return { message: data === "received" ? "All documents received." : `${lines.length} document(s) received.` };
}

// ================================================================ accounting: supplier bill
export async function scanCreateBill(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.invoices.manage");
  const id = uuid.parse(form.get("scan_id"));
  const supplier = uuid.safeParse(form.get("supplier_id"));
  if (!supplier.success) return { error: "Choose the supplier." };
  const invoiceNo = str(form.get("invoice_no"), 60);
  if (!invoiceNo) return { error: "Enter the supplier's invoice number." };
  const invoiceDate = date(form.get("invoice_date"));
  if (!invoiceDate) return { error: "Enter the invoice date." };
  const po = uuid.safeParse(form.get("po_id"));
  const supabase = await createClient();
  const loaded = await loadScan(supabase, id, "supplier_bill");
  if ("error" in loaded) return { error: loaded.error };
  const lines = po.success ? [] : rows(form, ["description", "qty", "unit_price", "expense_account_id"]).filter((l) => l.description || l.unit_price);
  if (!po.success) {
    if (!lines.length) return { error: "Add the bill's lines (or choose its PO)." };
    for (const [i, l] of lines.entries()) {
      if (l.description.length < 2) return { error: `Line ${i + 1}: describe the item.` };
      if (!(Number(l.qty) > 0) || parseMoney(l.unit_price) == null) return { error: `Line ${i + 1}: check the quantity and price.` };
    }
  }
  const { data, error } = await supabase
    .from("supplier_invoices")
    .insert({ number: "", supplier_id: supplier.data, po_id: po.success ? po.data : null, invoice_no: invoiceNo, invoice_date: invoiceDate, due_date: date(form.get("due_date")), notes: "Entered from a scanned bill" })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  const iid = (data as { id: string }).id;
  if (po.success) {
    // like a manual PO invoice: prefill with what was received and not yet billed; check against the photo on the next page
    const { data: pl } = await supabase.from("purchase_order_lines").select("id, received_qty, invoiced_qty, unit_price").eq("po_id", po.data);
    const pre = ((pl as { id: string; received_qty: string; invoiced_qty: string; unit_price: string }[] | null) ?? [])
      .map((l) => ({ invoice_id: iid, po_line_id: l.id, qty: Number(l.received_qty) - Number(l.invoiced_qty), unit_price: l.unit_price }))
      .filter((l) => l.qty > 0);
    if (pre.length) await supabase.from("supplier_invoice_lines").insert(pre);
  } else {
    const { error: lErr } = await supabase.from("supplier_invoice_lines").insert(
      lines.map((l) => ({ invoice_id: iid, description: l.description, qty: Number(l.qty), unit_price: parseMoney(l.unit_price), expense_account_id: uuid.safeParse(l.expense_account_id).success ? l.expense_account_id : null })),
    );
    if (lErr) return { error: friendly(lErr.message) };
  }
  await finish(supabase, id, "supplier_invoices", iid);
  redirect(`/procurement/invoices/${iid}`);
}

// ================================================================ accounting: expense receipt
export async function scanRecordExpense(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = form.get("scan_id") ? uuid.parse(form.get("scan_id")) : null;
  const amount = parseMoney(str(form.get("amount")));
  const vat = parseMoney(str(form.get("vat_amount")) || "0");
  if (!amount || Number(amount) <= 0) return { error: "Enter the receipt amount." };
  if (vat == null) return { error: "Check the VAT amount." };
  const d = date(form.get("receipt_date"));
  if (!d) return { error: "Enter the receipt date." };
  const account = uuid.safeParse(form.get("expense_account_id"));
  if (!account.success) return { error: "Choose what the expense is for." };
  const [kind, target] = str(form.get("paid_by")).split(":");
  if (!uuid.safeParse(target).success || !["pc", "acct"].includes(kind)) return { error: "Choose the petty cash it liquidates, or the account it was paid from." };
  const supabase = await createClient();
  if (id) {
    const loaded = await loadScan(supabase, id, "expense_receipt");
    if ("error" in loaded) return { error: loaded.error };
  }
  const { data, error } = await supabase.rpc("record_expense_receipt", {
    p_date: d, p_vendor: str(form.get("vendor_name"), 160), p_tin: str(form.get("vendor_tin"), 30), p_receipt_no: str(form.get("receipt_no"), 60),
    p_amount: amount, p_vat: vat, p_expense_account: account.data, p_description: str(form.get("description"), 300),
    p_petty_cash: kind === "pc" ? target : null, p_paid_from: kind === "acct" ? target : null, p_scan: id,
  });
  if (error) return { error: friendly(error.message) };
  if (id) await finish(supabase, id, "expense_receipts", data as string);
  if (kind === "pc") redirect(`/requests/petty-cash/${target}`);
  const { data: r } = await supabase.from("expense_receipts").select("journal_entry_id").eq("id", data as string).single();
  redirect(`/accounting/journals/${(r as { journal_entry_id: string }).journal_entry_id}`);
}

// ================================================================ accounting: customer payment slip
export async function scanRecordPayment(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.payments.record");
  const id = uuid.parse(form.get("scan_id"));
  const customer = uuid.safeParse(form.get("customer_id"));
  if (!customer.success) return { error: "Choose the customer." };
  const order = uuid.safeParse(form.get("order_id"));
  const amount = parseMoney(str(form.get("amount")));
  if (!amount || Number(amount) <= 0) return { error: "Enter the amount paid." };
  const method = z.enum(["cash", "bank_transfer", "gcash", "maya", "cheque", "card", "other"]).safeParse(form.get("method"));
  if (!method.success) return { error: "Choose how they paid." };
  const supabase = await createClient();
  const loaded = await loadScan(supabase, id, "payment_slip");
  if ("error" in loaded) return { error: loaded.error };
  const { data, error } = await supabase.rpc("record_payment", {
    p_customer: customer.data, p_order: order.success ? order.data : null, p_method: method.data, p_amount: amount,
    p_reference: str(form.get("reference"), 80), p_paid_on: date(form.get("paid_on")), p_notes: (str(form.get("notes"), 400) + " (from a scanned slip)").trim(),
  });
  if (error) return { error: friendly(error.message) };
  await finish(supabase, id, "payments", data as string);
  revalidatePath("/sales/payments");
  redirect("/sales/payments");
}
