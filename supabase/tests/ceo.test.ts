/**
 * Phase 6: CEO Command Center report functions are CEO-only, count sales at release, compare against targets,
 * and the daily summary reaches CEO users only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const u = (n: number) => `73000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ceo = u(1);
const ops = u(2);
const acct = u(3);
const acct2 = u(4);
const wh = u(5);
const rep = u(6);
const coo = u(7);
const qa = u(8);
let fg = "";
let sauce = "";

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];

beforeAll(async () => {
  t = await createTestDb();
  fg = (await one<{ id: string }>(`select id from public.locations where code = 'PLR-FG'`)).id;
  await t.createUser(ceo, "ceo@c.ph", ["ceo"]);
  await t.createUser(ops, "ops@c.ph", ["operations_manager"]);
  await t.createUser(acct, "acct@c.ph", ["accounting_officer"]);
  await t.createUser(acct2, "acct2@c.ph", ["accounting_officer"]);
  await t.createUser(wh, "wh@c.ph", ["warehouse"]);
  await t.createUser(rep, "rep@c.ph", ["sales_head"]);
  await t.createUser(coo, "coo@c.ph", ["coo"]);
  await t.createUser(qa, "qa@c.ph", ["qa"]);
  sauce = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit, shelf_life_days, srp) values ('C1-1L', 'Chili Sauce 1L', 'finished_good', 'bottle', 365, 112) returning id`))[0].id;
  const r = (await t.as<{ id: string }>(ops, `insert into public.stock_receipts (number, location_id) values ('x', $1) returning id`, [fg]))[0];
  await t.as(ops, `insert into public.stock_receipt_lines (receipt_id, product_id, unit_code, qty, unit_cost, lot_no, expiry_date) values ($1, $2, 'bottle', 20, 50, 'C1', current_date + 300)`, [r.id, sauce]);
  await t.as(ops, `select public.post_receipt($1)`, [r.id]);
  const b = (await one<{ id: string }>(`select id from public.batches where product_id = $1`, [sauce])).id;
  await t.as(qa, `select public.set_batch_status($1, 'released', 'ok')`, [b]);
  // one released sale of 3 × ₱112
  const c = (await t.as<{ id: string }>(rep, `insert into public.customers (code, name) values ('', 'CEO Test Store') returning id`))[0].id;
  const o = (await t.as<{ id: string }>(rep, `insert into public.sales_orders (number, customer_id, payment_mode, location_id, rep_id) values ('x', $1, 'prepaid', $2, $3) returning id`, [c, fg, rep]))[0].id;
  await t.as(rep, `insert into public.sales_order_lines (order_id, product_id, qty) values ($1, $2, 3)`, [o, sauce]);
  await t.as(rep, `select public.place_sales_order($1)`, [o]);
  const p = (await t.as<{ p: string }>(acct, `select public.record_payment($1, $2, 'cash', 336, '') p`, [c, o]))[0].p;
  await t.as(acct2, `select public.confirm_payment($1)`, [p]);
  await t.as(wh, `select public.mark_ready_for_pickup($1)`, [o]);
});

describe("CEO reports", () => {
  it("only the CEO can open them", async () => {
    for (const who of [ops, acct, coo]) await expect(t.as(who, `select public.ceo_snapshot()`)).rejects.toThrow(/Only the CEO/);
    await expect(t.as(coo, `select * from public.ceo_sales_breakdown(current_date - 30, current_date, 'channel')`)).rejects.toThrow(/Only the CEO/);
    expect((await t.as(ops, `select id from public.sales_targets`)).length).toBe(0);
  });

  it("counts sales at release, month and year to date, against the target", async () => {
    await t.as(ceo, `insert into public.sales_targets (month, amount) values (date_trunc('month', public.manila_today())::date, 1000)`);
    await t.as(ceo, `insert into public.sales_targets (month, rep_id, amount) values (date_trunc('month', public.manila_today())::date, $1, 500)`, [rep]);
    await expect(t.as(ceo, `insert into public.sales_targets (month, amount) values (date_trunc('month', public.manila_today())::date, 5)`)).rejects.toThrow(/duplicate/);
    const s = (await t.as<{ s: { sales: Record<string, string>; target: Record<string, string | null>; inventory: { value: string } } }>(ceo, `select public.ceo_snapshot() s`))[0].s;
    expect(Number(s.sales.today)).toBe(336);
    expect(Number(s.sales.mtd)).toBe(336);
    expect(Number(s.sales.ytd)).toBe(336);
    expect(Number(s.target.month)).toBe(1000);
    expect(Number(s.inventory.value)).toBe(17 * 50); // 20 received − 3 sold, at ₱50
    const by = await t.as<{ label: string; amount: string; qty: string }>(ceo, `select * from public.ceo_sales_breakdown(current_date - 1, current_date + 1, 'product')`);
    expect(by[0]).toMatchObject({ label: "C1-1L Chili Sauce 1L" });
    expect(Number(by[0].qty)).toBe(3);
    const reps = await t.as<{ user_id: string; sales_mtd: string; target_month: string }>(ceo, `select * from public.ceo_rep_performance()`);
    const r = reps.find((x) => x.user_id === rep)!;
    expect(Number(r.sales_mtd)).toBe(336);
    expect(Number(r.target_month)).toBe(500);
    expect((await t.as(rep, `select id from public.sales_targets`)).length).toBe(1); // a rep sees their own target only
  });

  it("the daily summary goes to the CEO only", async () => {
    const n = (await one<{ n: number }>(`select public.send_ceo_daily_digest() n`)).n;
    expect(n).toBe(1);
    const notes = (await t.db.query<{ user_id: string; payload: { title: string; body: string } }>(`select user_id, payload from public.notifications where type = 'ceo.daily_digest'`)).rows;
    expect(notes.map((x) => x.user_id)).toEqual([ceo]);
    expect(notes[0].payload.body).toMatch(/Month to date: ₱.*\(\d+% of the ₱1,000 target\)/);
  });
});
