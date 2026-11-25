import Link from "next/link";
import { Badge, Button, Card, CardTitle, Input, Select, Table, Td, Th } from "@/components/ui";
import { can, getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { EmployeeForm, type EmployeeRow } from "./employee-form";
import { employeeFormOptions } from "./options";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string; status?: string }> }) {
  const { q, dept, status = "current" } = await searchParams;
  const access = await getAccess();
  const canEdit = can(access, "employees.manage");
  const supabase = await createClient();
  const opts = await employeeFormOptions();

  let query = supabase.from("employees").select("*").order("full_name");
  if (status === "current") query = query.neq("status", "inactive");
  else if (status !== "all") query = query.eq("status", status);
  if (dept) query = query.eq("department_id", dept);
  if (q) {
    const s = q.replace(/[%,()]/g, "");
    query = query.or(`full_name.ilike.%${s}%,employee_no.ilike.%${s}%,work_email.ilike.%${s}%`);
  }
  const { data } = await query;
  const employees = (data as EmployeeRow[] | null) ?? [];
  const byId = (list: { id: string; name: string }[]) => new Map(list.map((o) => [o.id, o.name]));
  const pos = byId(opts.positions);
  const dep = byId(opts.departments);
  const loc = byId(opts.locations);
  const sup = byId(opts.supervisors);

  return (
    <div className="space-y-4">
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-4">
          <Input name="q" placeholder="Search name, number, email" defaultValue={q} aria-label="Search" />
          <Select name="dept" defaultValue={dept ?? ""} aria-label="Department">
            <option value="">All departments</option>
            {opts.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <Select name="status" defaultValue={status} aria-label="Status">
            <option value="current">Current (active + on leave)</option>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="inactive">Left</option>
            <option value="all">All</option>
          </Select>
          <Button type="submit" variant="outline">Filter</Button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Position</Th>
              <Th>Department</Th>
              <Th>Location</Th>
              <Th>Supervisor</Th>
              <Th>Hired</Th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <Td>
                  <Link href={`/admin/org/employees/${e.id}`} className="font-medium text-brand underline">{e.full_name}</Link>
                  <div className="text-xs text-muted-foreground">
                    {e.employee_no}
                    {e.status !== "active" && <Badge className="ml-1">{e.status.replace("_", " ")}</Badge>}
                  </div>
                </Td>
                <Td>{e.position_id ? pos.get(e.position_id) : "—"}</Td>
                <Td>{e.department_id ? dep.get(e.department_id) : "—"}</Td>
                <Td>{e.location_id ? loc.get(e.location_id) : "—"}</Td>
                <Td>{e.supervisor_id ? (sup.get(e.supervisor_id) ?? "—") : "—"}</Td>
                <Td>{formatDate(e.hire_date)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {employees.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No employees yet. Add them below (bulk import comes with the import tool in Phase 1b).</p>
        )}
      </Card>
      {canEdit && (
        <Card>
          <CardTitle>Add employee</CardTitle>
          <EmployeeForm {...opts} />
        </Card>
      )}
    </div>
  );
}
