"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.");
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), isoDate.nullable());
const text = (max: number) => z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(max));

function friendly(msg: string) {
  if (/row-level security/.test(msg)) return "You don't have permission to do that.";
  if (/expiry_after_mfg/.test(msg)) return "The expiry date must be after the manufacturing date.";
  if (/violates (check|foreign key|not-null)/.test(msg)) {
    console.error("manufacturing", msg);
    return "Some details aren't valid. Please check the form.";
  }
  return msg;
}

export async function createProductionReport(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("production.report");
  const v = z.object({ report_date: isoDate, location_id: uuid, shift: text(40) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose the date and where it was made." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("production_reports").insert({ ...v.data, number: "" }).select("id").single();
  if (error) return { error: friendly(error.message) };
  redirect(`/manufacturing/reports/${(data as { id: string }).id}`);
}

export async function saveReportNotes(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("production.report");
  const id = uuid.parse(form.get("id"));
  const v = z.object({ report_date: isoDate, shift: text(40), notes: text(1000) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("production_reports").update(v.data).eq("id", id);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/manufacturing/reports/${id}`);
  return { message: "Saved." };
}

/** Product typed as "SKU — name" (from the list) or just the SKU. */
export async function addProductionLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("production.report");
  const v = z
    .object({
      report_id: uuid,
      product: z.string().trim().min(1, "Choose the product."),
      qty: z.coerce.number({ message: "Enter the quantity." }).positive("Enter a quantity greater than 0."),
      unit_code: z.preprocess((x) => (x == null ? "" : x), z.string().regex(/^([a-z]{1,12})?$/, "Choose a unit.")),
      lot_no: z.string().trim().min(1, "Enter the lot number.").max(60),
      mfg_date: isoDate,
      expiry_date: optionalDate,
      notes: text(300),
    })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const sku = v.data.product.split(" — ")[0].trim().toUpperCase();
  const { data: p } = await supabase.from("products").select("id").eq("sku", sku).maybeSingle();
  if (!p) return { error: "Product not found. Pick it from the list." };
  const { product: _p, ...rest } = v.data;
  const { error } = await supabase.from("production_report_lines").insert({ ...rest, product_id: (p as { id: string }).id });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/manufacturing/reports/${v.data.report_id}`);
  return { message: "Added." };
}

export async function removeProductionLine(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("production.report");
  const supabase = await createClient();
  const { error } = await supabase.from("production_report_lines").delete().eq("id", uuid.parse(form.get("id")));
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/manufacturing/reports/${uuid.parse(form.get("report_id"))}`);
  return {};
}

export async function submitProductionReport(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("production.report");
  const id = uuid.parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_production_report", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/manufacturing/reports/${id}`);
  revalidatePath("/manufacturing");
  return { message: "Submitted. The report is now locked." };
}

export async function deleteProductionReport(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("production.report");
  const supabase = await createClient();
  const { error } = await supabase.from("production_reports").delete().eq("id", uuid.parse(form.get("id"))).eq("status", "draft");
  if (error) return { error: friendly(error.message) };
  redirect("/manufacturing");
}
