import { z } from "zod";
import type { Permission } from "@/lib/rbac/permissions";

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  /** other header names that should map to this field automatically */
  aliases?: string[];
  example: string;
  schema: z.ZodType<unknown>;
}

export interface ImportTemplate {
  key: string;
  label: string;
  description: string;
  rpc: string;
  perm: Permission;
  fields: ImportField[];
}

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const d = normalizeDate(v);
    if (!d) ctx.addIssue({ code: "custom", message: "Use a date like 2026-01-15 or 01/15/2026." });
    return d ?? undefined;
  });
const yesNo = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return false;
    if (/^(y|yes|true|1|oo)$/i.test(v)) return true;
    if (/^(n|no|false|0|hindi)$/i.test(v)) return false;
    ctx.addIssue({ code: "custom", message: "Use Yes or No." });
    return false;
  });

/** Accepts YYYY-MM-DD, MM/DD/YYYY and Excel serial numbers. Returns YYYY-MM-DD or null. */
export function normalizeDate(v: string): string | null {
  let y: number, m: number, d: number;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) [y, m, d] = v.split("-").map(Number);
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) [m, d, y] = v.split("/").map(Number);
  else if (/^\d{5}$/.test(v)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86400000);
    return dt.toISOString().slice(0, 10);
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export const TEMPLATES: ImportTemplate[] = [
  {
    key: "employees",
    label: "Employees",
    description: "Adds new employees and updates existing ones (matched by employee number). Supervisors are linked by their employee number.",
    rpc: "import_employees",
    perm: "employees.manage",
    fields: [
      { key: "employee_no", label: "Employee no.", required: true, aliases: ["emp no", "employee number", "id no", "employee id"], example: "0001", schema: text(30).min(1, "Required.") },
      { key: "full_name", label: "Full name", required: true, aliases: ["name", "employee name"], example: "Juan Dela Cruz", schema: text(120).min(2, "Required.") },
      { key: "work_email", label: "Work email", aliases: ["email"], example: "juan@jdfoods.ph", schema: z.string().trim().optional().transform((v) => v || undefined).pipe(z.string().email("Not a valid email.").optional()) },
      { key: "phone", label: "Phone", aliases: ["mobile", "contact"], example: "09171234567", schema: optionalText(40) },
      { key: "position", label: "Position", aliases: ["job title", "title"], example: "Sales Representative", schema: optionalText(120) },
      { key: "department", label: "Department (name or code)", aliases: ["dept"], example: "Sales", schema: optionalText(120) },
      { key: "location", label: "Location (name or code)", aliases: ["branch", "site"], example: "Kamuning office", schema: optionalText(120) },
      { key: "supervisor_no", label: "Supervisor's employee no.", aliases: ["supervisor", "reports to", "manager no"], example: "0000", schema: optionalText(30) },
      { key: "hire_date", label: "Hire date", aliases: ["date hired", "start date"], example: "2026-01-15", schema: optionalDate },
      {
        key: "status",
        label: "Status",
        example: "active",
        schema: z.string().trim().optional().transform((v) => (v ? v.toLowerCase().replace(" ", "_") : undefined)).pipe(z.enum(["active", "on_leave", "inactive"], { message: "Use active, on leave or inactive." }).optional()),
      },
    ],
  },
  {
    key: "locations",
    label: "Locations",
    description: "Adds new locations and updates existing ones (matched by code).",
    rpc: "import_locations",
    perm: "admin.org.manage",
    fields: [
      { key: "code", label: "Code", required: true, example: "WH-QC", schema: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/, "2–20 letters, numbers, - or _.") },
      { key: "name", label: "Name", required: true, example: "Quezon City warehouse", schema: text(120).min(2, "Required.") },
      {
        key: "type",
        label: "Type",
        required: true,
        example: "warehouse",
        schema: z.string().trim().toLowerCase().transform((v) => v.replace(/\s+/g, "_")).pipe(z.enum(["office", "plant", "warehouse", "pickup_hub", "business_center"], { message: "Use office, plant, warehouse, pickup hub or business center." })),
      },
      { key: "holds_inventory", label: "Holds inventory (Yes/No)", example: "Yes", schema: yesNo },
      { key: "is_pickup_point", label: "Courier pickup point (Yes/No)", aliases: ["pickup point"], example: "Yes", schema: yesNo },
      { key: "address", label: "Address", example: "123 Example St.", schema: optionalText(300) },
      { key: "city", label: "City", example: "Quezon City", schema: optionalText(80) },
    ],
  },
];

const money = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const n = v.replace(/[₱,\s]/g, "");
    if (!/^\d+(\.\d{1,6})?$/.test(n)) ctx.addIssue({ code: "custom", message: "Use a number like 256 or 85.50." });
    return n;
  });
const positiveQty = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = v.replace(/,/g, "");
    if (!/^\d+(\.\d{1,4})?$/.test(n) || Number(n) <= 0) ctx.addIssue({ code: "custom", message: "Use a quantity greater than 0." });
    return n;
  });

