"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const optionalText = (max: number) => z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(max));
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const name = z.string().trim().min(2, "Name is too short.").max(120);
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/, "Code: 2–20 letters, numbers, - or _.");

function dbError(msg: string) {
  if (/duplicate key/i.test(msg)) return "That name or code is already used.";
  if (/office_holds_no_inventory/.test(msg)) return "An office can't hold inventory. Choose another type or untick “Holds inventory”.";
  if (/loop/i.test(msg)) return msg;
  if (/row-level security/i.test(msg)) return "You don't have permission to do that.";
  if (/foreign key/i.test(msg)) return "This is still in use elsewhere, so it can't be deleted. Mark it inactive instead.";
  return msg;
}

async function entityId() {
  const supabase = await createClient();
  const { data } = await supabase.from("entities").select("id").eq("active", true).order("created_at").limit(1).single();
  return data?.id as string;
}

function done(path: string, message: string): FormState {
  revalidatePath(path);
  return { message };
}

// ---------------------------------------------------------------- locations
const locationSchema = z.object({
  id: optionalUuid,
  code,
  name,
  type: z.enum(["office", "plant", "warehouse", "pickup_hub", "business_center"]),
  holds_inventory: checkbox,
  is_pickup_point: checkbox,
  address: optionalText(300),
  city: optionalText(80),
  active: checkbox,
});

export async function saveLocation(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.org.manage");
  const parsed = locationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("locations").update(fields).eq("id", id)
    : await supabase.from("locations").insert({ ...fields, entity_id: await entityId() });
  if (error) return { error: dbError(error.message) };
  return done("/admin/org/locations", id ? "Saved." : "Location added.");
}

// ---------------------------------------------------------------- departments
const departmentSchema = z.object({
  id: optionalUuid,
  code,
  name,
  parent_id: optionalUuid,
  head_employee_id: optionalUuid,
  active: checkbox,
});

export async function saveDepartment(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.org.manage");
  const parsed = departmentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  if (id && fields.parent_id === id) return { error: "A department can't be inside itself." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("departments").update(fields).eq("id", id)
    : await supabase.from("departments").insert({ ...fields, entity_id: await entityId() });
  if (error) return { error: dbError(error.message) };
  return done("/admin/org/departments", id ? "Saved." : "Department added.");
}

// ---------------------------------------------------------------- positions
const positionSchema = z.object({ id: optionalUuid, title: name, department_id: optionalUuid, active: checkbox });

export async function savePosition(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("admin.org.manage");
  const parsed = positionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("positions").update(fields).eq("id", id) : await supabase.from("positions").insert(fields);
  if (error) return { error: dbError(error.message) };
  return done("/admin/org/positions", id ? "Saved." : "Position added.");
}

// ---------------------------------------------------------------- employees
const employeeSchema = z.object({
  id: optionalUuid,
  employee_no: z.string().trim().min(1, "Enter the employee number.").max(30),
  full_name: name,
  work_email: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().toLowerCase().email("Enter a valid email.").nullable()),
  phone: optionalText(40),
  position_id: optionalUuid,
  department_id: optionalUuid,
  location_id: optionalUuid,
  supervisor_id: optionalUuid,
  hire_date: optionalDate,
  status: z.enum(["active", "on_leave", "inactive"]),
});

export async function saveEmployee(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission("employees.manage");
  const parsed = employeeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  if (id && fields.supervisor_id === id) return { error: "Someone can't be their own supervisor." };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("employees").update(fields).eq("id", id).select("id").single()
    : await supabase.from("employees").insert({ ...fields, entity_id: await entityId() }).select("id").single();
  if (error) return { error: dbError(error.message) };
  revalidatePath("/admin/org/employees");
  revalidatePath(`/admin/org/employees/${data.id}`);
  return { message: id ? "Saved." : "Employee added." };
}

// ---------------------------------------------------------------- sales teams (Academy)
const teamSchema = z.object({ id: optionalUuid, name, location_id: optionalUuid, department_id: optionalUuid });

export async function saveTeam(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission(["admin.org.manage", "academy.admin"]);
  const parsed = teamSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("teams").update(fields).eq("id", id) : await supabase.from("teams").insert(fields);
  if (error) return { error: dbError(error.message) };
  return done("/admin/org/teams", id ? "Saved." : "Team added.");
}

export async function deleteTeam(_: FormState, form: FormData): Promise<FormState> {
  await requirePermission(["admin.org.manage", "academy.admin"]);
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("team_id", id);
  if (count) return { error: "This team still has members (including inactive ones). Move them first." };
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) return { error: dbError(error.message) };
  return done("/admin/org/teams", "Team deleted.");
}
