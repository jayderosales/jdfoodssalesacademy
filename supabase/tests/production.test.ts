/**
 * Manufacturing (first step): daily production reports. Record only (no stock movement), finished goods only,
 * locked once submitted, unique lot per product, visible to the author and production/QA/management.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const u = (n: number) => `72000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const sup = u(1); // production supervisor
const sup2 = u(2);
const qa = u(3);
const ops = u(4);
const staff = u(5);
const wh = u(6);
let plant = "";
let sauce = "";
let flour = "";

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const newReport = async (by = sup) => (await t.as<{ id: string; number: string; status: string }>(by, `insert into public.production_reports (number, location_id, status) values ('', $1, 'submitted') returning id, number, status`, [plant]))[0];
const addLine = (by: string, report: string, product: string, lot: string, qty = 120) =>
  t.as<{ id: string; lot_no: string; expiry_date: string | null; unit_code: string }>(by, `insert into public.production_report_lines (report_id, product_id, qty, unit_code, lot_no, mfg_date) values ($1, $2, $3, '', $4, '2026-11-26') returning id, lot_no, expiry_date::text, unit_code`, [report, product, qty, lot]);

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(sup, "sup@z.ph", ["manufacturing"]);
  await t.createUser(sup2, "sup2@z.ph", ["manufacturing"]);
  await t.createUser(qa, "qa@z.ph", ["qa"]);
  await t.createUser(ops, "ops@z.ph", ["operations_manager"]);
  await t.createUser(staff, "staff@z.ph", ["employee"]);
  await t.createUser(wh, "wh@z.ph", ["warehouse"]);
  plant = (await one<{ id: string }>(`select id from public.locations where type in ('plant', 'warehouse') and active order by type = 'plant' desc limit 1`)).id;
  sauce = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit, shelf_life_days, srp) values ('P9-1L', 'Garlic Sauce 1L', 'finished_good', 'bottle', 365, 99) returning id`))[0].id;
  flour = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit) values ('RM-FLR', 'Flour', 'raw_material', 'kg') returning id`))[0].id;
});

describe("daily production reports", () => {
  it("the supervisor records output; expiry defaults from shelf life; only finished goods", async () => {
    const r = await newReport();
    expect(r).toMatchObject({ status: "draft" });
    expect(r.number).toMatch(/^DPR-/);
    const [line] = await addLine(sup, r.id, sauce, " l-1126a ");
    expect(line).toMatchObject({ lot_no: "L-1126A", unit_code: "bottle", expiry_date: "2027-11-26" });
    await expect(addLine(sup, r.id, flour, "X1")).rejects.toThrow(/finished good/);
    await expect(t.as(staff, `insert into public.production_reports (number, location_id) values ('', $1)`, [plant])).rejects.toThrow(/row-level security/);
  });

  it("submitting locks the report, doesn't move stock, and blocks a repeated lot", async () => {
    const before = (await one<{ n: number }>(`select count(*)::int n from public.stock_movements`)).n;
    const r = await newReport();
    await expect(t.as(sup, `select public.submit_production_report($1)`, [r.id])).rejects.toThrow(/Add what was produced/);
    await addLine(sup, r.id, sauce, "L-1127A");
    await t.as(sup, `select public.submit_production_report($1)`, [r.id]);
    expect((await one<{ status: string }>(`select status from public.production_reports where id = $1`, [r.id])).status).toBe("submitted");
    await expect(addLine(sup, r.id, sauce, "L-1127B")).rejects.toThrow();
    await expect(t.db.query(`update public.production_reports set notes = 'x' where id = $1`, [r.id])).rejects.toThrow(/locked/);
    await expect(t.db.query(`delete from public.production_reports where id = $1`, [r.id])).rejects.toThrow(/can't be deleted/);
    expect((await one<{ n: number }>(`select count(*)::int n from public.stock_movements`)).n).toBe(before); // record only

    const r2 = await newReport(sup2);
    await addLine(sup2, r2.id, sauce, "l-1127a");
    await expect(t.as(sup2, `select public.submit_production_report($1)`, [r2.id])).rejects.toThrow(/already reported/);
  });

  it("is visible to its author, other production staff, QA and management, not to other staff", async () => {
    const r = await newReport();
    for (const who of [sup, sup2, qa, ops]) expect((await t.as(who, `select id from public.production_reports where id = $1`, [r.id])).length, who).toBe(1);
    for (const who of [staff, wh]) expect((await t.as(who, `select id from public.production_reports where id = $1`, [r.id])).length, who).toBe(0);
    await t.as(sup2, `update public.production_reports set notes = 'hack' where id = $1`, [r.id]); // RLS: not theirs
    expect((await one<{ notes: string }>(`select notes from public.production_reports where id = $1`, [r.id])).notes).toBe("");
  });
});
