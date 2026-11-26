"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission, requireUser } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const uuid = z.string().uuid();
const optUuid = z.preprocess((v) => (v === "" || v == null ? null : v), uuid.nullable());
const optDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const text = (max: number) => z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(max));
const money = z.preprocess((v) => parseMoney(String(v ?? "")), z.string({ message: "Enter a valid amount." }));
const optMoney = z.preprocess((v) => (v === "" || v == null ? null : parseMoney(String(v))), z.string().nullable());

function friendly(msg: string) {
  if (/row-level security/.test(msg)) return "You don't have permission to do that here.";
  if (/duplicate key/.test(msg)) return "That already exists.";
  if (/violates (check|foreign key|not-null)/.test(msg)) {
    console.error("sales", msg);
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

// ================================================================ customers
const CustomerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(160),
  type: z.enum(["retail", "regular", "corporate", "distributor", "reseller"]),
  mobile: text(20),
  email: z.preprocess((v) => (v == null ? "" : v), z.union([z.literal(""), z.string().trim().email("Check the email address.")])),
  tin: text(30),
  notes: text(1000),
  owner_id: optUuid,
});

export async function createCustomer(_: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("sales.customers.manage");
  const v = CustomerSchema.safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").insert({ ...v.data, code: "", owner_id: v.data.owner_id ?? me.id }).select("id").single();
  if (error) return fail(error);
  redirect(`/sales/customers/${(data as { id: string }).id}`);
}

