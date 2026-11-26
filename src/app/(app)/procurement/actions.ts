"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const uuid = z.string().uuid();
const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const text = (max: number) => z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(max));
const price = z.preprocess((v) => String(v ?? "").replace(/[₱,\s]/g, ""), z.string().regex(/^\d+(\.\d{1,4})?$/, "Enter a valid price."));
const qty = z.coerce.number().positive("Enter a quantity.");

function friendly(msg: string) {
  if (/row-level security/.test(msg)) return "You don't have permission to do that here.";
  if (/duplicate key/.test(msg)) return "That already exists (e.g. the same supplier invoice number).";
  if (/violates (check|foreign key|not-null)/.test(msg)) {
    console.error("procurement", msg);
    return "Some details aren't valid. Please check the form.";
  }
  return msg;
}
const fail = (e: { message: string }) => ({ error: friendly(e.message) });

async function productBySku(input: string) {
  const code = input.split(" — ")[0].trim().toUpperCase();
  if (!code) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, base_unit").eq("sku", code).maybeSingle();
  return data as { id: string; base_unit: string } | null;
}

async function rpc(fn: string, args: Record<string, unknown>, paths: string[], ok: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return fail(error);
  for (const p of paths) revalidatePath(p);
  return { message: ok };
}

// ================================================================ suppliers
const SupplierSchema = z.object({
  name: z.string().trim().min(2, "Enter the supplier's name.").max(160),
  tin: text(30),
  vat_registered: z.preprocess((x) => x === "on", z.boolean()),
  payment_terms_days: z.coerce.number().int().min(0).max(180),
  address: text(400),
  mobile: text(30),
  email: z.preprocess((v) => (v == null ? "" : v), z.union([z.literal(""), z.string().trim().email("Check the email address.")])),
  category: text(80),
  notes: text(1000),
});

export async function createSupplier(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.suppliers.manage");
  const v = SupplierSchema.safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").insert({ ...v.data, code: "" }).select("id").single();
  if (error) return fail(error);
  redirect(`/procurement/suppliers/${(data as { id: string }).id}`);
}

