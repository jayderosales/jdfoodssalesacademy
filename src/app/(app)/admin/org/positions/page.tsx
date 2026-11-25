import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardTitle, Field, Input, Select } from "@/components/ui";
import { can, getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { savePosition } from "../actions";

export const metadata = { title: "Positions" };

interface Position {
  id: string;
  title: string;
  department_id: string | null;
  active: boolean;
}

export default async function PositionsPage() {
  const access = await getAccess();
  const canEdit = can(access, "admin.org.manage");
  const supabase = await createClient();
  const [{ data }, { data: depts }] = await Promise.all([
    supabase.from("positions").select("*").order("title"),
    supabase.from("departments").select("id, name").order("name"),
  ]);
  const positions = (data as Position[] | null) ?? [];
  const departments = (depts as { id: string; name: string }[] | null) ?? [];
  const deptName = new Map(departments.map((d) => [d.id, d.name]));

  const fields = (p?: Position) => {
    const k = p?.id ?? "new";
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {p && <input type="hidden" name="id" value={p.id} />}
        <Field label="Job title" htmlFor={`title-${k}`}><Input id={`title-${k}`} name="title" defaultValue={p?.title} required /></Field>
        <Field label="Department" htmlFor={`dept-${k}`}>
          <Select id={`dept-${k}`} name="department_id" defaultValue={p?.department_id ?? ""}>
            <option value="">— None —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="size-4" /> Active</label>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Positions</CardTitle>
        {positions.length === 0 && <p className="text-sm text-muted-foreground">No positions yet. Add job titles such as “Sales Representative” or “Warehouse Supervisor”.</p>}
        <ul className="divide-y">
          {positions.map((p) => (
            <li key={p.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{p.department_id ? deptName.get(p.department_id) : "No department"}</span>
                  {!p.active && <Badge>inactive</Badge>}
                </summary>
                {canEdit && <div className="mt-3"><ActionForm action={savePosition} submitLabel="Save position" variant="outline">{fields(p)}</ActionForm></div>}
              </details>
            </li>
          ))}
        </ul>
      </Card>
      {canEdit && (
        <Card>
          <CardTitle>Add position</CardTitle>
          <ActionForm action={savePosition} submitLabel="Add position">{fields()}</ActionForm>
        </Card>
      )}
    </div>
  );
}