export async function updateCustomer(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.customers.manage");
  const id = uuid.parse(form.get("id"));
  const v = CustomerSchema.extend({ active: z.preprocess((x) => x === "on", z.boolean()) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update(v.data).eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/sales/customers/${id}`);
  return { message: "Saved." };
}

export async function updateCredit(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = uuid.parse(form.get("id"));
  const v = z
    .object({
      payment_terms_days: z.coerce.number().int().min(0).max(180),
      credit_limit: money,
      on_hold: z.preprocess((x) => x === "on", z.boolean()),
      opening_balance: z.preprocess((x) => (x === "" || x == null ? "0" : x), z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Opening balance must be an amount.")),
      opening_due_date: optDate,
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update(v.data).eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/sales/customers/${id}`);
  return { message: "Credit terms saved." };
}

export async function addContact(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.customers.manage");
  const v = z.object({ customer_id: uuid, name: z.string().trim().min(2, "Enter a name.").max(120), role: text(80), mobile: text(20), email: text(120) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_contacts").insert(v.data);
  if (error) return fail(error);
  revalidatePath(`/sales/customers/${v.data.customer_id}`);
  return { message: "Contact added." };
}

export async function addAddress(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.customers.manage");
  const v = z
    .object({ customer_id: uuid, label: text(40), recipient: text(120), phone: text(20), line: z.string().trim().min(5, "Enter the street address.").max(300), city: text(80), province: text(80), zip: text(10), is_default: z.preprocess((x) => x === "on", z.boolean()) })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_addresses").insert({ ...v.data, label: v.data.label || "Main" });
  if (error) return fail(error);
  revalidatePath(`/sales/customers/${v.data.customer_id}`);
  return { message: "Address added." };
}

export async function setCustomerPrice(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.pricing.manage");
  const v = z.object({ customer_id: uuid, product: z.string().min(1, "Choose a product."), price: money, valid_from: optDate }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const p = await productBySku(v.data.product);
  if (!p) return { error: "Product not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("customer_prices").upsert({ customer_id: v.data.customer_id, product_id: p.id, price: v.data.price, valid_from: v.data.valid_from ?? "2000-01-01" });
  if (error) return fail(error);
  revalidatePath(`/sales/customers/${v.data.customer_id}`);
  return { message: "Special price saved." };
}

export async function removeCustomerPrice(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.pricing.manage");
  const cid = uuid.parse(form.get("customer_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("customer_prices").delete().eq("customer_id", cid).eq("product_id", uuid.parse(form.get("product_id"))).eq("valid_from", String(form.get("valid_from")));
  if (error) return fail(error);
  revalidatePath(`/sales/customers/${cid}`);
  return {};
}

// ================================================================ price lists
export async function savePriceListSheet(listId: string, changes: { productId: string; price: string | null }[]): Promise<{ error?: string; saved?: number }> {
  await requirePermission("sales.pricing.manage");
  if (!uuid.safeParse(listId).success) return { error: "Choose a price list." };
  const supabase = await createClient();
  let saved = 0;
  const errors: string[] = [];
  for (const c of changes.slice(0, 1000)) {
    if (!uuid.safeParse(c.productId).success) continue;
    if (c.price === null || c.price === "") {
      const { error } = await supabase.from("price_list_items").delete().eq("price_list_id", listId).eq("product_id", c.productId).eq("min_qty", 1).eq("valid_from", "2000-01-01");
      if (error) errors.push(friendly(error.message));
      else saved++;
      continue;
    }
    const price = parseMoney(c.price);
    if (!price) {
      errors.push(`Invalid price "${c.price}"`);
      continue;
    }
    const { error } = await supabase.from("price_list_items").upsert({ price_list_id: listId, product_id: c.productId, min_qty: 1, valid_from: "2000-01-01", price });
    if (error) errors.push(friendly(error.message));
    else saved++;
  }
  revalidatePath("/sales/prices");
  return errors.length ? { error: `${saved} saved; ${errors.length} not saved: ${[...new Set(errors)].slice(0, 3).join("; ")}`, saved } : { saved };
}

export async function addQtyBreak(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.pricing.manage");
  const v = z.object({ price_list_id: uuid, product: z.string().min(1), min_qty: z.coerce.number().positive("Minimum quantity must be more than 0."), price: money, valid_from: optDate }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const p = await productBySku(v.data.product);
  if (!p) return { error: "Product not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("price_list_items").upsert({ price_list_id: v.data.price_list_id, product_id: p.id, min_qty: v.data.min_qty, price: v.data.price, valid_from: v.data.valid_from ?? "2000-01-01" });
  if (error) return fail(error);
  revalidatePath("/sales/prices");
  return { message: "Saved." };
}

// ================================================================ orders
export async function createOrder(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.orders.create");
  const v = z
    .object({
      customer_id: uuid,
      channel: z.enum(["phone", "messenger", "field", "walk_in", "email", "shopify", "marketplace", "other"]),
      payment_mode: z.enum(["prepaid", "terms"]),
      location_id: uuid,
      courier_note: text(300),
      notes: text(1000),
      address_id: optUuid,
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose a customer and where it ships from." };
  const supabase = await createClient();
  let ship_to: Record<string, string> = {};
  const { data: c } = await supabase.from("customers").select("name, mobile").eq("id", v.data.customer_id).single();
  if (v.data.address_id) {
    const { data: a } = await supabase.from("customer_addresses").select("recipient, phone, line, city, province, zip").eq("id", v.data.address_id).single();
    if (a) ship_to = a as Record<string, string>;
  }
  const cu = c as { name: string; mobile: string } | null;
  ship_to = { recipient: ship_to.recipient || cu?.name || "", phone: ship_to.phone || cu?.mobile || "", ...ship_to };
  const { address_id: _a, ...rest } = v.data;
  void _a;
  const { data, error } = await supabase.from("sales_orders").insert({ ...rest, number: "", ship_to }).select("id").single();
  if (error) return fail(error);
  redirect(`/sales/orders/${(data as { id: string }).id}`);
}

export async function addOrderLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.orders.create");
  const v = z
    .object({
      order_id: uuid,
      product: z.string().min(1, "Choose a product."),
      qty: z.coerce.number().positive("Enter a quantity."),
      unit_price: optMoney,
      discount_pct: z.preprocess((x) => (x === "" || x == null ? 0 : x), z.coerce.number().min(0).max(100)),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const p = await productBySku(v.data.product);
  if (!p) return { error: "Product not found. Pick one from the list." };
  const supabase = await createClient();
  const { error } = await supabase.from("sales_order_lines").insert({ order_id: v.data.order_id, product_id: p.id, qty: v.data.qty, unit_price: v.data.unit_price, discount_pct: v.data.discount_pct });
  if (error) return fail(error);
  revalidatePath(`/sales/orders/${v.data.order_id}`);
  return {};
}

export async function removeOrderLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.orders.create");
  const supabase = await createClient();
  const { error } = await supabase.from("sales_order_lines").delete().eq("id", uuid.parse(form.get("id")));
  if (error) return fail(error);
  revalidatePath(`/sales/orders/${uuid.parse(form.get("order_id"))}`);
  return {};
}

async function rpcAndRefresh(fn: string, args: Record<string, unknown>, path: string, okMessage: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return fail(error);
  revalidatePath(path);
  revalidatePath("/sales/fulfilment");
  revalidatePath("/sales");
  return { message: typeof data === "string" && okMessage.includes("{}") ? okMessage.replace("{}", data.replace(/_/g, " ")) : okMessage };
}

export async function placeOrder(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.orders.create");
  const id = uuid.parse(form.get("id"));
  return rpcAndRefresh("place_sales_order", { p_order: id }, `/sales/orders/${id}`, "Order placed: {}.");
}

export async function cancelOrder(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = uuid.parse(form.get("id"));
  return rpcAndRefresh("cancel_sales_order", { p_order: id, p_reason: String(form.get("reason") ?? "") }, `/sales/orders/${id}`, "Order cancelled; reserved stock released.");
}

export async function deleteDraftOrder(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.orders.create");
  const supabase = await createClient();
  const { error } = await supabase.from("sales_orders").delete().eq("id", uuid.parse(form.get("id"))).eq("status", "draft");
  if (error) return fail(error);
  redirect("/sales/orders");
}

export async function fulfilAction(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.fulfil");
  const id = uuid.parse(form.get("id"));
  const step = String(form.get("step"));
  const path = `/sales/orders/${id}`;
  switch (step) {
    case "pack":
      return rpcAndRefresh("start_packing", { p_order: id }, path, "Packing started. Pick the lots on the pick list.");
    case "ready":
      return rpcAndRefresh("mark_ready_for_pickup", { p_order: id }, path, "Ready for pickup. Stock deducted and billing invoice issued.");
    case "dispatch": {
      const fee = optMoney.safeParse(form.get("fee"));
      return rpcAndRefresh(
        "dispatch_order",
        { p_order: id, p_courier: String(form.get("courier") ?? ""), p_tracking: String(form.get("tracking") ?? ""), p_fee: fee.success ? fee.data : null, p_pickup: optUuid.parse(form.get("pickup")) },
        path,
        "Handed to the courier.",
      );
    }
    case "deliver":
      return rpcAndRefresh("mark_delivered", { p_order: id, p_note: String(form.get("note") ?? "") }, path, "Marked delivered.");
    case "return":
      return rpcAndRefresh("return_sales_order", { p_order: id, p_reason: String(form.get("reason") ?? "") }, path, "Return received into the RETURNS bin.");
    default:
      return { error: "Unknown step." };
  }
}

// ================================================================ payments
export async function recordPayment(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const v = z
    .object({
      customer_id: uuid,
      order_id: optUuid,
      method: z.enum(["cash", "bank_transfer", "gcash", "maya", "cheque", "card", "other"]),
      amount: money,
      reference: text(80),
      paid_on: optDate,
      notes: text(500),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_customer: v.data.customer_id, p_order: v.data.order_id, p_method: v.data.method, p_amount: v.data.amount,
    p_reference: v.data.reference, p_paid_on: v.data.paid_on, p_notes: v.data.notes,
  });
  if (error) return fail(error);
  revalidatePath("/sales/payments");
  if (v.data.order_id) revalidatePath(`/sales/orders/${v.data.order_id}`);
  revalidatePath(`/sales/customers/${v.data.customer_id}`);
  return { message: "Payment recorded. Finance will confirm it against the bank or e-wallet." };
}

export async function confirmPayment(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.payments.confirm");
  return rpcAndRefresh("confirm_payment", { p_payment: uuid.parse(form.get("id")) }, "/sales/payments", "Payment confirmed.");
}

export async function rejectPayment(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.payments.confirm");
  return rpcAndRefresh("reject_payment", { p_payment: uuid.parse(form.get("id")), p_reason: String(form.get("reason") ?? "") }, "/sales/payments", "Payment rejected.");
}

// ================================================================ CRM
export async function createLead(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.crm");
  const v = z
    .object({
      name: z.string().trim().min(2, "Enter the contact's name.").max(120),
      company: text(160), mobile: text(20), email: text(120), city: text(80),
      source: z.enum(["referral", "walk_in", "facebook", "website", "shop", "event", "cold_call", "other"]),
      customer_type: z.enum(["retail", "regular", "corporate", "distributor", "reseller"]),
      interest: text(1000),
      est_value: z.preprocess((x) => (x === "" || x == null ? "0" : parseMoney(String(x))), z.string({ message: "Estimated value must be an amount." })),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").insert({ ...v.data, number: "" }).select("id").single();
  if (error) return fail(error);
  redirect(`/sales/leads/${(data as { id: string }).id}`);
}

export async function updateLead(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.crm");
  const id = uuid.parse(form.get("id"));
  const v = z
    .object({
      stage: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]),
      est_value: z.preprocess((x) => (x === "" || x == null ? "0" : parseMoney(String(x))), z.string({ message: "Estimated value must be an amount." })),
      next_action: text(300),
      next_action_at: z.preprocess((x) => (x === "" || x == null ? null : new Date(String(x)).toISOString()), z.string().nullable()),
      lost_reason: text(300),
      owner_id: optUuid,
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const patch: Record<string, unknown> = { ...v.data };
  if (!v.data.owner_id) delete patch.owner_id;
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/sales/leads/${id}`);
  revalidatePath("/sales/leads");
  return { message: "Saved." };
}

export async function convertLead(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.crm");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_lead", { p_lead: uuid.parse(form.get("id")) });
  if (error) return fail(error);
  redirect(`/sales/customers/${data as string}`);
}

export async function logActivity(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.crm");
  const num = (x: FormDataEntryValue | null) => (x === "" || x == null ? null : Number(x));
  const v = z
    .object({
      kind: z.enum(["call", "visit", "message", "email", "meeting", "note", "task"]),
      subject: z.string().trim().min(2, "Write a short subject.").max(200),
      notes: text(2000), outcome: text(300),
      customer_id: optUuid, lead_id: optUuid,
      due_at: z.preprocess((x) => (x === "" || x == null ? null : new Date(String(x)).toISOString()), z.string().nullable()),
      done: z.preprocess((x) => x === "on", z.boolean()),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const lat = num(form.get("lat"));
  const lng = num(form.get("lng"));
  const gps = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const { done, ...rest } = v.data;
  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    ...rest,
    done_at: done || gps ? new Date().toISOString() : null,
    lat: gps ? lat : null, lng: gps ? lng : null, accuracy_m: gps ? num(form.get("accuracy")) : null, checked_in_at: gps ? new Date().toISOString() : null,
  });
  if (error) return fail(error);
  if (v.data.customer_id) revalidatePath(`/sales/customers/${v.data.customer_id}`);
  if (v.data.lead_id) revalidatePath(`/sales/leads/${v.data.lead_id}`);
  revalidatePath("/sales/activities");
  return { message: gps ? "Visit checked in." : "Saved." };
}

export async function completeActivity(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.crm");
  const supabase = await createClient();
  const { error } = await supabase.from("activities").update({ done_at: new Date().toISOString(), outcome: String(form.get("outcome") ?? "").slice(0, 300) }).eq("id", uuid.parse(form.get("id")));
  if (error) return fail(error);
  revalidatePath("/sales/activities");
  return {};
}

// ================================================================ invoices and SI
export async function addBooklet(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.invoices.manage");
  const v = z
    .object({ series: z.preprocess((x) => String(x ?? "").trim().toUpperCase(), z.string().regex(/^[A-Z0-9-]{0,10}$/, "Series: letters/numbers only.")), start_no: z.coerce.number().int().positive(), end_no: z.coerce.number().int().positive(), holder_id: optUuid, location_id: optUuid, notes: text(300) })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  if (v.data.end_no < v.data.start_no) return { error: "The last number must be after the first." };
  const supabase = await createClient();
  const { error } = await supabase.from("si_booklets").insert(v.data);
  if (error) return fail(error);
  revalidatePath("/sales/invoices");
  return { message: "Booklet registered." };
}

export async function recordSi(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("sales.invoices.manage");
  const v = z
    .object({ invoice_id: optUuid, series: z.preprocess((x) => String(x ?? "").trim().toUpperCase(), z.string().max(10)), si_no: z.coerce.number().int().positive("Enter the SI number."), status: z.enum(["issued", "void", "spoiled"]), note: text(300) })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  return rpcAndRefresh("record_si", { p_invoice: v.data.invoice_id, p_series: v.data.series, p_si_no: v.data.si_no, p_status: v.data.status, p_note: v.data.note }, "/sales/invoices", "SI recorded.");
}
