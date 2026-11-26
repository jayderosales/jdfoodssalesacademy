import Link from "next/link";
import { Download } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { SavedViews } from "@/components/shared/saved-views";
import { Button, Card, Input, Select, Table, Td, Th, buttonVariants } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { cellValue, tableQuery, visibleColumns, type ColumnDef, type TableDef, type TableParams } from "@/lib/table";
import { formatDate } from "@/lib/utils";

function render<Row>(col: ColumnDef<Row>, row: Row) {
  const v = cellValue(col, row);
  const content =
    col.kind === "money" ? formatMoney(v as string)
    : col.kind === "date" ? formatDate(v as string)
    : col.kind === "datetime" ? formatDate(v as string, true)
    : col.kind === "status" ? <StatusBadge status={String(v)} />
    : v == null || v === "" ? "—"
    : String(v);
  return col.href ? <Link href={col.href(row)} className="font-medium text-brand underline">{content}</Link> : content;
}

/**
 * Server-rendered list with search, filters, date range, sorting, paging, column chooser, saved views and Excel export.
 * The page runs the query (applyTableParams) and passes rows + total count.
 */
export function DataTable<Row extends { id: string }>({
  def,
  params,
  rows,
  count,
  savedViews,
  exportable = true,
  empty = "Nothing to show yet.",
}: {
  def: TableDef<Row>;
  params: TableParams;
  rows: Row[];
  count: number;
  savedViews?: { id: string; name: string; query: string; mine: boolean }[];
  exportable?: boolean;
  empty?: string;
}) {
  const cols = visibleColumns(def, params);
  const size = def.pageSize ?? 25;
  const pages = Math.max(1, Math.ceil(count / size));
  const sortLink = (c: ColumnDef<Row>) => {
    const active = params.sort === c.sortColumn;
    return tableQuery(params, { sort: c.sortColumn!, dir: active && params.dir === "desc" ? "asc" : "desc", page: null });
  };

  return (
    <Card>
      <form className="mb-3 flex flex-wrap items-center gap-2">
        {def.search && <Input name="q" defaultValue={params.q} placeholder="Search…" aria-label="Search" className="w-56" />}
        {def.filters?.map((f) => (
          <Select key={f.key} name={f.key} defaultValue={params.filters[f.key] ?? ""} aria-label={f.label} className="w-48">
            <option value="">{`All ${f.label.toLowerCase()}`}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        ))}
        {def.dateColumn && <DateRangePicker from={params.from} to={params.to} />}
        {params.sort && (
          <>
            <input type="hidden" name="sort" value={params.sort} />
            <input type="hidden" name="dir" value={params.dir} />
          </>
        )}
        {params.cols && <input type="hidden" name="cols" value={params.cols.join(",")} />}
        <Button type="submit" variant="outline">Apply</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {savedViews && <SavedViews tableKey={def.key} views={savedViews} current={tableQuery(params, { page: null })} />}
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border px-3 py-2 text-sm hover:bg-muted">Columns</summary>
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border bg-card p-3 shadow-lg">
              {def.columns.map((c) => {
                const on = cols.includes(c);
                const next = on ? cols.filter((x) => x !== c) : [...cols, c];
                const ordered = def.columns.filter((x) => next.includes(x)).map((x) => x.key);
                return (
                  <Link key={c.key} href={tableQuery(params, { cols: ordered.join(",") || null })} className="flex items-center gap-2 py-1 text-sm">
                    <input type="checkbox" readOnly checked={on} className="size-4" tabIndex={-1} /> {c.label}
                  </Link>
                );
              })}
            </div>
          </details>
          {exportable && (
            <a href={`/api/export/${def.key}${tableQuery(params, { page: null })}`} className={buttonVariants({ variant: "outline" })}>
              <Download className="size-4" aria-hidden /> Excel
            </a>
          )}
        </div>
      </form>

      {/* desktop */}
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              {cols.map((c) => (
                <Th key={c.key} className={c.kind === "money" || c.kind === "number" ? "text-right" : undefined}>
                  {c.sortColumn ? (
                    <Link href={sortLink(c)} className="hover:text-foreground">
                      {c.label}
                      {params.sort === c.sortColumn ? (params.dir === "asc" ? " ↑" : " ↓") : ""}
                    </Link>
                  ) : (
                    c.label
                  )}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => (
                  <Td key={c.key} className={c.kind === "money" || c.kind === "number" ? "text-right tabular-nums" : undefined}>
                    {render(c, r)}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      {/* phone: cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border p-3 text-sm">
            {cols.map((c, i) => (
              <div key={c.key} className={i === 0 ? "mb-1 font-medium" : "flex justify-between gap-2"}>
                {i > 0 && <span className="text-muted-foreground">{c.label}</span>}
                <span>{render(c, r)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>

      {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>}
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{count} total</span>
        <span className="flex items-center gap-3">
          {params.page > 0 && <Link href={tableQuery(params, { page: params.page - 1 })} className="text-brand underline">Previous</Link>}
          Page {params.page + 1} of {pages}
          {params.page + 1 < pages && <Link href={tableQuery(params, { page: params.page + 1 })} className="text-brand underline">Next</Link>}
        </span>
      </div>
    </Card>
  );
}
