import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordHistory } from "@/components/record-history";
import { Card, CardTitle } from "@/components/ui";
import { can, getAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmployeeForm, type EmployeeRow } from "../employee-form";
import { employeeFormOptions } from "../options";

export const metadata = { title: "Employee" };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccess();
  const supabase = await createClient();
  const [{ data }, opts, { data: reports }, { data: user }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).maybeSingle(),
    employeeFormOptions(),
    supabase.from("employees").select("id, full_name").eq("supervisor_id", id).neq("status", "inactive").order("full_name"),
    supabase.from("profiles").select("id, email").eq("employee_id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const e = data as EmployeeRow;

  return (
    <div className="space-y-4">
      <Link href="/admin/org/employees" className="text-sm text-brand underline">← All employees</Link>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>{e.full_name}</CardTitle>
          {can(access, "employees.manage") ? (
            <EmployeeForm e={e} {...opts} />
          ) : (
            <p className="text-sm text-muted-foreground">You can view this record but not change it.</p>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardTitle>Sign-in account</CardTitle>
            {user ? (
              can(access, "admin.users.view") ? (
                <Link href={`/admin/users/${user.id}`} className="text-sm text-brand underline">{user.email}</Link>
              ) : (
                <p className="text-sm">{user.email}</p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Not linked. Link it from the person&apos;s page under Users.</p>
            )}
          </Card>
          <Card>
            <CardTitle>Direct reports</CardTitle>
            {(reports ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(reports as { id: string; full_name: string }[]).map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/org/employees/${r.id}`} className="text-brand underline">{r.full_name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <RecordHistory tables={["employees"]} recordIds={[e.id]} />
    </div>
  );
}
