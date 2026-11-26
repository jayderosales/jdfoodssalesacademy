"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { parseCsv } from "@/lib/import/csv";
import { getTemplate, validateRows, type RowResult } from "@/lib/import/templates";
import { createClient } from "@/lib/supabase/server";

const MAX_ROWS = 5000;

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    return "";
  }
  return String(v);
}

export type ParsedFile = { error?: string; filename?: string; headers?: string[]; rows?: string[][] };

/** Step 1: read an uploaded CSV or Excel file into header + rows (first sheet). Nothing is saved. */
export async function parseImportFile(form: FormData): Promise<ParsedFile> {
  const template = getTemplate(String(form.get("template")));
  if (!template) return { error: "Choose what you're importing." };
  await requirePermission(template.perm);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (file.size > 8 * 1024 * 1024) return { error: "The file is larger than 8 MB. Split it into smaller files." };

  let table: string[][];
  try {
    if (/\.xlsx$/i.test(file.name)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ExcelJS.Buffer);
      const ws = wb.worksheets[0];
      table = [];
      ws?.eachRow({ includeEmpty: false }, (row) => {
        const values = (row.values as ExcelJS.CellValue[]).slice(1);
        table.push(values.map(cellText));
      });
    } else if (/\.(csv|txt)$/i.test(file.name)) {
      table = parseCsv(await file.text());
    } else {
      return { error: "Use a .xlsx or .csv file. (Old .xls files: open in Excel and Save As .xlsx.)" };
    }
  } catch {
    return { error: "That file couldn't be read. Make sure it's a normal Excel or CSV file." };
  }
  if (table.length < 2) return { error: "The file needs a header row and at least one data row." };
  if (table.length - 1 > MAX_ROWS) return { error: `The file has more than ${MAX_ROWS} rows. Split it into smaller files.` };
  const width = Math.max(...table.map((r) => r.length));
  return { filename: file.name, headers: table[0].map((h, i) => h.trim() || `Column ${i + 1}`), rows: table.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")) };
}

/** Step 3: validate every row with the chosen column mapping. Nothing is saved. */
export async function validateImport(templateKey: string, rows: string[][], mapping: Record<string, number>): Promise<{ error?: string; results?: RowResult[] }> {
  const template = getTemplate(templateKey);
  if (!template) return { error: "Unknown import." };
  await requirePermission(template.perm);
  const missing = template.fields.filter((f) => f.required && (mapping[f.key] ?? -1) < 0);
  if (missing.length) return { error: `Choose a column for: ${missing.map((f) => f.label).join(", ")}.` };
  return { results: validateRows(template, rows.slice(0, MAX_ROWS), mapping) };
}

/** Step 5: import everything in one transaction (all rows or none). */
export async function commitImport(templateKey: string, filename: string, rows: string[][], mapping: Record<string, number>): Promise<{ error?: string; created?: number; updated?: number }> {
  const template = getTemplate(templateKey);
  if (!template) return { error: "Unknown import." };
  await requirePermission(template.perm);
  const results = validateRows(template, rows.slice(0, MAX_ROWS), mapping);
  const bad = results.filter((r) => r.errors.length);
  if (bad.length) return { error: `${bad.length} row(s) still have errors. Fix them in the file and upload it again.` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(template.rpc, { p_rows: results.map((r) => r.values) });
  const counts = (data as { created: number; updated: number } | null) ?? { created: 0, updated: 0 };
  await supabase.from("import_jobs").insert({
    template: template.key,
    filename: filename.slice(0, 200),
    status: error ? "failed" : "committed",
    total_rows: results.length,
    created_count: counts.created,
    updated_count: counts.updated,
    error: error ? error.message.slice(0, 500) : "",
  });
  if (error) {
    return { error: /row-level security/.test(error.message) ? "You don't have permission to import this." : `Nothing was imported: ${error.message}` };
  }
  revalidatePath("/admin/import");
  return counts;
}
