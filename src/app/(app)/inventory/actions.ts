"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const uuid = z.string().uuid();
const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), uuid.nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const qty = z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, "Enter a quantity.");

function friendly(msg: string) {
  if (/row-level security/.test(msg)) return "You don't have permission to do that here.";
  return msg;
}

/** "P1-1L — Premium Sweet…" or "P1-1L" or a barcode → product id. */
async function resolveProduct(supabase: Awaited<ReturnType<typeof createClient>>, input: string): Promise<{ id: string; base_unit: string } | null> {
  const code = input.split(" — ")[0].trim();
  if (!code) return null;
  const { data } = await supabase.from("products").select("id, base_unit").eq("sku", code.toUpperCase()).maybeSingle();
  if (data) return data as { id: string; base_unit: string };
  const { data: bc } = await supabase.from("product_barcodes").select("product_id, products(base_unit)").eq("barcode", code).maybeSingle();
  if (bc) return { id: (bc as { product_id: string }).product_id, base_unit: (bc as unknown as { products: { base_unit: string } }).products.base_unit };
  return null;
}

// ---------------------------------------------------------------- QA
export async function setBatchStatus(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.qa.release");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_batch_status", { p_batch: uuid.parse(form.get("id")), p_status: String(form.get("status")), p_note: String(form.get("note") ?? "") });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/inventory/batches");
  return { message: "Updated." };
}

// ---------------------------------------------------------------- receipts
export async function createReceipt(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.receive");
  const v = z
    .object({ location_id: uuid, supplier_name: z.string().trim().max(160).default(""), reference: z.string().trim().max(80).default(""), notes: z.string().trim().max(500).default("") })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose a location." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("stock_receipts").insert({ ...v.data, number: "new" }).select("id").single();
  if (error) return { error: friendly(error.message) };
  redirect(`/inventory/receipts/${(data as { id: string }).id}`);
}

