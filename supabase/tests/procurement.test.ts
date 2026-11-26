/**
 * Phase 4: suppliers, purchase requests → PO, CEO approval, receiving against a PO through the stock ledger,
 * supplier invoices with 3-way match and variance approval, bank-detail access.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const u = (n: number) => `60000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ceo = u(1);
const ops = u(2);
const wh = u(3);
const acct = u(4);
const staff = u(5); // plain employee
const qa = u(6);
let fg = "";
let flour = ""; // raw material, kg
let cups = ""; // merchandise, pcs, released on receipt
let sup = "";

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const num = (v: unknown) => Number(v);
const po = (id: string) => one<{ status: string; total: string; subtotal: string; vat_amount: string; revision: number }>(`select * from public.purchase_orders where id = $1`, [id]);
const approve = async (record: string, by = ceo, action = "approve") => {
  const s = await one<{ id: string }>(`select s.id from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1 and s.status = 'pending'`, [record]);
  await t.as(by, `select public.act_on_approval($1, $2, 'ok')`, [s.id, action]);
};
const onHand = async (p: string) => num((await one<{ q: string }>(`select coalesce(sum(on_hand), 0) q from public.stock_balances where product_id = $1 and location_id = $2`, [p, fg])).q);

async function newPo(lines: { product: string; unit: string; qty: number; price: number; disc?: number }[]) {
  const id = (await t.as<{ id: string }>(ops, `insert into public.purchase_orders (number, supplier_id, location_id, expected_date) values ('', $1, $2, current_date + 7) returning id`, [sup, fg]))[0].id;
  for (const l of lines) {
    await t.as(ops, `insert into public.purchase_order_lines (po_id, product_id, unit_code, qty, unit_price, discount_pct) values ($1, $2, $3, $4, $5, $6)`, [id, l.product, l.unit, l.qty, l.price, l.disc ?? 0]);
  }
  return id;
}
async function approvedSentPo(lines: Parameters<typeof newPo>[0]) {
  const id = await newPo(lines);
  await t.as(ops, `select public.submit_purchase_order($1)`, [id]);
  await approve(id);
  await t.as(ops, `select public.mark_po_sent($1)`, [id]);
  return id;
}
const lineIds = async (poId: string) => (await t.db.query<{ id: string; product_id: string }>(`select id, product_id from public.purchase_order_lines where po_id = $1 order by product_id`, [poId])).rows;

beforeAll(async () => {
  t = await createTestDb();
  fg = (await one<{ id: string }>(`select id from public.locations where code = 'PLR-FG'`)).id;
  await t.createUser(ceo, "ceo@x.ph", ["ceo"]);
  await t.createUser(ops, "ops@x.ph", ["operations_manager"]);
  await t.createUser(wh, "wh@x.ph", ["warehouse"]);
  await t.createUser(acct, "acct@x.ph", ["accounting_officer"]);
  await t.createUser(staff, "staff@x.ph", ["employee"]);
  await t.createUser(qa, "qa@x.ph", ["qa"]);
  flour = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit, shelf_life_days) values ('RM-FLOUR', 'All-purpose flour', 'raw_material', 'kg', 180) returning id`))[0].id;
  cups = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit, release_on_receipt, track_expiry) values ('MAT-CUP', 'Cup 12oz', 'merchandise', 'pcs', true, false) returning id`))[0].id;
  await t.as(ops, `insert into public.product_units (product_id, unit_code, factor) values ($1, 'sack', 25)`, [flour]);
  sup = (await t.as<{ id: string }>(ops, `insert into public.suppliers (code, name, tin, vat_registered, payment_terms_days) values ('', 'Bulacan Flour Mills', '123-456-789-000', true, 30) returning id`))[0].id;
});

describe("suppliers", () => {
  it("new suppliers start pending and can't get POs until approved", async () => {
    const s = await one<{ code: string; status: string }>(`select code, status from public.suppliers where id = $1`, [sup]);
    expect(s.code).toMatch(/^SUP-/);
    expect(s.status).toBe("pending");
    const id = await newPo([{ product: cups, unit: "pcs", qty: 100, price: 5 }]);
    await expect(t.as(ops, `select public.submit_purchase_order($1)`, [id])).rejects.toThrow(/pending/);
    await t.as(ops, `update public.suppliers set status = 'approved' where id = $1`, [sup]);
    await expect(t.as(ops, `update public.suppliers set status = 'blocked' where id = $1`, [sup])).rejects.toThrow(/why/);
  });

  it("only finance sees bank details", async () => {
    await t.as(acct, `insert into public.supplier_bank_accounts (supplier_id, bank, account_name, account_no) values ($1, 'BDO', 'Bulacan Flour Mills Inc', '0012345678')`, [sup]);
    expect((await t.as(acct, `select * from public.supplier_bank_accounts`)).length).toBe(1);
    expect((await t.as(ops, `select * from public.supplier_bank_accounts`)).length).toBe(0);
    expect((await t.as(wh, `select * from public.supplier_bank_accounts`)).length).toBe(0);
  });
});

describe("requests → PO → approval", () => {
  it("anyone can request; the buyer turns requests into a PO with supplier prices", async () => {
    await t.as(ops, `insert into public.supplier_products (supplier_id, product_id, unit_code, price) values ($1, $2, 'sack', 1120)`, [sup, flour]);
    const r = (await t.as<{ id: string; number: string }>(staff, `insert into public.purchase_requests (number, location_id, reason) values ('', $1, 'Low on flour') returning id, number`, [fg]))[0];
    expect(r.number).toMatch(/^PR-/);
    const line = (await t.as<{ id: string }>(staff, `insert into public.purchase_request_lines (request_id, product_id, unit_code, qty) values ($1, $2, 'sack', 4) returning id`, [r.id, flour]))[0].id;
    await t.as(staff, `select public.submit_purchase_request($1)`, [r.id]);
    expect((await t.as(ops, `select id from public.notifications where type = 'purchase.request_submitted'`)).length).toBe(1);
    await expect(t.as(staff, `select public.po_from_requests($1, $2, $3)`, [sup, fg, [line]])).rejects.toThrow(/can't create/);
    const poId = (await t.as<{ id: string }>(ops, `select public.po_from_requests($1, $2, $3) id`, [sup, fg, [line]]))[0].id;
    const l = await one<{ unit_price: string; qty: string }>(`select unit_price, qty from public.purchase_order_lines where po_id = $1`, [poId]);
    expect([num(l.unit_price), num(l.qty)]).toEqual([1120, 4]);
    expect((await one(`select status from public.purchase_requests where id = $1`, [r.id])).status).toBe("ordered");
    // VAT-inclusive totals: 4 × 1120 = 4480 → net 4000, VAT 480
    const p = await po(poId);
    expect([num(p.total), num(p.subtotal), num(p.vat_amount)]).toEqual([4480, 4000, 480]);
  });

  it("every PO goes to the CEO, and approved POs are locked", async () => {
    const id = await newPo([{ product: cups, unit: "pcs", qty: 1000, price: 4.5, disc: 10 }]);
    await t.as(ops, `select public.submit_purchase_order($1)`, [id]);
    expect((await po(id)).status).toBe("submitted");
    const s = await one<{ approver_ids: string[] }>(`select s.approver_ids from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1`, [id]);
    expect(s.approver_ids).toEqual([ceo]);
    await expect(t.as(wh, `select public.receive_purchase_order($1, '[]')`, [id])).rejects.toThrow(/approved or sent/);
    await approve(id);
    expect((await po(id)).status).toBe("approved");
    await expect(t.as(ops, `update public.purchase_order_lines set qty = 5 where po_id = $1`, [id])).resolves.toEqual([]); // RLS: locked
    await t.as(ops, `select public.revise_purchase_order($1)`, [id]);
    const p = await po(id);
    expect([p.status, p.revision]).toEqual(["draft", 1]);
  });
});

describe("receiving against a PO", () => {
  it("posts receipts at PO cost (net of VAT), updates PO status, and blocks over-receipt", async () => {
    const id = await approvedSentPo([{ product: flour, unit: "sack", qty: 10, price: 1120 }]);
    const [l] = await lineIds(id);
    await expect(t.as(staff, `select public.receive_purchase_order($1, $2)`, [id, JSON.stringify([{ po_line_id: l.id, qty: 4, lot_no: "F1", expiry_date: "2027-05-01" }])])).rejects.toThrow(/can't receive/);
    await t.as(wh, `select public.receive_purchase_order($1, $2, 'DR-889')`, [id, JSON.stringify([{ po_line_id: l.id, qty: 4, lot_no: "F1", expiry_date: "2027-05-01" }])]);
    expect((await po(id)).status).toBe("partly_received");
    expect(await onHand(flour)).toBe(100); // 4 sacks × 25 kg
    // cost per kg = 1120 / 1.12 / 25 = 40
    expect(num((await one<{ c: string }>(`select avg_cost c from public.product_costs where product_id = $1`, [flour])).c)).toBe(40);
    expect((await one(`select qa_status from public.batches where product_id = $1 and lot_no = 'F1'`, [flour])).qa_status).toBe("quarantine");
    await expect(t.as(wh, `select public.receive_purchase_order($1, $2)`, [id, JSON.stringify([{ po_line_id: l.id, qty: 7, lot_no: "F2", expiry_date: "2027-05-01" }])])).rejects.toThrow(/Too much/);
    await t.as(wh, `select public.receive_purchase_order($1, $2)`, [id, JSON.stringify([{ po_line_id: l.id, qty: 6, lot_no: "F2", expiry_date: "2027-05-01" }])]);
    expect((await po(id)).status).toBe("received");
    expect(num((await one<{ received_qty: string }>(`select received_qty from public.purchase_order_lines where id = $1`, [l.id])).received_qty)).toBe(10);
  });
});

describe("supplier invoices: 3-way match", () => {
  it("matches when price and received qty agree; flags variances for CEO approval", async () => {
    const id = await approvedSentPo([{ product: cups, unit: "pcs", qty: 500, price: 5 }, { product: flour, unit: "sack", qty: 2, price: 1120 }]);
    const lines = await lineIds(id);
    const cupLine = lines.find((x) => x.product_id === cups)!.id;
    const flourLine = lines.find((x) => x.product_id === flour)!.id;
    await t.as(wh, `select public.receive_purchase_order($1, $2)`, [id, JSON.stringify([{ po_line_id: cupLine, qty: 500 }, { po_line_id: flourLine, qty: 2, lot_no: "F9", expiry_date: "2027-01-01" }])]);

    // Invoice 1: cups at the PO price → matched
    const i1 = (await t.as<{ id: string; due_date: string }>(acct, `insert into public.supplier_invoices (number, supplier_id, po_id, invoice_no, invoice_date) values ('', $1, $2, 'SI-1001', current_date) returning id, due_date`, [sup, id]))[0];
    expect(i1.due_date).not.toBeNull();
    await t.as(acct, `insert into public.supplier_invoice_lines (invoice_id, po_line_id, qty, unit_price) values ($1, $2, 500, 5)`, [i1.id, cupLine]);
    expect((await t.as<{ s: string }>(acct, `select public.match_supplier_invoice($1) s`, [i1.id]))[0].s).toBe("matched");
    expect(num((await one<{ total: string }>(`select total from public.supplier_invoices where id = $1`, [i1.id])).total)).toBe(2500);

    // Same supplier invoice number again → blocked as duplicate
    await expect(t.as(acct, `insert into public.supplier_invoices (number, supplier_id, po_id, invoice_no, invoice_date) values ('', $1, $2, 'SI-1001', current_date)`, [sup, id])).rejects.toThrow();

    // Invoice 2: cups billed again (nothing left to bill) + flour at a higher price → variance
    const i2 = (await t.as<{ id: string }>(acct, `insert into public.supplier_invoices (number, supplier_id, po_id, invoice_no, invoice_date) values ('', $1, $2, 'SI-1002', current_date) returning id`, [sup, id]))[0].id;
    await t.as(acct, `insert into public.supplier_invoice_lines (invoice_id, po_line_id, qty, unit_price) values ($1, $2, 10, 5), ($1, $3, 2, 1200)`, [i2, cupLine, flourLine]);
    expect((await t.as<{ s: string }>(acct, `select public.match_supplier_invoice($1) s`, [i2]))[0].s).toBe("variance");
    const note = (await one<{ match_note: string }>(`select match_note from public.supplier_invoices where id = $1`, [i2])).match_note;
    expect(note).toMatch(/MAT-CUP: billed 10 but only 0 received/);
    expect(note).toMatch(/RM-FLOUR: billed ₱1200 vs PO ₱1120/);

    // fix the duplicate cup line, re-match: price variance remains → CEO approves it
    await t.as(acct, `delete from public.supplier_invoice_lines where invoice_id = $1 and po_line_id = $2`, [i2, cupLine]);
    expect((await t.as<{ s: string }>(acct, `select public.match_supplier_invoice($1) s`, [i2]))[0].s).toBe("variance");
    await t.as(acct, `select public.submit_invoice_variance($1)`, [i2]);
    await approve(i2);
    expect((await one(`select status from public.supplier_invoices where id = $1`, [i2])).status).toBe("approved");
    expect(num((await one<{ invoiced_qty: string }>(`select invoiced_qty from public.purchase_order_lines where id = $1`, [flourLine])).invoiced_qty)).toBe(2);
  });

  it("warehouse staff can't record supplier invoices", async () => {
    await expect(t.as(wh, `insert into public.supplier_invoices (number, supplier_id, invoice_no, invoice_date) values ('', $1, 'X-1', current_date)`, [sup])).rejects.toThrow(/row-level security/);
  });
});

describe("performance and audit", () => {
  it("supplier performance shows on-time and fill rates", async () => {
    const p = await t.as<{ on_time_pct: string; fill_pct: string; po_count: string }>(ops, `select * from public.supplier_performance where supplier_id = $1`, [sup]);
    expect(num(p[0].po_count)).toBeGreaterThan(0);
    expect(num(p[0].on_time_pct)).toBe(100);
  });

  it("every procurement table is audited", async () => {
    const missing = await t.db.query<{ t: string }>(`
      select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('suppliers','supplier_contacts','supplier_bank_accounts','supplier_products','purchase_requests','purchase_request_lines',
                          'purchase_orders','purchase_order_lines','supplier_invoices','supplier_invoice_lines')
        and not exists (select 1 from public.audit_tables a where a.table_name = c.relname)`);
    expect(missing.rows).toEqual([]);
  });
});
