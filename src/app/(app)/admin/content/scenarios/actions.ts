"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const text = (max = 2000) => z.string().trim().max(max).default("");
const req = (label: string, max = 2000) => z.string().trim().min(2, `${label} is required.`).max(max);

const schema = z.object({
  id: z.string().optional(),
  title: req("Title", 200),
  briefing: req("Briefing"),
  customer_opening: text(1000),
  goal: req("Goal", 500),
  difficulty: z.enum(["easy", "medium", "hard"]),
  language: z.enum(["en", "taglish"]),
  max_turns: z.coerce.number().int().min(2).max(40),
  rubric_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  name: req("Customer name", 120),
  business_type: req("Business type", 200),
  location: req("Location", 200),
  personality: req("Personality"),
  budget: text(),
  current_supplier: text(),
  hidden_needs: text(),
  objections: text(4000),
  notes: text(),
});

export async function saveScenario(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const productIds = z.array(z.string().uuid()).parse(form.getAll("product_ids"));
  const row = {
    title: v.title,
    briefing: v.briefing,
    customer_opening: v.customer_opening || null,
    goal: v.goal,
    difficulty: v.difficulty,
    language: v.language,
    max_turns: v.max_turns,
    rubric_id: v.rubric_id,
    product_ids: productIds,
    active: form.get("active") === "on",
    persona: {
      name: v.name,
      business_type: v.business_type,
      location: v.location,
      personality: v.personality,
      budget: v.budget,
      current_supplier: v.current_supplier,
      hidden_needs: v.hidden_needs,
      objections: v.objections.split("\n").map((s) => s.trim()).filter(Boolean),
      ...(v.notes ? { notes: v.notes } : {}),
    },
  };
  const supabase = await createClient();
  if (v.id) {
    const { error } = await supabase.from("scenarios").update(row).eq("id", v.id);
    if (error) return { error: error.message };
    revalidatePath("/admin/content/scenarios");
    revalidatePath("/roleplay");
    return { message: "Scenario saved. New roleplays use it right away." };
  }
  const { data, error } = await supabase.from("scenarios").insert(row).select("id").single();
  if (error) return { error: error.message };
  redirect(`/admin/content/scenarios/${data.id}`);
}