export async function updateSupplier(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.suppliers.manage");
  const id = uuid.parse(form.get("id"));
  const v = SupplierSchema.extend({ status: z.enum(["pending", "approved", "blocked"]), status_note: text(300) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").update(v.data).eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/procurement/suppliers/${id}`);
  return { message: "Saved." };
}

export async function addSupplierContact(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.suppliers.manage");
  const v = z.object({ supplier_id: uuid, name: z.string().trim().min(2, "Enter a name.").max(120), role: text(80), mobile: text(30), email: text(120) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("supplier_contacts").insert(v.data);
  if (error) return fail(error);
  revalidatePath(`/procurement/suppliers/${v.data.supplier_id}`);
  return { message: "Contact added." };
}

export async function addBankAccount(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.view_bank");
  const v = z.object({ supplier_id: uuid, bank: z.string().trim().min(2, "Enter the bank.").max(80), account_name: z.string().trim().min(2).max(160), account_no: z.string().trim().min(4, "Enter the account number.").max(40) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("supplier_bank_accounts").insert(v.data);
  if (error) return fail(error);
  revalidatePath(`/procurement/suppliers/${v.data.supplier_id}`);
  return { message: "Bank account saved." };
}

export async function setSupplierPrice(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.suppliers.manage");
  const v = z.object({ supplier_id: uuid, product: z.string().min(1, "Choose a product."), unit_code: z.string().min(1), price, moq: z.preprocess((x) => (x === "" || x == null ? 1 : x), qty), lead_time_days: z.preprocess((x) => (x === "" || x == null ? null : x), z.coerce.number().int().min(0).max(365).nullable()), supplier_code: text(60) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const p = await productBySku(v.data.product);
  if (!p) return { error: "Product not found. Pick one from the list." };
  const supabase = await createClient();
  const { product: _p, ...rest } = v.data;
  void _p;
  const { error } = await supabase.from("supplier_products").upsert({ ...rest, product_id: p.id });
  if (error) return fail(error);
  revalidatePath(`/procurement/suppliers/${v.data.supplier_id}`);
  return { message: "Price saved." };
}

// ================================================================ requests
export async function createRequest(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.request");
  const v = z.object({ location_id: uuid, needed_by: optDate, reason: text(500) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose where the items are needed." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("purchase_requests").insert({ ...v.data, number: "" }).select("id").single();
  if (error) return fail(error);
  redirect(`/procurement/requests/${(data as { id: string }).id}`);
}

export async function addRequestLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.request");
  const v = z.object({ request_id: uuid, product: z.string().min(1, "Choose an item."), unit_code: text(12), qty, notes: text(300) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const p = await productBySku(v.data.product);
  if (!p) return { error: "Item not found. Pick one from the list." };
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_request_lines").insert({ request_id: v.data.request_id, product_id: p.id, unit_code: v.data.unit_code || p.base_unit, qty: v.data.qty, notes: v.data.notes });
  if (error) return fail(error);
  revalidatePath(`/procurement/requests/${v.data.request_id}`);
  return {};
}

export async function removeRequestLine(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_request_lines").delete().eq("id", uuid.parse(form.get("id")));
  if (error) return fail(error);
  revalidatePath(`/procurement/requests/${uuid.parse(form.get("request_id"))}`);
  return {};
}

export async function submitRequest(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.request");
  const id = uuid.parse(form.get("id"));
  return rpc("submit_purchase_request", { p_id: id }, [`/procurement/requests/${id}`, "/procurement/requests"], "Sent to the buyer.");
}

export async function declineRequest(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.po.create");
  const id = uuid.parse(form.get("id"));
  return rpc("decline_purchase_request", { p_id: id, p_reason: String(form.get("reason") ?? "") }, [`/procurement/requests/${id}`, "/procurement/requests"], "Request declined.");
}

export async function cancelDraftRequest(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.request");
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_requests").update({ status: "cancelled" }).eq("id", uuid.parse(form.get("id")));
  if (error) return fail(error);
  redirect("/procurement/requests");
}

/** Reorder suggestions (Inventory → Reorder) → one purchase request with every item below its minimum. */
export async function requestFromReorder(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.request");
  const location = uuid.parse(form.get("location_id"));
  const supabase = await createClient();
  const { data: sug } = await supabase.from("reorder_suggestions").select("product_id, suggested_qty, products(base_unit)").eq("location_id", location);
  const rows = ((sug as unknown as { product_id: string; suggested_qty: string; products: { base_unit: string } }[] | null) ?? []).filter((s) => Number(s.suggested_qty) > 0);
  if (rows.length === 0) return { error: "Nothing is below its reorder level here." };
  const { data: req, error } = await supabase.from("purchase_requests").insert({ number: "", location_id: location, reason: "Reorder suggestions" }).select("id").single();
  if (error) return fail(error);
  const rid = (req as { id: string }).id;
  const { error: e2 } = await supabase.from("purchase_request_lines").insert(rows.map((s) => ({ request_id: rid, product_id: s.product_id, unit_code: s.products.base_unit, qty: Number(s.suggested_qty) })));
  if (e2) return fail(e2);
  redirect(`/procurement/requests/${rid}`);
}

export async function orderRequestLines(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.po.create");
  const supplier = uuid.safeParse(form.get("supplier_id"));
  const location = uuid.safeParse(form.get("location_id"));
  const lines = form.getAll("line").map(String).filter((x) => uuid.safeParse(x).success);
  if (!supplier.success) return { error: "Choose a supplier." };
  if (!location.success) return { error: "Choose the delivery location." };
  if (lines.length === 0) return { error: "Tick at least one item." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("po_from_requests", { p_supplier: supplier.data, p_location: location.data, p_request_lines: lines });
  if (error) return fail(error);
  redirect(`/procurement/orders/${data as string}`);
}

// ================================================================ purchase orders
export async function createPo(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.po.create");
  const v = z.object({ supplier_id: uuid, location_id: uuid, expected_date: optDate, vat_inclusive: z.preprocess((x) => x === "on", z.boolean()), notes: text(1000) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose a supplier and delivery location." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("purchase_orders").insert({ ...v.data, number: "" }).select("id").single();
  if (error) return fail(error);
  redirect(`/procurement/orders/${(data as { id: string }).id}`);
}

export async function updatePoHeader(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.po.create");
  const id = uuid.parse(form.get("id"));
  const v = z.object({ location_id: uuid, expected_date: optDate, notes: text(1000) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Check the delivery location and date." };
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_orders").update(v.data).eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/procurement/orders/${id}`);
  return { message: "Saved." };
}

export async function addPoLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.po.create");
  const v = z.object({ po_id: uuid, product: z.string().min(1, "Choose an item."), unit_code: text(12), qty, unit_price: z.preprocess((x) => (x === "" || x == null ? null : x), price.nullable()), discount_pct: z.preprocess((x) => (x === "" || x == null ? 0 : x), z.coerce.number().min(0).max(100)) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const p = await productBySku(v.data.product);
  if (!p) return { error: "Item not found. Pick one from the list." };
  const supabase = await createClient();
  const unit = v.data.unit_code || p.base_unit;
  let unitPrice = v.data.unit_price;
  if (unitPrice == null) {
    const { data: po } = await supabase.from("purchase_orders").select("supplier_id").eq("id", v.data.po_id).single();
    const { data: sp } = await supabase.from("supplier_products").select("price").eq("supplier_id", (po as { supplier_id: string }).supplier_id).eq("product_id", p.id).eq("unit_code", unit).maybeSingle();
    if (!sp) return { error: "No supplier price for this item and unit yet. Enter the price." };
    unitPrice = String((sp as { price: string }).price);
  }
  const { error } = await supabase.from("purchase_order_lines").insert({ po_id: v.data.po_id, product_id: p.id, unit_code: unit, qty: v.data.qty, unit_price: unitPrice, discount_pct: v.data.discount_pct });
  if (error) return fail(error);
  revalidatePath(`/procurement/orders/${v.data.po_id}`);
  return {};
}

export async function removePoLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.po.create");
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_order_lines").delete().eq("id", uuid.parse(form.get("id")));
  if (error) return fail(error);
  revalidatePath(`/procurement/orders/${uuid.parse(form.get("po_id"))}`);
  return {};
}

export async function poAction(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.po.create");
  const id = uuid.parse(form.get("id"));
  const reason = String(form.get("reason") ?? "");
  const paths = [`/procurement/orders/${id}`, "/procurement/orders", "/procurement"];
  switch (String(form.get("step"))) {
    case "submit":
      return rpc("submit_purchase_order", { p_po: id }, paths, "Sent to the CEO for approval.");
    case "sent":
      return rpc("mark_po_sent", { p_po: id }, paths, "Marked as sent to the supplier.");
    case "revise":
      return rpc("revise_purchase_order", { p_po: id }, paths, "PO is back in draft. Change it and submit again.");
    case "cancel":
      return rpc("cancel_purchase_order", { p_po: id, p_reason: reason }, paths, "PO cancelled.");
    case "close":
      return rpc("close_purchase_order", { p_po: id, p_reason: reason }, paths, "PO closed.");
    default:
      return { error: "Unknown step." };
  }
}

export async function deleteDraftPo(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.po.create");
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_orders").delete().eq("id", uuid.parse(form.get("id"))).eq("status", "draft");
  if (error) return fail(error);
  redirect("/procurement/orders");
}

/** Receive against a PO: one qty / lot / expiry per line, posted through the stock ledger. */
export async function receivePo(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.receive");
  const id = uuid.parse(form.get("id"));
  const lineIds = form.getAll("line_id").map(String);
  const lines = lineIds
    .map((lid) => ({
      po_line_id: lid,
      qty: String(form.get(`qty:${lid}`) ?? "").trim(),
      lot_no: String(form.get(`lot:${lid}`) ?? "").trim().slice(0, 60),
      expiry_date: String(form.get(`exp:${lid}`) ?? "").trim(),
      mfg_date: String(form.get(`mfg:${lid}`) ?? "").trim(),
    }))
    .filter((l) => l.qty !== "" && Number(l.qty) > 0);
  if (lines.length === 0) return { error: "Enter the quantity received for at least one item." };
  if (lines.some((l) => !Number.isFinite(Number(l.qty)))) return { error: "Quantities must be numbers." };
  return rpc("receive_purchase_order", { p_po: id, p_lines: lines, p_reference: String(form.get("reference") ?? "").slice(0, 80) }, [`/procurement/orders/${id}`, "/inventory/stock", "/inventory/batches"], "Received. New lots wait in QA quarantine unless the item skips QA.");
}

// ================================================================ supplier invoices
export async function createSupplierInvoice(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.invoices.manage");
  const v = z.object({ po_id: uuid, invoice_no: z.string().trim().min(1, "Enter the supplier's invoice number.").max(60), invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the invoice date."), notes: text(500) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { data: po } = await supabase.from("purchase_orders").select("supplier_id").eq("id", v.data.po_id).single();
  if (!po) return { error: "PO not found." };
  const { data, error } = await supabase.from("supplier_invoices").insert({ ...v.data, number: "", supplier_id: (po as { supplier_id: string }).supplier_id }).select("id").single();
  if (error) return fail(error);
  const iid = (data as { id: string }).id;
  // prefill with what was received and not yet billed, at the PO price
  const { data: pl } = await supabase.from("purchase_order_lines").select("id, received_qty, invoiced_qty, unit_price").eq("po_id", v.data.po_id);
  const pre = ((pl as { id: string; received_qty: string; invoiced_qty: string; unit_price: string }[] | null) ?? [])
    .map((l) => ({ invoice_id: iid, po_line_id: l.id, qty: Number(l.received_qty) - Number(l.invoiced_qty), unit_price: l.unit_price }))
    .filter((l) => l.qty > 0);
  if (pre.length) await supabase.from("supplier_invoice_lines").insert(pre);
  redirect(`/procurement/invoices/${iid}`);
}

export async function updateInvoiceLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.invoices.manage");
  const v = z.object({ id: uuid, invoice_id: uuid, qty, unit_price: price }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("supplier_invoice_lines").update({ qty: v.data.qty, unit_price: v.data.unit_price }).eq("id", v.data.id);
  if (error) return fail(error);
  revalidatePath(`/procurement/invoices/${v.data.invoice_id}`);
  return { message: "Line updated." };
}

export async function addInvoiceExtraLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.invoices.manage");
  const v = z.object({ invoice_id: uuid, description: z.string().trim().min(2, "Describe the charge.").max(200), qty, unit_price: price }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("supplier_invoice_lines").insert(v.data);
  if (error) return fail(error);
  revalidatePath(`/procurement/invoices/${v.data.invoice_id}`);
  return {};
}

export async function removeInvoiceLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.invoices.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("supplier_invoice_lines").delete().eq("id", uuid.parse(form.get("id")));
  if (error) return fail(error);
  revalidatePath(`/procurement/invoices/${uuid.parse(form.get("invoice_id"))}`);
  return {};
}

export async function invoiceAction(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("procurement.invoices.manage");
  const id = uuid.parse(form.get("id"));
  const paths = [`/procurement/invoices/${id}`, "/procurement/invoices", "/procurement"];
  switch (String(form.get("step"))) {
    case "match": {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("match_supplier_invoice", { p_id: id });
      if (error) return fail(error);
      paths.forEach((p) => revalidatePath(p));
      return data === "matched" ? { message: "Matched: ready to pay." } : { error: "Doesn't match the PO and receipts. See the notes below; correct the lines or send the variance for approval." };
    }
    case "variance":
      return rpc("submit_invoice_variance", { p_id: id }, paths, "Variance sent to the CEO.");
    case "void":
      return rpc("void_supplier_invoice", { p_id: id, p_reason: String(form.get("reason") ?? "") }, paths, "Invoice voided.");
    default:
      return { error: "Unknown step." };
  }
}

