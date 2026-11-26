"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission, requireUser } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const fields = z.object({
  amount: z.string().transform((v, ctx) => {
    const m = parseMoney(v);
    if (!m || Number(m) <= 0) {
      ctx.addIssue({ code: "custom", message: "Enter an amount greater than zero." });
      return z.NEVER;
    }
    return m;
  }),
  purpose: z.string().trim().min(3, "Say what the money is for.").max(500),
  needed_on: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  department_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
});

function friendly(msg: string) {
  if (/row-level security/.test(msg)) return "You don't have permission to do that.";
  return msg.replace(/^.*?ERROR:\s*/, "");
}

export async function createPettyCash(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("petty_cash.request");
  const v = fields.safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("petty_cash_requests").insert(v.data).select("id").single();
  if (error) return { error: friendly(error.message) };
  const submitNow = form.get("submit_now") === "1";
  if (submitNow) {
    const { error: subErr } = await supabase.rpc("submit_petty_cash", { p_id: data.id });
    if (subErr) redirect(`/requests/petty-cash/${data.id}?error=${encodeURIComponent(friendly(subErr.message))}`);
  }
  revalidatePath("/requests/petty-cash");
  redirect(`/requests/petty-cash/${data.id}${submitNow ? "?submitted=1" : ""}`);
}

export async function updatePettyCash(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  const v = fields.safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("petty_cash_requests").update(v.data).eq("id", id).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "Only drafts and returned requests can be edited." };
  revalidatePath(`/requests/petty-cash/${id}`);
  return { message: "Saved." };
}

export async function submitPettyCash(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_petty_cash", { p_id: id });
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/requests/petty-cash/${id}`);
  revalidatePath("/requests/petty-cash");
  return { message: "Sent for approval. You'll get a notification when it's decided." };
}

export async function cancelPettyCash(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  const approvalId = form.get("approval_id");
  const supabase = await createClient();
  if (approvalId) {
    const { error } = await supabase.rpc("cancel_approval", { p_request: z.string().uuid().parse(approvalId) });
    if (error) return { error: friendly(error.message) };
  }
  const { error } = await supabase.from("petty_cash_requests").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/requests/petty-cash/${id}`);
  return { message: "Request cancelled." };
}

export async function deletePettyCash(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { data, error } = await supabase.from("petty_cash_requests").delete().eq("id", id).select("id");
  if (error) return { error: friendly(error.message) };
  if (!data?.length) return { error: "Only your own drafts can be deleted." };
  revalidatePath("/requests/petty-cash");
  redirect("/requests/petty-cash");
}
