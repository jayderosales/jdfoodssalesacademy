"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

function friendly(msg: string) {
  return /row-level security/.test(msg) ? "You don't have permission to do that." : msg;
}

export async function actOnApproval(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const v = z
    .object({ step_id: z.string().uuid(), request_id: z.string().uuid(), action: z.enum(["approve", "reject", "return"]), comment: z.string().max(1000).default("") })
    .safeParse(Object.fromEntries(form));
  if (!v.success) return { error: "Choose approve, reject or return." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("act_on_approval", { p_step: v.data.step_id, p_action: v.data.action, p_comment: v.data.comment });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/approvals");
  revalidatePath(`/approvals/${v.data.request_id}`);
  const msg: Record<string, string> = {
    approved: "Approved. The requester has been notified.",
    next_step: "Approved. It now goes to the next approver.",
    rejected: "Rejected. The requester has been notified.",
    returned: "Returned to the requester for changes.",
  };
  return { message: msg[data as string] ?? "Done." };
}

const delegationSchema = z.object({
  to_user: z.string().uuid("Choose who will approve for you."),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(200).default(""),
});

export async function addDelegation(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const v = delegationSchema.safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  if (v.data.ends_on < v.data.starts_on) return { error: "The end date is before the start date." };
  if (v.data.to_user === me.id) return { error: "Choose someone other than yourself." };
  const supabase = await createClient();
  const { error } = await supabase.from("approval_delegations").insert({ ...v.data, from_user: me.id });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/approvals/delegations");
  return { message: "Delegation saved." };
}

export async function removeDelegation(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("approval_delegations").delete().eq("id", z.string().uuid().parse(form.get("id")));
  if (error) return { error: friendly(error.message) };
  revalidatePath("/approvals/delegations");
  return { message: "Removed." };
}
