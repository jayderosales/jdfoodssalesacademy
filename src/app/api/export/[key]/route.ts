import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { can, getAuthState } from "@/lib/auth";
import { applyTableParams, cellValue, parseTableParams, visibleColumns } from "@/lib/table";
import { EXPORTABLE, exportValue } from "@/lib/tables/registry";
import { createClient } from "@/lib/supabase/server";

/** Excel export of any registered table, with the same filters as the screen. RLS decides which rows are included. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const entry = EXPORTABLE[key];
  if (!entry) return NextResponse.json({ error: "Unknown table." }, { status: 404 });
  const { profile, access } = await getAuthState();
  if (!profile || profile.status !== "active" || !access.isInternal || (access.mfaRequired && !access.mfaOk)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  if (entry.perm && !can(access, entry.perm)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const def = entry.def;
  const tp = parseTableParams(def, Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  // (cast: the generic query builder type is too deep for TypeScript when the table name is dynamic)
  const base = supabase.from(def.table).select(def.select) as unknown as Parameters<typeof applyTableParams>[0];
  const { data, error } = (await applyTableParams(base, def, tp, { all: true })) as unknown as { data: unknown[] | null; error: { message: string } | null };
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const cols = visibleColumns(def, tp);
  const wb = new ExcelJS.Workbook();
  wb.creator = "JD Foods OS";
  const ws = wb.addWorksheet(def.title.slice(0, 31));
  ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 4), style: c.kind === "money" ? { numFmt: '"₱"#,##0.00' } : {} }));
  ws.getRow(1).font = { bold: true };
  for (const row of (data as never[] | null) ?? []) {
    ws.addRow(Object.fromEntries(cols.map((c) => [c.key, exportValue(c.kind, cellValue(c, row))])));
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${key}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