export async function addReceiptLine(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const v = z
    .object({
      receipt_id: uuid,
      product: z.string().min(1, "Choose a product."),
      unit_code: z.string().regex(/^[a-z]{1,12}$/).optional(),
      qty: z.coerce.number().positive("Enter a quantity greater than 0."),
      unit_cost: z.preprocess((x) => (x === "" || x == null ? null : Number(String(x).replace(/[₱,\s]/g, ""))), z.number().min(0).nullable()),
      lot_no: z.string().trim().max(60).default(""),
      mfg_date: optionalDate,
      expiry_date: optionalDate,
      bin_id: optionalUuid,
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const p = await resolveProduct(supabase, v.data.product);
  if (!p) return { error: "Product not found. Pick it from the list or scan its barcode." };
  const { product: _p, unit_code, ...rest } = v.data;
  const { error } = await supabase.from("stock_receipt_lines").insert({ ...rest, product_id: p.id, unit_code: unit_code || p.base_unit });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/receipts/${v.data.receipt_id}`);
  return { message: "Line added." };
}

export async function removeReceiptLine(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("stock_receipt_lines").delete().eq("id", uuid.parse(form.get("line_id")));
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/receipts/${form.get("receipt_id")}`);
  return { message: "Removed." };
}

export async function postReceipt(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.receive");
  const id = uuid.parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_receipt", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/receipts/${id}`);
  return { message: "Posted. Stock is in; batches that need QA are in quarantine until QA releases them." };
}

// ---------------------------------------------------------------- transfers
export async function createTransfer(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.transfer");
  const v = z.object({ from_location_id: uuid, to_location_id: uuid, notes: z.string().trim().max(500).default("") }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose both locations." };
  if (v.data.from_location_id === v.data.to_location_id) return { error: "Choose two different locations." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("stock_transfers").insert({ ...v.data, number: "new" }).select("id").single();
  if (error) return { error: friendly(error.message) };
  redirect(`/inventory/transfers/${(data as { id: string }).id}`);
}

/** Lines pick a stock line "productId:batchId:binId" from what's in the source location. */
export async function addTransferLine(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const v = z.object({ transfer_id: uuid, stock: z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}:[0-9a-f-]{36}$/, "Choose an item."), qty: z.coerce.number().positive() }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const [product_id, batch_id, from_bin_id] = v.data.stock.split(":");
  const supabase = await createClient();
  const { error } = await supabase.from("stock_transfer_lines").insert({ transfer_id: v.data.transfer_id, product_id, batch_id, from_bin_id, qty: v.data.qty });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/transfers/${v.data.transfer_id}`);
  return { message: "Line added." };
}

export async function removeTransferLine(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("stock_transfer_lines").delete().eq("id", uuid.parse(form.get("line_id")));
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/transfers/${form.get("transfer_id")}`);
  return { message: "Removed." };
}

export async function dispatchTransfer(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.transfer");
  const id = uuid.parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispatch_transfer", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/transfers/${id}`);
  return { message: "Dispatched. The stock is now in transit until the other location receives it." };
}

export async function receiveTransfer(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.transfer");
  const id = uuid.parse(form.get("id"));
  const lines = [...form.entries()]
    .filter(([k]) => k.startsWith("received:"))
    .map(([k, val]) => ({ line_id: k.slice(9), received_qty: Number(val) }));
  if (lines.some((l) => !Number.isFinite(l.received_qty) || l.received_qty < 0)) return { error: "Enter received quantities of 0 or more." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_transfer", { p_id: id, p_lines: lines });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/transfers/${id}`);
  return { message: "Received." };
}

// ---------------------------------------------------------------- adjustments
export async function createAdjustment(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.adjust.request");
  const v = z
    .object({ location_id: uuid, reason_type: z.enum(["correction", "found", "damage", "disposal", "sample", "internal_use"]), notes: z.string().trim().max(500).default("") })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose a location and reason." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("stock_adjustments").insert({ ...v.data, number: "new" }).select("id").single();
  if (error) return { error: friendly(error.message) };
  redirect(`/inventory/adjustments/${(data as { id: string }).id}`);
}

export async function addAdjustmentLine(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const v = z
    .object({
      adjustment_id: uuid,
      stock: z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}:[0-9a-f-]{36}$/, "Choose an item."),
      qty,
      direction: z.enum(["out", "in"]),
      reason: z.string().trim().max(200).default(""),
      unit_cost: z.preprocess((x) => (x === "" || x == null ? null : Number(String(x).replace(/[₱,\s]/g, ""))), z.number().min(0).nullable()),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const [product_id, batch_id, bin_id] = v.data.stock.split(":");
  const signed = Math.abs(v.data.qty) * (v.data.direction === "out" ? -1 : 1);
  const supabase = await createClient();
  const { error } = await supabase
    .from("stock_adjustment_lines")
    .insert({ adjustment_id: v.data.adjustment_id, product_id, batch_id, bin_id, qty: signed, reason: v.data.reason, unit_cost: v.data.unit_cost });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/adjustments/${v.data.adjustment_id}`);
  return { message: "Line added." };
}

export async function removeAdjustmentLine(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("stock_adjustment_lines").delete().eq("id", uuid.parse(form.get("line_id")));
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/adjustments/${form.get("adjustment_id")}`);
  return { message: "Removed." };
}

export async function submitAdjustment(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.adjust.request");
  const id = uuid.parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_adjustment", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/adjustments/${id}`);
  return { message: "Sent for approval. Stock changes only after it's approved." };
}

export async function cancelAdjustment(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = uuid.parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("stock_adjustments").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/adjustments/${id}`);
  return { message: "Cancelled." };
}

// ---------------------------------------------------------------- counts
export async function createCount(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.count");
  const v = z
    .object({ location_id: uuid, zone: z.string().trim().max(30).default(""), abc: z.enum(["", "A", "B", "C"]).default(""), blind: z.preprocess((x) => x === "on", z.boolean()), label: z.string().trim().max(80).default("") })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose a location." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_count", {
    p_location: v.data.location_id,
    p_zone: v.data.zone || null,
    p_abc: v.data.abc || null,
    p_blind: v.data.blind,
    p_label: v.data.label,
  });
  if (error) return { error: friendly(error.message) };
  redirect(`/inventory/counts/${data as string}`);
}

export async function recordCounts(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.count");
  const supabase = await createClient();
  let n = 0;
  for (const [k, val] of form.entries()) {
    if (!k.startsWith("count:") || val === "") continue;
    const q = Number(val);
    if (!Number.isFinite(q) || q < 0) return { error: "Counts must be 0 or more." };
    const { error } = await supabase.rpc("record_count", { p_line: k.slice(6), p_qty: q });
    if (error) return { error: friendly(error.message) };
    n++;
  }
  revalidatePath(`/inventory/counts/${form.get("id")}`);
  return { message: `Saved ${n} count${n === 1 ? "" : "s"}.` };
}

export async function submitCount(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.count");
  const id = uuid.parse(form.get("id"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_count", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/counts/${id}`);
  return { message: data === "no_variance" ? "No differences found. The count is closed." : "Sent for approval. Differences post to stock once approved." };
}

