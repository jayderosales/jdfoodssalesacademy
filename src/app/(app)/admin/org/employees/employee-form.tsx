import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { saveEmployee } from "../actions";

export interface EmployeeRow {
  id: string;
  employee_no: string;
  full_name: string;
  work_email: string | null;
  phone: string | null;
  position_id: string | null;
  department_id: string | null;
  location_id: string | null;
  supervisor_id: string | null;
  hire_date: string | null;
  status: "active" | "on_leave" | "inactive";
}

type Option = { id: string; name: string };

export function EmployeeForm({
  e,
  positions,
  departments,
  locations,
  supervisors,
}: {
  e?: EmployeeRow;
  positions: Option[];
  departments: Option[];
  locations: Option[];
  supervisors: Option[];
}) {
  return (
    <ActionForm action={saveEmployee} submitLabel={e ? "Save employee" : "Add employee"}>
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Employee no." htmlFor="employee_no">
          <Input id="employee_no" name="employee_no" defaultValue={e?.employee_no} required />
        </Field>
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" defaultValue={e?.full_name} required />
        </Field>
        <Field label="Work email" htmlFor="work_email">
          <Input id="work_email" name="work_email" type="email" defaultValue={e?.work_email ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" defaultValue={e?.phone ?? ""} inputMode="tel" />
        </Field>
        <Field label="Position" htmlFor="position_id">
          <Select id="position_id" name="position_id" defaultValue={e?.position_id ?? ""}>
            <option value="">— None —</option>
            {positions.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Department" htmlFor="department_id">
          <Select id="department_id" name="department_id" defaultValue={e?.department_id ?? ""}>
            <option value="">— None —</option>
            {departments.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Work location" htmlFor="location_id">
          <Select id="location_id" name="location_id" defaultValue={e?.location_id ?? ""}>
            <option value="">— None —</option>
            {locations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Supervisor" htmlFor="supervisor_id" hint="Overdue items escalate to this person.">
          <Select id="supervisor_id" name="supervisor_id" defaultValue={e?.supervisor_id ?? ""}>
            <option value="">— None —</option>
            {supervisors
              .filter((o) => o.id !== e?.id)
              .map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
          </Select>
        </Field>
        <Field label="Hire date" htmlFor="hire_date">
          <Input id="hire_date" name="hire_date" type="date" defaultValue={e?.hire_date ?? ""} />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={e?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="inactive">Inactive (left)</option>
          </Select>
        </Field>
      </div>
    </ActionForm>
  );
}
