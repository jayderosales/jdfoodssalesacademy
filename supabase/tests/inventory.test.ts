/**
 * Phase 2: product master, stock ledger, weighted-average cost, FEFO, QA gates, receipts, transfers,
 * adjustments and counts (with approval), reorder alerts, expiry job, cost input.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const u = (n: number) => `40000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ceo = u(1);
const ops = u(2);
const wh = u(3); // warehouse personnel, scoped to the FG warehouse
const qa = u(4);
const rep = u(5);
const prod = u(6); // manufacturing (no receive permission)
let fg = "";
let pr = "";
let fgBin = "";
let sauce = ""; // P1-1L bottle, tracked expiry
let cups = ""; // merchandise, release on receipt

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const num = (v: unknown) => Number(v);

async function receive(by: string, location: string, lines: { product: string; qty: number; cost?: number; lot?: string; expiry?: string; unit?: string }[]) {
  const r = (await t.as<{ id: string; number: string }>(by, `insert into public.stock_receipts (number, location_id, supplier_name) values ('tmp', $1, 'Test') returning id, number`, [location]))[0];
  for (const l of lines) {
    await t.as(by, `insert into public.stock_receipt_lines (receipt_id, product_id, unit_code, qty, unit_cost, lot_no, expiry_date) values ($1, $2, $3, $4, $5, $6, $7)`, [
      r.id, l.product, l.unit ?? "bottle", l.qty, l.cost ?? null, l.lot ?? "", l.expiry ?? null,
    ]);
  }
  await t.as(by, `select public.post_receipt($1)`, [r.id]);
  return r.id;
}
const onHand = async (product: string, location = fg) =>
  num((await one<{ q: string }>(`select coalesce(sum(on_hand), 0) q from public.stock_balances where product_id = $1 and location_id = $2`, [product, location])).q);
const avg = async (product: string) => num((await one<{ c: string }>(`select avg_cost c from public.product_costs where product_id = $1`, [product]))?.c ?? 0);
const batchId = async (product: string, lot: string) => (await one<{ id: string }>(`select id from public.batches where product_id = $1 and lot_no = $2`, [product, lot])).id;
const release = (batch: string) => t.as(qa, `select public.set_batch_status($1, 'released', 'ok')`, [batch]);

beforeAll(async () => {
  t = await createTestDb();
  fg = (await one<{ id: string }>(`select id from public.locations where code = 'PLR-FG'`)).id;
  pr = (await one<{ id: string }>(`select id from public.locations where code = 'PLR-PROD'`)).id;
  fgBin = (await one<{ id: string }>(`select public.default_bin($1) id`, [fg])).id;
  await t.createUser(ceo, "ceo@x.ph", ["ceo"]);
  await t.createUser(ops, "ops@x.ph", ["operations_manager"]);
  await t.createUser(qa, "qa@x.ph", ["qa"]);
  await t.createUser(rep, "rep@x.ph", ["sales_rep"]);
  await t.createUser(prod, "prod@x.ph", ["manufacturing"]);
  await t.createUser(wh, "wh@x.ph", []);
  await t.db.query(`insert into public.user_roles (user_id, role_id, location_id) select $1, id, $2 from public.roles where code = 'warehouse'`, [wh, fg]);
  const brand = (await one<{ id: string }>(`select id from public.brands where name = 'JD Foods'`)).id;
  sauce = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, brand_id, item_type, base_unit, shelf_life_days, srp) values ('P1-1L', 'Premium Sweet Barbecue 1 liter', $1, 'finished_good', 'bottle', 365, 256) returning id`, [brand]))[0].id;
  cups = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit, release_on_receipt, track_expiry, srp) values ('MAT-CUPS-S', 'Plastic Cups S 100s', 'merchandise', 'pcs', true, false, 617) returning id`))[0].id;
  await t.as(ops, `insert into public.product_units (product_id, unit_code, factor) values ($1, 'case', 12)`, [sauce]);
});

describe("catalog", () => {
  it("converts units to the base unit and rejects fractions of a piece", async () => {
    expect(num((await one<{ q: string }>(`select public.to_base_qty($1, 'case', 2) q`, [sauce])).q)).toBe(24);
    await expect(t.db.query(`select public.to_base_qty($1, 'bottle', 1.5)`, [sauce])).rejects.toThrow(/whole number/);
    await expect(t.db.query(`select public.to_base_qty($1, 'kg', 1)`, [sauce])).rejects.toThrow(/No conversion/);
  });
  it("lets everyone see the catalog but only cost-permitted people see costs", async () => {
    expect((await t.as(rep, `select id from public.products where id = $1`, [sauce])).length).toBe(1);
    await t.as(ops, `select public.set_product_cost($1, 80, '')`, [cups]);
    expect(await t.as(rep, `select * from public.product_costs`)).toEqual([]);
    expect((await t.as(ops, `select * from public.product_costs where product_id = $1`, [cups])).length).toBe(1);
  });
  it("only product managers edit products and SRP; SRP changes are audited", async () => {
    expect(await t.as(rep, `update public.products set srp = 1 where id = $1 returning id`, [sauce])).toEqual([]);
    await t.as(ops, `update public.products set srp = 260 where id = $1`, [sauce]);
    const a = await one<{ diff: Record<string, unknown> }>(`select diff from public.audit_log where entity = 'products' and entity_id = $1 and action = 'update' order by id desc limit 1`, [sauce]);
    expect(a.diff).toEqual({ srp: [256, 260] });
  });
  it("bundles can only contain stocked products", async () => {
    const b = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit) values ('KIT-1', 'Kit', 'bundle', 'pack') returning id`))[0].id;
    await t.as(ops, `insert into public.bundle_components (bundle_id, component_id, qty) values ($1, $2, 2)`, [b, sauce]);
    await expect(t.as(ops, `insert into public.bundle_components (bundle_id, component_id, qty) values ($1, $1, 1)`, [b])).rejects.toThrow();
    await expect(t.as(ops, `insert into public.bundle_components (bundle_id, component_id, qty) values ($1, $2, 1)`, [sauce, cups])).rejects.toThrow(/Only bundle/);
  });
});

describe("receipts, QA and the ledger", () => {
  it("receives into quarantine (sauce) or released (merchandise), in base units with converted cost", async () => {
    await receive(wh, fg, [{ product: sauce, qty: 10, unit: "case", cost: 1200, lot: "L1", expiry: "2027-06-30" }]); // 120 bottles @ 100
    expect(await onHand(sauce)).toBe(120);
    expect(await avg(sauce)).toBe(100);
    const b = await one<{ qa_status: string }>(`select qa_status from public.batches where lot_no = 'L1'`);
    expect(b.qa_status).toBe("quarantine");
    await receive(wh, fg, [{ product: cups, qty: 50, unit: "pcs" }]);
    expect((await one<{ qa_status: string }>(`select qa_status from public.batches where product_id = $1`, [cups])).qa_status).toBe("released");
  });
  it("requires a lot and expiry for tracked products, and a cost when there's no average yet", async () => {
    await expect(receive(wh, fg, [{ product: sauce, qty: 1, cost: 1 }])).rejects.toThrow(/lot number/);
    const newProd = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, base_unit, track_expiry) values ('NOCOST', 'No cost yet', 'pack', false) returning id`))[0].id;
    await expect(receive(wh, fg, [{ product: newProd, qty: 1, unit: "pack" }])).rejects.toThrow(/unit cost/);
  });
  it("only lets people with receive permission at that location receive", async () => {
    await expect(receive(wh, pr, [{ product: cups, qty: 1, unit: "pcs" }])).rejects.toThrow(/row-level security|can't receive/);
    await expect(receive(prod, fg, [{ product: cups, qty: 1, unit: "pcs" }])).rejects.toThrow(/row-level security|can't receive/);
  });
  it("updates the moving average on each receipt", async () => {
    const l1 = await batchId(sauce, "L1");
    await release(l1);
    await receive(wh, fg, [{ product: sauce, qty: 60, cost: 130, lot: "L2", expiry: "2027-03-31" }]); // (120*100 + 60*130)/180 = 110
    expect(await avg(sauce)).toBe(110);
    await release(await batchId(sauce, "L2"));
  });
  it("keeps the ledger append-only, even for the service role", async () => {
    await expect(t.db.query(`update public.stock_movements set qty = 1`)).rejects.toThrow(/can't be changed/);
    await expect(t.db.query(`delete from public.stock_movements`)).rejects.toThrow(/can't be changed/);
    await expect(t.as(ops, `insert into public.stock_balances (product_id, location_id, bin_id, batch_id, on_hand) values ($1, $2, $3, $4, 999)`, [sauce, fg, fgBin, await batchId(sauce, "L1")])).rejects.toThrow(/row-level security/);
  });
  it("balances always equal the sum of movements", async () => {
    const r = await one<{ diff: string }>(`
      select coalesce(sum(abs(b.on_hand - m.q)), 0) diff from public.stock_balances b
      join (select product_id, location_id, bin_id, batch_id, sum(qty) q from public.stock_movements group by 1, 2, 3, 4) m
      using (product_id, location_id, bin_id, batch_id)`);
    expect(num(r.diff)).toBe(0);
  });
  it("only QA can change batch status, and expired batches can't be released", async () => {
    const l1 = await batchId(sauce, "L1");
    await expect(t.as(wh, `select public.set_batch_status($1, 'on_hold', 'damaged seal')`, [l1])).rejects.toThrow(/Only QA/);
    await expect(t.as(qa, `update public.batches set qa_status = 'released' where id = $1`, [l1])).resolves.toEqual([]); // no update policy
    await expect(t.db.query(`update public.batches set qa_status = 'rejected' where id = $1`, [l1])).rejects.toThrow(/go through QA/);
  });
});

describe("availability, FEFO and the QA gate", () => {
  it("excludes quarantined, on-hold, rejected and expired stock from available", async () => {
    await receive(wh, fg, [{ product: sauce, qty: 30, cost: 110, lot: "Q1", expiry: "2027-12-31" }]); // stays in quarantine
    const a = await one<{ available: string; on_hand: string }>(`select available, on_hand from public.stock_available where product_id = $1 and location_id = $2`, [sauce, fg]);
    expect(num(a.available)).toBe(180); // L1 120 + L2 60 released; Q1 30 excluded
    expect(await onHand(sauce)).toBe(210);
  });
  it("reserves earliest expiry first and refuses non-released stock", async () => {
    const res = await t.db.query<{ lot_no: string; qty: string }>(`select lot_no, qty from public.reserve_stock($1, $2, 70, 'test', $3)`, [sauce, fg, u(900)]);
    expect(res.rows.map((r) => [r.lot_no, num(r.qty)])).toEqual([["L2", 60], ["L1", 10]]); // L2 expires first
    await expect(t.db.query(`select * from public.reserve_stock($1, $2, 200, 'test', $3)`, [sauce, fg, u(901)])).rejects.toThrow(/Only 110 available/);
    expect(num((await one<{ available: string }>(`select available from public.stock_available where product_id = $1 and location_id = $2`, [sauce, fg])).available)).toBe(110);
    await t.db.query(`select public.release_reservations('test', $1)`, [u(900)]);
    expect(num((await one<{ available: string }>(`select available from public.stock_available where product_id = $1 and location_id = $2`, [sauce, fg])).available)).toBe(180);
  });
  it("blocks dispatching, transferring or sampling a quarantined batch at the database level", async () => {
    const q1 = await batchId(sauce, "Q1");
    await expect(t.db.query(`select public.post_stock_movement($1, $2, $3, $4, -1, 'sale_dispatch')`, [sauce, fg, fgBin, q1])).rejects.toThrow(/quarantine/);
    await expect(t.db.query(`select public.post_stock_movement($1, $2, $3, $4, -1, 'transfer_out')`, [sauce, fg, fgBin, q1])).rejects.toThrow(/quarantine/);
    await expect(t.db.query(`select public.post_stock_movement($1, $2, $3, $4, -1, 'sample')`, [sauce, fg, fgBin, q1])).rejects.toThrow(/quarantine/);
  });
  it("blocks negative stock and taking reserved stock", async () => {
    const l1 = await batchId(sauce, "L1");
    await expect(t.db.query(`select public.post_stock_movement($1, $2, $3, $4, -500, 'sale_dispatch')`, [sauce, fg, fgBin, l1])).rejects.toThrow(/Not enough stock/);
    await t.db.query(`select * from public.reserve_stock($1, $2, 120, 'test', $3)`, [sauce, fg, u(902)]);
    await expect(t.db.query(`select public.post_stock_movement($1, $2, $3, $4, -10, 'damage')`, [sauce, fg, fgBin, await batchId(sauce, "L2")])).rejects.toThrow(/reserved/);
    await t.db.query(`select public.release_reservations('test', $1)`, [u(902)]);
  });
  it("can't be called directly through the API", async () => {
    await expect(t.as(ops, `select public.post_stock_movement($1, $2, $3, $4, 5, 'receipt', 1)`, [sauce, fg, fgBin, await batchId(sauce, "L1")])).rejects.toThrow(/permission denied/);
    await expect(t.as(ops, `select * from public.reserve_stock($1, $2, 1, 'x', $3)`, [sauce, fg, u(903)])).rejects.toThrow(/permission denied/);
  });
});

describe("transfers", () => {
  it("dispatches and receives in two steps, valuing at average cost; short receipts stay in transit", async () => {
    const tr = (await t.as<{ id: string }>(ops, `insert into public.stock_transfers (number, from_location_id, to_location_id) values ('tmp', $1, $2) returning id`, [fg, pr]))[0].id;
    const line = (await t.as<{ id: string }>(ops, `insert into public.stock_transfer_lines (transfer_id, product_id, batch_id, qty) values ($1, $2, $3, 10) returning id`, [tr, sauce, await batchId(sauce, "L1")]))[0].id;
    await t.as(ops, `select public.dispatch_transfer($1)`, [tr]);
    expect(await onHand(sauce)).toBe(200);
    expect(await onHand(sauce, pr)).toBe(0);
    await t.as(ops, `select public.receive_transfer($1, $2)`, [tr, JSON.stringify([{ line_id: line, received_qty: 8 }])]);
    expect(await onHand(sauce, pr)).toBe(8);
    expect(num((await one<{ q: string }>(`select qty_in_transit q from public.stock_in_transit where transfer_id = $1`, [tr])).q)).toBe(2);
    expect(await avg(sauce)).toBe(110);
  });
  it("won't transfer a quarantined batch", async () => {
    const tr = (await t.as<{ id: string }>(ops, `insert into public.stock_transfers (number, from_location_id, to_location_id) values ('tmp', $1, $2) returning id`, [fg, pr]))[0].id;
    await t.as(ops, `insert into public.stock_transfer_lines (transfer_id, product_id, batch_id, qty) values ($1, $2, $3, 1)`, [tr, sauce, await batchId(sauce, "Q1")]);
    await expect(t.as(ops, `select public.dispatch_transfer($1)`, [tr])).rejects.toThrow(/quarantine/);
  });
});

describe("adjustments with approval", () => {
  it("posts only after approval (≤ ₱5,000 → operations manager) and shows on the stock card and audit log", async () => {
    const adj = (await t.as<{ id: string; number: string }>(wh, `insert into public.stock_adjustments (number, location_id, reason_type, notes) values ('tmp', $1, 'damage', 'Dropped') returning id, number`, [fg]))[0];
    await t.as(wh, `insert into public.stock_adjustment_lines (adjustment_id, product_id, batch_id, qty, reason) values ($1, $2, $3, -5, 'Broken bottles')`, [adj.id, sauce, await batchId(sauce, "L1")]);
    const before = await onHand(sauce);
    await t.as(wh, `select public.submit_adjustment($1)`, [adj.id]);
    expect(await onHand(sauce)).toBe(before); // not yet
    expect(num((await one<{ v: string }>(`select total_value v from public.stock_adjustments where id = $1`, [adj.id])).v)).toBe(550);
    const step = await one<{ id: string; approver_ids: string[] }>(`select s.id, s.approver_ids from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1 and s.status = 'pending'`, [adj.id]);
    expect(step.approver_ids).toEqual([ops]);
    await t.as(ops, `select public.act_on_approval($1, 'approve', 'ok')`, [step.id]);
    expect(await onHand(sauce)).toBe(before - 5);
    expect((await one(`select status from public.stock_adjustments where id = $1`, [adj.id])).status).toBe("posted");
    const card = await t.as<{ movement_type: string; qty: string; doc_number: string }>(wh, `select movement_type, qty, doc_number from public.stock_movements where doc_id = $1`, [adj.id]);
    expect(card).toEqual([{ movement_type: "damage", qty: "-5.0000", doc_number: adj.number }]);
    expect((await t.as(ceo, `select id from public.audit_log where entity = 'stock_adjustments' and entity_id = $1`, [adj.id])).length).toBeGreaterThan(1);
  });
  it("rejects positive quantities for damage and can't be posted by changing status", async () => {
    const adj = (await t.as<{ id: string }>(wh, `insert into public.stock_adjustments (number, location_id, reason_type) values ('tmp', $1, 'damage') returning id`, [fg]))[0].id;
    await t.as(wh, `insert into public.stock_adjustment_lines (adjustment_id, product_id, batch_id, qty) values ($1, $2, $3, 3)`, [adj, sauce, await batchId(sauce, "L1")]);
    await expect(t.as(wh, `select public.submit_adjustment($1)`, [adj])).rejects.toThrow(/negative/);
    await expect(t.as(wh, `update public.stock_adjustments set status = 'approved' where id = $1`, [adj])).rejects.toThrow(/approval process|row-level security/);
  });
});

describe("cycle counts with approval", () => {
  it("snapshots, counts blind, and posts the variance only after approval", async () => {
    const cid = (await t.as<{ id: string }>(wh, `select public.create_count($1) id`, [fg]))[0].id;
    const lines = await t.as<{ id: string; product_id: string; expected_qty: string; batch_id: string }>(wh, `select id, product_id, expected_qty, batch_id from public.stock_count_lines where count_id = $1`, [cid]);
    expect(lines.length).toBeGreaterThan(0);
    await expect(t.as(wh, `select public.submit_count($1)`, [cid])).rejects.toThrow(/haven't been counted/);
    for (const l of lines) {
      const q = l.product_id === cups ? num(l.expected_qty) - 3 : num(l.expected_qty); // 3 cups missing
      await t.as(wh, `select public.record_count($1, $2)`, [l.id, q]);
    }
    const cupsBefore = await onHand(cups);
    expect((await t.as<{ r: string }>(wh, `select public.submit_count($1) r`, [cid]))[0].r).toBe("submitted");
    expect(await onHand(cups)).toBe(cupsBefore); // nothing until approved
    const step = await one<{ id: string }>(`select s.id from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1 and s.status = 'pending'`, [cid]);
    await t.as(ops, `select public.act_on_approval($1, 'approve', 'checked')`, [step.id]);
    expect(await onHand(cups)).toBe(cupsBefore - 3);
    const mv = await t.as<{ movement_type: string }>(wh, `select movement_type from public.stock_movements where doc_id = $1`, [cid]);
    expect(mv.map((m) => m.movement_type)).toEqual(["count_variance"]);
    expect((await t.as(ceo, `select id from public.audit_log where entity = 'stock_count_lines' and action = 'update'`)).length).toBeGreaterThan(0);
  });
  it("a count with no differences closes without approval", async () => {
    const cid = (await t.as<{ id: string }>(wh, `select public.create_count($1) id`, [fg]))[0].id;
    for (const l of await t.as<{ id: string; expected_qty: string }>(wh, `select id, expected_qty from public.stock_count_lines where count_id = $1`, [cid])) {
      await t.as(wh, `select public.record_count($1, $2)`, [l.id, num(l.expected_qty)]);
    }
    expect((await t.as<{ r: string }>(wh, `select public.submit_count($1) r`, [cid]))[0].r).toBe("no_variance");
  });
});

describe("cost input", () => {
  it("sets an opening cost freely when there's no stock, and needs a reason to revalue stock on hand", async () => {
    const p = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, base_unit, track_expiry) values ('OPEN-1', 'Opening cost item', 'pack', false) returning id`))[0].id;
    await t.as(ops, `select public.set_product_cost($1, 45.5, '')`, [p]);
    expect(await avg(p)).toBe(45.5);
    await receive(ops, fg, [{ product: p, qty: 10, unit: "pack" }]); // uses the entered cost
    expect(await avg(p)).toBe(45.5);
    await expect(t.as(ops, `select public.set_product_cost($1, 50, '')`, [p])).rejects.toThrow(/reason/);
    await t.as(ops, `select public.set_product_cost($1, 50, 'Supplier price correction')`, [p]);
    const log = await t.as<{ value_change: string; qty_on_hand: string }>(ops, `select value_change, qty_on_hand from public.product_cost_changes where product_id = $1 order by id desc limit 1`, [p]);
    expect(log[0]).toEqual({ value_change: "45.00", qty_on_hand: "10.0000" });
  });
  it("only cost managers can change costs", async () => {
    await expect(t.as(wh, `select public.set_product_cost($1, 1, 'x')`, [cups])).rejects.toThrow(/permission/);
    await expect(t.as(rep, `select public.set_product_cost($1, 1, 'x')`, [cups])).rejects.toThrow(/permission/);
  });
});

describe("reorder and expiry", () => {
  it("alerts operations once when available drops to the minimum", async () => {
    await t.as(ops, `insert into public.reorder_rules (product_id, location_id, min_qty, max_qty) values ($1, $2, 45, 200)`, [cups, fg]);
    const adj = (await t.as<{ id: string }>(wh, `insert into public.stock_adjustments (number, location_id, reason_type) values ('tmp', $1, 'internal_use') returning id`, [fg]))[0].id;
    const cb = (await one<{ id: string }>(`select id from public.batches where product_id = $1`, [cups])).id;
    await t.as(wh, `insert into public.stock_adjustment_lines (adjustment_id, product_id, batch_id, qty) values ($1, $2, $3, -2)`, [adj, cups, cb]);
    await t.as(wh, `select public.submit_adjustment($1)`, [adj]);
    const step = await one<{ id: string }>(`select s.id from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1 and s.status = 'pending'`, [adj]);
    await t.as(ops, `select public.act_on_approval($1, 'approve', 'ok')`, [step.id]);
    const n = await t.as(ops, `select id from public.notifications where type = 'stock.reorder_needed'`);
    expect(n.length).toBe(1);
    expect((await t.as<{ suggested_qty: string }>(ops, `select suggested_qty from public.reorder_suggestions where product_id = $1`, [cups]))[0].suggested_qty).toBe("155.0000");
  });
  it("the nightly job expires batches past their date; expired stock leaves availability", async () => {
    await receive(wh, fg, [{ product: sauce, qty: 5, cost: 110, lot: "OLD", expiry: "2026-12-01" }]);
    await t.db.query(`update public.batches set expiry_date = public.manila_today() - 1 where lot_no = 'OLD'`);
    expect(num((await one<{ n: number }>(`select public.expire_batches() n`)).n)).toBeGreaterThanOrEqual(1);
    expect((await one(`select qa_status from public.batches where lot_no = 'OLD'`)).qa_status).toBe("expired");
    await expect(t.as(qa, `select public.set_batch_status($1, 'released', 'x')`, [await batchId(sauce, "OLD")])).rejects.toThrow(/expired|expiry/);
  });
});

describe("location scoping", () => {
  it("warehouse staff scoped to the FG warehouse don't see production-store stock", async () => {
    expect(await t.as(wh, `select * from public.stock_balances where location_id = $1`, [pr])).toEqual([]);
    expect((await t.as(wh, `select * from public.stock_balances where location_id = $1`, [fg])).length).toBeGreaterThan(0);
    expect((await t.as(ops, `select * from public.stock_balances where location_id = $1`, [pr])).length).toBeGreaterThan(0);
  });
});

describe("importers", () => {
  it("imports products by SKU (creating categories) and opening stock as released batches with cost", async () => {
    const res = await t.as<{ r: { created: number; updated: number } }>(ops, `select public.import_products($1) r`, [
      JSON.stringify([
        { sku: "c1-gal", name: "Spicy Garlic Butter 1 gallon", brand: "JD Foods", category: "Classic Sauces", item_type: "finished_good", base_unit: "bottle", size: "1 gallon", srp: "1500", cost: "700" },
        { sku: "P1-1L", name: "Premium Sweet Barbecue 1 liter", brand: "JD Foods", srp: "256" },
      ]),
    ]);
    expect(res[0].r).toEqual({ created: 1, updated: 1 });
    const c1 = await one<{ id: string; srp: string }>(`select id, srp from public.products where sku = 'C1-GAL'`);
    expect(c1.srp).toBe("1500.00");
    expect(await avg(c1.id)).toBe(700);
    await t.as(ops, `select public.import_opening_stock($1)`, [JSON.stringify([{ sku: "C1-GAL", location: "PLR-FG", lot_no: "OPEN-1", expiry_date: "2027-10-01", qty: "12" }])]);
    expect(await onHand(c1.id)).toBe(12);
    expect((await one(`select qa_status from public.batches where product_id = $1`, [c1.id])).qa_status).toBe("released");
    await expect(t.as(ops, `select public.import_opening_stock($1)`, [JSON.stringify([{ sku: "NOPE", location: "PLR-FG", qty: "1" }])])).rejects.toThrow(/unknown SKU/);
    await expect(t.as(rep, `select public.import_products($1)`, [JSON.stringify([{ sku: "X1", name: "Nope" }])])).rejects.toThrow(/row-level security/);
  });
});
