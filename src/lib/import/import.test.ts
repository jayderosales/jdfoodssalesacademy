import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { autoMap, getTemplate, normalizeDate, validateRows } from "./templates";

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines, CRLF, BOM and blank lines", () => {
    const text = '﻿Emp No,Name,Note\r\n0001,"Dela Cruz, Juan","line1\nline2"\r\n\r\n0002,"Ana ""Bing"" Reyes",\r\n';
    expect(parseCsv(text)).toEqual([
      ["Emp No", "Name", "Note"],
      ["0001", "Dela Cruz, Juan", "line1\nline2"],
      ["0002", 'Ana "Bing" Reyes', ""],
    ]);
  });
  it("detects semicolon-separated files (European Excel)", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("normalizeDate", () => {
  it("accepts ISO, US and Excel serial dates and rejects impossible ones", () => {
    expect(normalizeDate("2026-1-5")).toBe("2026-01-05");
    expect(normalizeDate("01/15/2026")).toBe("2026-01-15");
    expect(normalizeDate("46037")).toBe("2026-01-15");
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(normalizeDate("15.01.2026")).toBeNull();
  });
});

describe("employee import", () => {
  const t = getTemplate("employees")!;
  it("auto-maps common header names", () => {
    const m = autoMap(t, ["Employee Number", "Name", "Email", "Dept", "Reports To", "Date Hired"]);
    expect(m).toMatchObject({ employee_no: 0, full_name: 1, work_email: 2, department: 3, supervisor_no: 4, hire_date: 5, phone: -1 });
  });
  it("reports row-level errors and duplicates", () => {
    const m = autoMap(t, ["employee_no", "full_name", "work_email", "hire_date", "status"]);
    const res = validateRows(t, [
      ["0001", "Juan Dela Cruz", "juan@jdfoods.ph", "2026-01-15", "Active"],
      ["", "No Number", "", "", ""],
      ["0003", "Bad Email", "not-an-email", "31/31/2026", "fired"],
      ["0001", "Duplicate", "", "", ""],
    ], m);
    expect(res[0]).toEqual({ row: 1, values: { employee_no: "0001", full_name: "Juan Dela Cruz", work_email: "juan@jdfoods.ph", hire_date: "2026-01-15", status: "active" }, errors: [] });
    expect(res[1].errors).toEqual(["Employee no. is required."]);
    expect(res[2].errors).toHaveLength(3);
    expect(res[3].errors).toEqual(["Same Employee no. as row 1."]);
  });
});

describe("location import", () => {
  it("normalises type and yes/no answers", () => {
    const t = getTemplate("locations")!;
    const res = validateRows(t, [["wh-qc", "QC Warehouse", "Pickup Hub", "oo", "no"]], { code: 0, name: 1, type: 2, holds_inventory: 3, is_pickup_point: 4, address: -1, city: -1 });
    expect(res[0].values).toEqual({ code: "WH-QC", name: "QC Warehouse", type: "pickup_hub", holds_inventory: true, is_pickup_point: false });
  });
});