// ---------------------------------------------------------------- reorder
export async function saveReorderRule(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.reorder.manage");
  const supabase = await createClient();
  const v = z
    .object({
      product: z.string().min(1, "Choose a product."),
      location_id: uuid,
      min_qty: z.coerce.number().min(0),
      max_qty: z.coerce.number().min(0),
      safety_qty: z.coerce.number().min(0).default(0),
      lead_time_days: z.coerce.number().int().min(0).max(365).default(7),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  if (v.data.max_qty < v.data.min_qty) return { error: "Maximum must be at least the minimum." };
  const p = await resolveProduct(supabase, v.data.product);
  if (!p) return { error: "Product not found." };
  const { product: _p, ...rest } = v.data;
  const { error } = await supabase.from("reorder_rules").upsert({ ...rest, product_id: p.id }, { onConflict: "product_id,location_id" });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/inventory/reorder");
  return { message: "Saved." };
}

export async function deleteReorderRule(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.reorder.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("reorder_rules").delete().eq("product_id", uuid.parse(form.get("product_id"))).eq("location_id", uuid.parse(form.get("location_id")));
  if (error) return { error: friendly(error.message) };
  revalidatePath("/inventory/reorder");
  return { message: "Removed." };
}

// ---------------------------------------------------------------- scan lookup
export interface ScanResult {
  error?: string;
  product?: { id: string; sku: string; name: string; base_unit: string; srp: string | null };
  stock?: { location: string; bin: string; lot: string; expiry: string | null; qa: string; on_hand: number }[];
}

export async function lookupCode(code: string): Promise<ScanResult> {
  await requirePermission("inventory.view");
  const supabase = await createClient();
  const p = await resolveProduct(supabase, code);
  if (!p) return { error: `Nothing found for "${code}".` };
  const [{ data: prod }, { data: stock }] = await Promise.all([
    supabase.from("products").select("id, sku, name, base_unit, srp").eq("id", p.id).single(),
    supabase.from("stock_on_hand").select("location_name, bin_code, lot_no, expiry_date, qa_status, on_hand").eq("product_id", p.id).order("expiry_date"),
  ]);
  return {
    product: prod as ScanResult["product"],
    stock: ((stock as { location_name: string; bin_code: string; lot_no: string; expiry_date: string | null; qa_status: string; on_hand: string }[] | null) ?? []).map((s) => ({
      location: s.location_name,
      bin: s.bin_code,
      lot: s.lot_no,
      expiry: s.expiry_date,
      qa: s.qa_status,
      on_hand: Number(s.on_hand),
    })),
  };
}
