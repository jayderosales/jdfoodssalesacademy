import "server-only";
import type { Permission } from "@/lib/rbac/permissions";
import type { TableDef } from "@/lib/table";
import { formatMoney } from "@/lib/money";

export interface PettyCashRow {
  id: string;
  number: string;
  amount: string;
  purpose: string;
  status: string;
  needed_on: string | null;
  created_at: string;
  requested_by: string;
  profiles: { full_name: string; email: string } | null;
  departments: { name: string } | null;
}

const STATUS_OPTIONS = ["draft", "submitted", "approved", "returned", "rejected", "cancelled"].map((v) => ({
  value: v,
  label: { draft: "Draft", submitted: "Waiting for approval", approved: "Approved", returned: "Returned", rejected: "Rejected", cancelled: "Cancelled" }[v]!,
}));

export const pettyCashTable: TableDef<PettyCashRow> = {
  key: "petty_cash",
  title: "Petty cash requests",
  table: "petty_cash_requests",
  select: "id, number, amount, purpose, status, needed_on, created_at, requested_by, profiles!petty_cash_requests_requested_by_fkey(full_name, email), departments(name)",
  columns: [
    { key: "number", label: "No.", sortColumn: "number", href: (r) => `/requests/petty-cash/${r.id}` },
    { key: "purpose", label: "Purpose" },
    { key: "amount", label: "Amount", kind: "money", sortColumn: "amount", value: (r) => r.amount },
    { key: "requested_by", label: "Requested by", value: (r) => r.profiles?.full_name || r.profiles?.email || "" },
    { key: "department", label: "Department", optional: true, value: (r) => r.departments?.name ?? "" },
    { key: "needed_on", label: "Needed on", kind: "date", optional: true, sortColumn: "needed_on" },
    { key: "status", label: "Status", kind: "status", sortColumn: "status" },
    { key: "created_at", label: "Created", kind: "datetime", sortColumn: "created_at" },
  ],
  search: ["number", "purpose"],
  filters: [{ key: "status", label: "Status", column: "status", options: STATUS_OPTIONS }],
  dateColumn: "created_at",
  defaultSort: { column: "created_at", ascending: false },
};

export interface EmployeeRow {
  id: string;
  employee_no: string;
  full_name: string;
  work_email: string | null;
  status: string;
  hire_date: string | null;
  positions: { title: string } | null;
  departments: { name: string } | null;
  locations: { name: string } | null;
}

export const employeesTable: TableDef<EmployeeRow> = {
  key: "employees",
  title: "Employees",
  table: "employees",
  select: "id, employee_no, full_name, work_email, status, hire_date, positions(title), departments(name), locations(name)",
  columns: [
    { key: "employee_no", label: "No.", sortColumn: "employee_no" },
    { key: "full_name", label: "Name", sortColumn: "full_name", href: (r) => `/admin/org/employees/${r.id}` },
    { key: "position", label: "Position", value: (r) => r.positions?.title ?? "" },
    { key: "department", label: "Department", value: (r) => r.departments?.name ?? "" },
    { key: "location", label: "Location", optional: true, value: (r) => r.locations?.name ?? "" },
    { key: "work_email", label: "Email", optional: true },
    { key: "hire_date", label: "Hired", kind: "date", sortColumn: "hire_date" },
    { key: "status", label: "Status", kind: "status", sortColumn: "status" },
  ],
  search: ["full_name", "employee_no", "work_email"],
  filters: [
    { key: "status", label: "Status", column: "status", options: [{ value: "active", label: "Active" }, { value: "on_leave", label: "On leave" }, { value: "inactive", label: "Left" }] },
  ],
  defaultSort: { column: "full_name", ascending: true },
};

/** Tables that can be exported to Excel, and the permission needed to try (RLS still filters the rows). */
export const EXPORTABLE: Record<string, { def: TableDef<never>; perm?: Permission[] }> = {
  petty_cash: { def: pettyCashTable as TableDef<never> },
  employees: { def: employeesTable as TableDef<never>, perm: ["org.view", "readonly.all"] },
};

export function exportValue(kind: string | undefined, v: unknown): string | number {
  if (v == null) return "";
  if (kind === "money") return Number(v);
  if (kind === "datetime") return new Date(String(v)).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  return typeof v === "number" ? v : String(v);
}

export { formatMoney };
