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



export function exportValue(kind: string | undefined, v: unknown): string | number {
  if (v == null) return "";
  if (kind === "money") return Number(v);
  if (kind === "datetime") return new Date(String(v)).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  return typeof v === "number" ? v : String(v);
}

export { formatMoney };

// ---------------------------------------------------------------- inventory
export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  item_type: string;
  base_unit: string;
  size_label: string;
  srp: string | null;
  active: boolean;
  pre_order: boolean;
  stock_available_qty: string | number | null; // computed column (migration 20261210000002)
  brands: { name: string } | null;
  product_categories: { name: string } | null;
}

export const ITEM_TYPE_LABEL: Record<string, string> = {
  finished_good: "Finished good",
  merchandise: "Merchandise",
  raw_material: "Raw material",
  packaging: "Packaging",
  bundle: "Bundle",
  service: "Service",
};

/** Built per request so brand/category filters list the current options. */
export function productsTableDef(brands: { id: string; name: string }[], categories: { id: string; name: string }[]): TableDef<ProductRow> {
  return {
    key: "products",
    title: "Products",
    table: "products",
    select: "id, sku, name, item_type, base_unit, size_label, srp, active, pre_order, stock_available_qty, brands(name), product_categories(name)",
    columns: [
      { key: "sku", label: "SKU", sortColumn: "sku", href: (r) => `/inventory/products/${r.id}` },
      { key: "name", label: "Name", sortColumn: "name" },
      { key: "brand", label: "Brand", value: (r) => r.brands?.name ?? "" },
      { key: "category", label: "Category", value: (r) => r.product_categories?.name ?? "" },
      { key: "item_type", label: "Type", optional: true, value: (r) => ITEM_TYPE_LABEL[r.item_type] ?? r.item_type },
      { key: "size_label", label: "Size", optional: true },
      { key: "base_unit", label: "Unit", optional: true },
      { key: "srp", label: "SRP", kind: "money", sortColumn: "srp" },
      {
        key: "available",
        label: "Available",
        kind: "number",
        sortColumn: "stock_available_qty",
        value: (r) => (r.item_type === "service" ? "" : `${Number(r.stock_available_qty ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} ${r.base_unit}`),
      },
      { key: "active", label: "Status", kind: "status", value: (r) => (r.active ? "active" : "inactive") },
    ],
    search: ["sku", "name"],
    filters: [
      { key: "brand", label: "Brands", column: "brand_id", options: brands.map((b) => ({ value: b.id, label: b.name })) },
      { key: "category", label: "Categories", column: "category_id", options: categories.map((c) => ({ value: c.id, label: c.name })) },
      { key: "type", label: "Types", column: "item_type", options: Object.entries(ITEM_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
      { key: "active", label: "Statuses", column: "active", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
    ],
    defaultSort: { column: "sku", ascending: true },
    pageSize: 50,
  };
}

export interface StockRow {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  base_unit: string;
  location_name: string;
  bin_code: string;
  lot_no: string;
  expiry_date: string | null;
  qa_status: string;
  on_hand: string;
  reserved: string;
  avg_cost: string | null;
  value: string | null;
  days_to_expiry: number | null;
}

const QA_OPTIONS = [
  { value: "released", label: "Released" },
  { value: "quarantine", label: "Quarantine" },
  { value: "on_hold", label: "On hold" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

export function stockTableDef(locations: { id: string; name: string }[], brands: { id: string; name: string }[]): TableDef<StockRow> {
  return {
    key: "stock",
    title: "Stock on hand",
    table: "stock_on_hand",
    select: "id, product_id, sku, product_name, base_unit, location_name, bin_code, lot_no, expiry_date, qa_status, on_hand, reserved, avg_cost, value, days_to_expiry",
    columns: [
      { key: "sku", label: "SKU", sortColumn: "sku", href: (r) => `/inventory/products/${r.product_id}?tab=stock` },
      { key: "product_name", label: "Product" },
      { key: "location_name", label: "Location", sortColumn: "location_name" },
      { key: "bin_code", label: "Bin", optional: true },
      { key: "lot_no", label: "Lot", sortColumn: "lot_no" },
      { key: "expiry_date", label: "Expiry", kind: "date", sortColumn: "expiry_date" },
      { key: "qa_status", label: "QA", kind: "status", sortColumn: "qa_status" },
      { key: "on_hand", label: "On hand", kind: "number", sortColumn: "on_hand", value: (r) => Number(r.on_hand) },
      { key: "reserved", label: "Reserved", kind: "number", optional: true, value: (r) => Number(r.reserved) },
      { key: "avg_cost", label: "Unit cost", kind: "money", optional: true },
      { key: "value", label: "Value", kind: "money", sortColumn: "value" },
    ],
    search: ["sku", "product_name", "lot_no"],
    filters: [
      { key: "location", label: "Locations", column: "location_id", options: locations.map((l) => ({ value: l.id, label: l.name })) },
      { key: "brand", label: "Brands", column: "brand_id", options: brands.map((b) => ({ value: b.id, label: b.name })) },
      { key: "qa", label: "QA statuses", column: "qa_status", options: QA_OPTIONS },
    ],
    defaultSort: { column: "sku", ascending: true },
    pageSize: 50,
  };
}

/** Tables that can be exported to Excel, and the permission needed to try (RLS still filters the rows). */
export const EXPORTABLE: Record<string, { def: TableDef<never>; perm?: Permission[] }> = {
  petty_cash: { def: pettyCashTable as TableDef<never> },
  employees: { def: employeesTable as TableDef<never>, perm: ["org.view", "readonly.all"] },
  products: { def: productsTableDef([], []) as unknown as TableDef<never>, perm: ["inventory.view"] },
  stock: { def: stockTableDef([], []) as unknown as TableDef<never>, perm: ["inventory.view"] },
};
