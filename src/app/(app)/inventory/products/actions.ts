"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const optionalInt = (max: number) => z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(max).nullable());
const checkbox = z.preprocess((v) => v === "on", z.boolean());
const optionalMoney = z.preprocess(
  (v) => (v === "" || v == null ? null : (parseMoney(String(v)) ?? "bad")),
  z.string().regex(/^\d+\.\d{2}$/, "Enter a valid price.").nullable(),
);

const productSchema = z.object({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,39}$/, "SKU: capital letters, numbers and dashes (up to 40)."),
  name: z.string().trim().min(2, "Enter the product name.").max(200),
  brand_id: optionalUuid,
  category_id: optionalUuid,
  new_category: z.string().trim().max(80).optional(),
  item_type: z.enum(["finished_good", "raw_material", "packaging", "merchandise", "service", "bundle"]),
  base_unit: z.string().regex(/^[a-z]{1,12}$/),
  size_label: z.string().trim().max(60).default(""),
  shelf_life_days: optionalInt(3650),
  storage_condition: z.enum(["ambient", "chilled", "frozen"]),
  fda_cpr_no: z.string().trim().max(60).default(""),
  fda_cpr_expiry: optionalDate,
  srp: optionalMoney,
  release_on_receipt: checkbox,
  track_expiry: checkbox,
  pre_order: checkbox,
  lead_time_days: optionalInt(365),
  active: checkbox,
  notes: z.string().trim().max(1000).default(""),
  description: z.string().trim().max(2000).default(""),
  image_url: z.union([z.literal(""), z.string().trim().url("The photo link must start with https://").startsWith("https://", "The photo link must start with https://")]).default(""),
});

function friendly(msg: string) {
  if (/products_sku_key|duplicate key/.test(msg)) return "That SKU is already used by another product.";
  if (/row-level security/.test(msg)) return "You don't have permission to do that.";
  return msg;
}

async function categoryId(supabase: Awaited<ReturnType<typeof createClient>>, id: string | null, name?: string) {
  if (!name) return id;
  const { data: existing } = await supabase.from("product_categories").select("id").ilike("name", name).maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data, error } = await supabase.from("product_categories").insert({ name }).select("id").single();
  if (error) throw new Error(friendly(error.message));
  return (data as { id: string }).id;
}

export async function saveProduct(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.products.manage");
  const id = form.get("id") ? z.string().uuid().parse(form.get("id")) : null;
  const v = productSchema.safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const { new_category, ...fields } = v.data;
  const supabase = await createClient();
  try {
    fields.category_id = await categoryId(supabase, fields.category_id, new_category || undefined);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (id) {
    const { error } = await supabase.from("products").update(fields).eq("id", id);
    if (error) return { error: friendly(error.message) };
    revalidatePath(`/inventory/products/${id}`);
    return { message: "Saved." };
  }
  const { data, error } = await supabase.from("products").insert(fields).select("id").single();
  if (error) return { error: friendly(error.message) };
  revalidatePath("/inventory/products");
  redirect(`/inventory/products/${(data as { id: string }).id}?created=1`);
}

/** Enter or revalue the cost (per base unit). With stock on hand a reason is required (logged as a revaluation). */
export async function setCost(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.cost.manage");
  const id = z.string().uuid().parse(form.get("id"));
  const cost = String(form.get("cost") ?? "").replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(cost)) return { error: "Enter a cost like 85.50." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_product_cost", { p_product: id, p_cost: Number(cost), p_reason: String(form.get("reason") ?? "") });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/products/${id}`);
  revalidatePath("/inventory/prices");
  return { message: "Cost saved." };
}

export async function addUnit(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.products.manage");
  const v = z
    .object({ product_id: z.string().uuid(), unit_code: z.string().regex(/^[a-z]{1,12}$/), factor: z.coerce.number().positive("How many base units are in it?").max(100000) })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("product_units").upsert(v.data);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/products/${v.data.product_id}`);
  return { message: "Unit saved." };
}

export async function removeUnit(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.products.manage");
  const product = z.string().uuid().parse(form.get("product_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("product_units").delete().eq("product_id", product).eq("unit_code", String(form.get("unit_code")));
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/products/${product}`);
  return { message: "Removed." };
}

export async function addBarcode(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.products.manage");
  const v = z
    .object({ product_id: z.string().uuid(), barcode: z.string().trim().regex(/^[0-9A-Za-z-]{4,40}$/, "Barcode: 4–40 letters or numbers."), unit_code: z.string().regex(/^[a-z]{1,12}$/) })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("product_barcodes").insert(v.data);
  if (error) return { error: /duplicate/.test(error.message) ? "That barcode is already assigned to a product." : friendly(error.message) };
  revalidatePath(`/inventory/products/${v.data.product_id}`);
  return { message: "Barcode added." };
}

export async function removeBarcode(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.products.manage");
  const product = z.string().uuid().parse(form.get("product_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("product_barcodes").delete().eq("barcode", String(form.get("barcode")));
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/products/${product}`);
  return { message: "Removed." };
}

export async function addComponent(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.products.manage");
  const v = z.object({ bundle_id: z.string().uuid(), component_id: z.string().uuid("Choose a product."), qty: z.coerce.number().positive().max(100000) }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("bundle_components").upsert(v.data);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/products/${v.data.bundle_id}`);
  return { message: "Component saved." };
}

export async function removeComponent(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("inventory.products.manage");
  const bundle = z.string().uuid().parse(form.get("bundle_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("bundle_components").delete().eq("bundle_id", bundle).eq("component_id", z.string().uuid().parse(form.get("component_id")));
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/inventory/products/${bundle}`);
  return { message: "Removed." };
}

/** Bulk "costs & prices" sheet: only changed rows are sent. */
export async function savePriceSheet(changes: { id: string; srp?: string | null; cost?: string | null }[], reason: string): Promise<{ error?: string; saved?: number }> {
  const supabase = await createClient();
  let saved = 0;
  const errors: string[] = [];
  for (const c of changes.slice(0, 1000)) {
    if (!z.string().uuid().safeParse(c.id).success) continue;
    if (c.srp !== undefined) {
      await requirePermission("inventory.products.manage");
      const srp = c.srp === null || c.srp === "" ? null : parseMoney(c.srp);
      if (c.srp && !srp) {
        errors.push(`Invalid price "${c.srp}"`);
        continue;
      }
      const { error } = await supabase.from("products").update({ srp }).eq("id", c.id);
      if (error) errors.push(friendly(error.message));
      else saved++;
    }
    if (c.cost !== undefined && c.cost !== null && c.cost !== "") {
      await requirePermission("inventory.cost.manage");
      const cost = c.cost.replace(/[₱,\s]/g, "");
      if (!/^\d+(\.\d{1,6})?$/.test(cost)) {
        errors.push(`Invalid cost "${c.cost}"`);
        continue;
      }
      const { error } = await supabase.rpc("set_product_cost", { p_product: c.id, p_cost: Number(cost), p_reason: reason });
      if (error) errors.push(friendly(error.message));
      else saved++;
    }
  }
  revalidatePath("/inventory/prices");
  return errors.length ? { error: `${saved} saved; ${errors.length} not saved: ${[...new Set(errors)].slice(0, 3).join("; ")}`, saved } : { saved };
}
