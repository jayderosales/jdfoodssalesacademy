import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, Field, Input, Select } from "@/components/ui";
import { can, getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveDepartment } from "../actions";

export const metadata = { title: "Departments" };

interface Department {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  head_employee_id: string | null;
  active: boolean;
}

export default async function DepartmentsPage() {
  const access = await getAccess();
  const canEdit = can(access, "admin.org.manage");
  const supabase = await createClient();
  const [{ data }, { data: emps }, { data: counts }] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
    supabase.from("employees").select("department_id").neq("status", "inactive"),
  ]);
  const departments = (data as Department[] | null) ?? [];
  const employees = (emps as { id: string; full_name: string }[] | null) ?? [];
  const empName = new Map(employees.map((e) => [e.id, e.full_name]));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const headcount = new Map<string, number>();
  for (const r of (counts as { department_id: string | null }[] | null) ?? []) if (r.department_id) headcount.set(r.department_id, (headcount.get(r.department_id) ?? 0) + 1);

  const fields = (d?: Department) => {
    const k = d?.id ?? "new";
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {d && <input type="hidden" name="id" value={d.id} />}
        <Field label="Code" htmlFor={`code-${k}`}><Input id={`code-${k}`} name="code" defaultValue={d?.code} required /></Field>
        <Field label="Name" htmlFor={`name-${k}`}><Input id={`name-${k}`} name="name" defaultValue={d?.name} required /></Field>
        <Field label="Part of (optional)" htmlFor={`parent-${k}`}>
          <Select id={`parent-${k}`} name="parent_id" defaultValue={d?.parent_id ?? ""}>
            <option value="">— Top level —</option>
            {departments.filter((x) => x.id !== d?.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="Department head" htmlFor={`head-${k}`} hint="Used for approvals and escalations.">
          <Select id={`head-${k}`} name="head_employee_id" defaultValue={d?.head_employee_id ?? ""}>
            <option value="">— Not set —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={d?.active ?? true} className="size-4" /> Active</label>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Departments</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">Starter departments are placeholders. Rename, add or deactivate them to match how JD Foods is organized.</p>
        <ul className="divide-y">
          {departments.map((d) => (
            <li key={d.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.code}
                    {d.parent_id ? ` · part of ${deptName.get(d.parent_id)}` : ""} · head: {d.head_employee_id ? empName.get(d.head_employee_id) : "not set"} · {headcount.get(d.id) ?? 0} people
                  </span>
                  {!d.active && <Badge>inactive</Badge>}
                </summary>
                {canEdit && <div className="mt-3"><ActionForm action={saveDepartment} submitLabel="Save department" variant="outline">{fields(d)}</ActionForm></div>}
              </details>
            </li>
          ))}
        </ul>
      </Card>
      {canEdit && (
        <Card>
          <CardTitle>Add department</CardTitle>
          <ActionForm action={saveDepartment} submitLabel="Add department">{fields()}</ActionForm>
        </Card>
      )}
    </div>
  );
}