TEMPLATES.push(
  {
    key: "products",
    label: "Products",
    description: "Adds new products and updates existing ones (matched by SKU). Brand and category by name; new categories are created. Cost is optional (per base unit).",
    rpc: "import_products",
    perm: "inventory.products.manage",
    fields: [
      { key: "sku", label: "SKU", required: true, aliases: ["code", "item code"], example: "P1-1L", schema: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,39}$/, "Capital letters, numbers and dashes.") },
      { key: "name", label: "Name", required: true, aliases: ["product", "description", "product name"], example: "Premium Sweet Barbecue 1 liter", schema: text(200).min(2, "Required.") },
      { key: "brand", label: "Brand", example: "JD Foods", schema: optionalText(80) },
      { key: "category", label: "Category", example: "Premium Sauces", schema: optionalText(80) },
      {
        key: "item_type",
        label: "Type",
        aliases: ["item type"],
        example: "finished_good",
        schema: z.string().trim().optional().transform((v) => (v ? v.toLowerCase().replace(/\s+/g, "_") : undefined)).pipe(z.enum(["finished_good", "raw_material", "packaging", "merchandise", "service", "bundle"], { message: "Use finished good, merchandise, raw material, packaging, bundle or service." }).optional()),
      },
      { key: "base_unit", label: "Unit (pc, pack, bottle…)", aliases: ["unit", "uom"], example: "bottle", schema: z.string().trim().toLowerCase().optional().transform((v) => v || undefined).pipe(z.string().regex(/^[a-z]{1,12}$/, "Use a unit like pc, pack or bottle.").optional()) },
      { key: "size", label: "Size", example: "1 liter", schema: optionalText(60) },
      { key: "srp", label: "SRP", aliases: ["price", "retail price"], example: "256", schema: money },
      { key: "cost", label: "Cost per unit", aliases: ["unit cost"], example: "120", schema: money },
      { key: "shelf_life_days", label: "Shelf life (days)", aliases: ["shelf life"], example: "365", schema: z.string().trim().optional().transform((v, ctx) => { if (!v) return undefined; if (!/^\d{1,4}$/.test(v)) ctx.addIssue({ code: "custom", message: "Whole number of days." }); return v; }) },
      { key: "pre_order", label: "Pre-order (Yes/No)", example: "No", schema: yesNo },
      { key: "notes", label: "Notes", example: "", schema: optionalText(1000) },
    ],
  },
  {
    key: "opening_stock",
    label: "Opening stock",
    description: "Brings in the stock you have today, by product, location, bin and lot, with its cost. Posted as released stock. Run it once, after products are imported.",
    rpc: "import_opening_stock",
    perm: "inventory.receive",
    fields: [
      { key: "sku", label: "SKU", required: true, aliases: ["code"], example: "P1-1L", schema: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,39}$/, "Not a valid SKU.") },
      { key: "location", label: "Location (code or name)", required: true, aliases: ["warehouse"], example: "PLR-FG", schema: text(120).min(2, "Required.") },
      { key: "bin", label: "Bin", example: "DEFAULT", schema: optionalText(30) },
      { key: "lot_no", label: "Lot no.", aliases: ["lot", "batch"], example: "L2026-05-01", schema: optionalText(60) },
      { key: "mfg_date", label: "Manufactured", aliases: ["mfg date"], example: "2026-05-01", schema: optionalDate },
      { key: "expiry_date", label: "Expiry", aliases: ["expiry", "exp date", "best before"], example: "2027-05-01", schema: optionalDate },
      { key: "qty", label: "Quantity", required: true, aliases: ["quantity", "on hand"], example: "120", schema: positiveQty },
      { key: "unit", label: "Unit (blank = base unit)", example: "", schema: z.string().trim().toLowerCase().optional().transform((v) => v || undefined) },
      { key: "unit_cost", label: "Cost per unit", aliases: ["cost"], example: "120", schema: money },
    ],
  },
);

export function getTemplate(key: string) {
  return TEMPLATES.find((t) => t.key === key);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Guess which file column feeds each field, by header name. Returns field key → column index (or -1). */
export function autoMap(template: ImportTemplate, headers: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of template.fields) {
    const names = [f.key, f.label, ...(f.aliases ?? [])].map(norm);
    const idx = headers.findIndex((h, i) => !used.has(i) && names.some((n) => norm(h) === n || (n.length > 4 && norm(h).startsWith(n))));
    out[f.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return out;
}

export interface RowResult {
  row: number; // 1-based data row (header excluded)
  values: Record<string, unknown>;
  errors: string[];
}

/** Validate every row; also flags duplicate keys within the file. */
export function validateRows(template: ImportTemplate, rows: string[][], mapping: Record<string, number>): RowResult[] {
  const keyField = template.fields[0].key;
  const seen = new Map<string, number>();
  return rows.map((cells, i) => {
    const values: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const f of template.fields) {
      const idx = mapping[f.key] ?? -1;
      const raw = idx >= 0 ? (cells[idx] ?? "").trim() : "";
      if (f.required && !raw) {
        errors.push(`${f.label} is required.`);
        continue;
      }
      const r = f.schema.safeParse(raw);
      if (r.success) {
        if (r.data !== undefined) values[f.key] = r.data;
      } else errors.push(`${f.label}: ${r.error.issues[0].message}`);
    }
    const k = String(values[keyField] ?? "").toUpperCase();
    if (k) {
      if (seen.has(k)) errors.push(`Same ${template.fields[0].label} as row ${seen.get(k)}.`);
      else seen.set(k, i + 1);
    }
    return { row: i + 1, values, errors };
  });
}
