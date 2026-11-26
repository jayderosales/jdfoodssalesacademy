import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getAuthState } from "@/lib/auth";
import { getTemplate } from "@/lib/import/templates";

/** Blank Excel template: header row, one example row, and a notes sheet. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const t = getTemplate(key);
  if (!t) return NextResponse.json({ error: "Unknown template." }, { status: 404 });
  const { profile, access } = await getAuthState();
  if (!profile || !access.isInternal) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.label);
  ws.columns = t.fields.map((f) => ({ header: f.key, key: f.key, width: Math.max(14, f.label.length + 2) }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(Object.fromEntries(t.fields.map((f) => [f.key, f.example])));
  const notes = wb.addWorksheet("How to fill in");
  notes.columns = [{ header: "Column", width: 22 }, { header: "Meaning", width: 40 }, { header: "Required", width: 10 }, { header: "Example", width: 26 }];
  notes.getRow(1).font = { bold: true };
  for (const f of t.fields) notes.addRow([f.key, f.label, f.required ? "Yes" : "", f.example]);
  notes.addRow([]);
  notes.addRow(["Tip", "Delete the example row before importing. Dates: 2026-01-15 or 01/15/2026."]);
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="jdfoods-${t.key}-template.xlsx"`,
    },
  });
}
