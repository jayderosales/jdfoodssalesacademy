"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const name = z.string().trim().min(2, "Name is too short.").max(80);
const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());

function dbError(msg: string) {
  return /duplicate key/i.test(msg) ? "That name is already used." : msg;
}

export async function createBranch(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = name.safeParse(form.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({ name: parsed.data });
  if (error) return { error: dbError(error.message) };
  revalidatePath("/admin/teams");
  return { message: "Branch added." };
}

export async function renameBranch(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = z.object({ id: z.string().uuid(), name }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("branches").update({ name: parsed.data.name }).eq("id", parsed.data.id);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/admin/teams");
  return { message: "Saved." };
}

export async function deleteBranch(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { count } = await supabase.from("teams").select("id", { count: "exact", head: true }).eq("branch_id", id);
  if (count) return { error: "Move or delete this branch's teams first." };
  const { error } = await supabase.from("branches").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/teams");
  return { message: "Branch deleted." };
}

export async function createTeam(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = z.object({ name, branch_id: optionalUuid }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("teams").insert(parsed.data);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/admin/teams");
  return { message: "Team added." };
}

export async function updateTeam(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const parsed = z.object({ id: z.string().uuid(), name, branch_id: optionalUuid }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("teams").update(fields).eq("id", id);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/admin/teams");
  return { message: "Saved." };
}

export async function deleteTeam(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("team_id", id);
  if (count) return { error: "This team still has members (including inactive ones). Move them first." };
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/teams");
  return { message: "Team deleted." };
}
