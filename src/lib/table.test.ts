import { describe, expect, it } from "vitest";
import { applyTableParams, parseTableParams, tableQuery, visibleColumns, type TableDef } from "./table";

const def: TableDef<never> = {
  key: "t",
  title: "T",
  table: "t",
  select: "*",
  columns: [
    { key: "number", label: "No.", sortColumn: "number" },
    { key: "amount", label: "Amount", kind: "money", sortColumn: "amount" },
    { key: "note", label: "Note", optional: true },
  ],
  search: ["number", "purpose"],
  filters: [{ key: "status", label: "Status", column: "status", options: [{ value: "draft", label: "Draft" }] }],
  dateColumn: "created_at",
  defaultSort: { column: "created_at", ascending: false },
  pageSize: 10,
};

describe("parseTableParams", () => {
  it("keeps only known filters, sortable columns and valid dates; strips query syntax from search", () => {
    const p = parseTableParams(def, { q: "PCR-1,(x)%", status: "draft", sort: "amount", dir: "asc", page: "2", date_from: "2026-12-01", date_to: "bad" });
    expect(p).toMatchObject({ q: "PCR-1x", filters: { status: "draft" }, sort: "amount", dir: "asc", page: 2, from: "2026-12-01", to: undefined });
    const bad = parseTableParams(def, { status: "hacked", sort: "password" });
    expect(bad.filters).toEqual({});
    expect(bad.sort).toBeUndefined();
  });
});

describe("visibleColumns / tableQuery", () => {
  it("hides optional columns unless chosen", () => {
    expect(visibleColumns(def as TableDef, {}).map((c) => c.key)).toEqual(["number", "amount"]);
    expect(visibleColumns(def as TableDef, { cols: ["note"] }).map((c) => c.key)).toEqual(["note"]);
  });
  it("round-trips the state into a query string", () => {
    const p = parseTableParams(def, { q: "fuel", status: "draft", page: "3" });
    expect(tableQuery(p, { page: null })).toBe("?q=fuel&status=draft");
  });
});

describe("applyTableParams", () => {
  it("builds the database query", () => {
    const calls: string[] = [];
    const q = new Proxy({}, { get: (_, m: string) => (...a: unknown[]) => (calls.push(`${m}(${JSON.stringify(a)})`), q) }) as never;
    applyTableParams(q, def, parseTableParams(def, { q: "fuel", status: "draft", page: "1", date_from: "2026-12-01" }));
    expect(calls).toEqual([
      'or(["number.ilike.%fuel%,purpose.ilike.%fuel%"])',
      'eq(["status","draft"])',
      'gte(["created_at","2026-12-01T00:00:00+08:00"])',
      'order(["created_at",{"ascending":false}])',
      "range([10,19])",
    ]);
  });
});
