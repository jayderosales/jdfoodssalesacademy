/**
 * Server-side data tables: one definition drives the list page, its filters, saved views and the Excel export.
 * Definitions live in src/lib/tables/*.ts and are registered in src/lib/tables/registry.ts.
 */

export type ColumnKind = "text" | "money" | "date" | "datetime" | "status" | "number";

export interface ColumnDef<Row = Record<string, unknown>> {
  key: string;
  label: string;
  kind?: ColumnKind;
  /** value shown/exported; defaults to row[key] */
  value?: (row: Row) => unknown;
  /** makes the cell a link */
  href?: (row: Row) => string;
  /** database column used for sorting; omit to make the column unsortable */
  sortColumn?: string;
  /** hidden unless chosen in the column chooser */
  optional?: boolean;
}

export interface FilterDef {
  key: string;
  label: string;
  column: string;
  options: { value: string; label: string }[];
}

export interface TableDef<Row = Record<string, unknown>> {
  key: string;
  title: string;
  table: string;
  select: string;
  columns: ColumnDef<Row>[];
  /** columns searched by the search box (ilike) */
  search?: string[];
  filters?: FilterDef[];
  /** column used by the date-range filter */
  dateColumn?: string;
  defaultSort: { column: string; ascending: boolean };
  pageSize?: number;
}

export interface TableParams {
  q: string;
  page: number;
  sort?: string;
  dir: "asc" | "desc";
  filters: Record<string, string>;
  cols?: string[];
  from?: string;
  to?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseTableParams(def: TableDef<never>, sp: Record<string, string | string[] | undefined>): TableParams {
  const get = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) ?? "";
  const filters: Record<string, string> = {};
  for (const f of def.filters ?? []) {
    const v = get(f.key);
    // filters whose options are loaded at request time (e.g. brands) accept any safe id-like value
    if (v && (f.options.length ? f.options.some((o) => o.value === v) : /^[\w-]{1,60}$/.test(v))) filters[f.key] = v;
  }
  const sortable = new Set(def.columns.map((c) => c.sortColumn).filter(Boolean));
  const sort = get("sort");
  const cols = get("cols");
  const from = get("date_from");
  const to = get("date_to");
  return {
    q: get("q").replace(/[%,()*]/g, "").trim().slice(0, 80),
    page: Math.max(0, Math.min(10_000, Number(get("page")) || 0)),
    sort: sortable.has(sort) ? sort : undefined,
    dir: get("dir") === "asc" ? "asc" : "desc",
    filters,
    cols: cols ? cols.split(",").filter((k) => def.columns.some((c) => c.key === k)) : undefined,
    from: DATE.test(from) ? from : undefined,
    to: DATE.test(to) ? to : undefined,
  };
}

/** Columns to show: all non-optional ones, or exactly the chosen ones. */
export function visibleColumns<Row>(def: TableDef<Row>, params: Pick<TableParams, "cols">): ColumnDef<Row>[] {
  if (params.cols?.length) return def.columns.filter((c) => params.cols!.includes(c.key));
  return def.columns.filter((c) => !c.optional);
}

/** Query string for the current state, with overrides (null removes a key). */
export function tableQuery(params: TableParams, overrides: Record<string, string | number | null> = {}): string {
  const out = new URLSearchParams();
  if (params.q) out.set("q", params.q);
  for (const [k, v] of Object.entries(params.filters)) out.set(k, v);
  if (params.sort) {
    out.set("sort", params.sort);
    out.set("dir", params.dir);
  }
  if (params.cols?.length) out.set("cols", params.cols.join(","));
  if (params.from) out.set("date_from", params.from);
  if (params.to) out.set("date_to", params.to);
  if (params.page) out.set("page", String(params.page));
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === "") out.delete(k);
    else out.set(k, String(v));
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** Minimal shape of the Supabase query builder we use (keeps this file framework-free and testable). */
interface Query {
  or(f: string): Query;
  eq(c: string, v: string): Query;
  gte(c: string, v: string): Query;
  lte(c: string, v: string): Query;
  order(c: string, o: { ascending: boolean }): Query;
  range(a: number, b: number): Query;
}

export function applyTableParams<Q extends Query>(q: Q, def: TableDef<never>, params: TableParams, opts: { all?: boolean } = {}): Q {
  let query: Query = q;
  if (params.q && def.search?.length) query = query.or(def.search.map((c) => `${c}.ilike.%${params.q}%`).join(","));
  for (const f of def.filters ?? []) if (params.filters[f.key]) query = query.eq(f.column, params.filters[f.key]);
  if (def.dateColumn && params.from) query = query.gte(def.dateColumn, `${params.from}T00:00:00+08:00`);
  if (def.dateColumn && params.to) query = query.lte(def.dateColumn, `${params.to}T23:59:59.999+08:00`);
  query = params.sort ? query.order(params.sort, { ascending: params.dir === "asc" }) : query.order(def.defaultSort.column, { ascending: def.defaultSort.ascending });
  const size = def.pageSize ?? 25;
  query = opts.all ? query.range(0, 9999) : query.range(params.page * size, params.page * size + size - 1);
  return query as Q;
}

export function cellValue<Row>(col: ColumnDef<Row>, row: Row): unknown {
  return col.value ? col.value(row) : (row as Record<string, unknown>)[col.key];
}
