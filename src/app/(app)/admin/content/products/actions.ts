"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { parseFaqs } from "@/lib/content/faqs";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const text = z.string().trim().max(5000).default("");
const checkbox = z.preprocess((v) => v === "on", z.boolean());

const schema = z.object({
  id: z.string().optional(),
  brand: z.string().trim().min(1, "Brand is required.").max(80),
  line: text,
  name: z.string().trim().min(1, "Name is required.").max(160),
  category: text,
  sizes: text,
  price_php: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0).nullable()),
  ingredients: text,
  allergens: text,
  shelf_life: text,
  storage: text,
  use_cases: text,
  recipes: text,
  target_customers: text,
  selling_points: text,
  competitor_notes: text,
  faqs: z.string().max(20000).default(""),
  lesson_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  verified: checkbox,
  active: checkbox,
});

export async function saveProduct(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = schema.safeParse({ ...Object.fromEntries(form), verified: form.get("verified"), active: form.get("active") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, sizes, faqs, ...fields } = parsed.data;
  const row = {
    ...fields,
    sizes: sizes.split(",").map((s) => s.trim()).filter(Boolean),
    faqs: parseFaqs(faqs),
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("products").update(row).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/content/products");
    revalidatePath(`/admin/content/products/${id}`);
    return { message: "Product saved." };
  }
  const { data, error } = await supabase.from("products").insert(row).select("id").single();
  if (error) return { error: error.message };
  redirect(`/admin/content/products/${data.id}`);
}
