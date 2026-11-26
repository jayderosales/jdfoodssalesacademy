/**
 * Phase 3: customers, pricing, CRM, sales orders, shop, payments, credit check, fulfilment and the inventory rule
 * (reserve on placement, deduct only at "ready for pickup" when paid or credit-approved), SI monitoring.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const u = (n: number) => `50000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ceo = u(1);
const ops = u(2);
const wh = u(3);
const acct = u(4);
const acct2 = u(5);
const rep = u(6);
const rep2 = u(7);
const head = u(8);
const qa = u(9);
let fg = "";
let sauce = ""; // P1-1L, SRP 256
let cups = ""; // merchandise, SRP 617

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const num = (v: unknown) => Number(v);
const onHand = async (p: string) => num((await one<{ q: string }>(`select coalesce(sum(on_hand), 0) q from public.stock_balances where product_id = $1 and location_id = $2`, [p, fg])).q);
const available = async (p: string) => num((await one<{ q: string }>(`select coalesce(sum(available), 0) q from public.stock_available where product_id = $1 and location_id = $2`, [p, fg]))?.q ?? 0);
const order = (id: string) => one<{ status: string; total: string; paid_amount: string; number: string; due_date: string | null }>(`select * from public.sales_orders where id = $1`, [id]);

async function stock(product: string, qty: number, lot: string, cost: number) {
  const r = (await t.as<{ id: string }>(ops, `insert into public.stock_receipts (number, location_id) values ('x', $1) returning id`, [fg]))[0];
  await t.as(ops, `insert into public.stock_receipt_lines (receipt_id, product_id, unit_code, qty, unit_cost, lot_no, expiry_date) values ($1, $2, (select base_unit from public.products where id = $2), $3, $4, $5, current_date + 200)`, [r.id, product, qty, cost, lot]);
  await t.as(ops, `select public.post_receipt($1)`, [r.id]);
  const b = (await one<{ id: string; qa_status: string }>(`select id, qa_status from public.batches where product_id = $1 and lot_no = $2`, [product, lot]));
  if (b.qa_status !== "released") await t.as(qa, `select public.set_batch_status($1, 'released', 'ok')`, [b.id]);
}

async function staffOrder(by: string, customer: string, lines: { product: string; qty: number; price?: number; disc?: number }[], mode = "prepaid") {
  const o = (await t.as<{ id: string }>(by, `insert into public.sales_orders (number, customer_id, channel, payment_mode, location_id) values ('x', $1, 'phone', $2, $3) returning id`, [customer, mode, fg]))[0];
  for (const l of lines) {
    await t.as(by, `insert into public.sales_order_lines (order_id, product_id, qty, unit_price, discount_pct) values ($1, $2, $3, $4, $5)`, [o.id, l.product, l.qty, l.price ?? null, l.disc ?? 0]);
  }
  return o.id;
}
const approveStep = async (record: string, by: string) => {
  const s = await one<{ id: string }>(`select s.id from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1 and s.status = 'pending'`, [record]);
  await t.as(by, `select public.act_on_approval($1, 'approve', 'ok')`, [s.id]);
};
const shopOrder = (mobile: string, lines: { sku: string; qty: number }[], name = "Juan Cruz") =>
  t.asAnon<{ r: { number: string; total: number; status: string } }>(`select public.place_shop_order($1) r`, [
    JSON.stringify({ name, mobile, email: "", address: { line: "123 Rizal St, Brgy 1", city: "Quezon City" }, lines }),
  ]);

beforeAll(async () => {
  t = await createTestDb();
  fg = (await one<{ id: string }>(`select id from public.locations where code = 'PLR-FG'`)).id;
  await t.createUser(ceo, "ceo@x.ph", ["ceo"]);
  await t.createUser(ops, "ops@x.ph", ["operations_manager"]);
  await t.createUser(wh, "wh@x.ph", ["warehouse"]);
  await t.createUser(acct, "acct@x.ph", ["accounting_officer"]);
  await t.createUser(acct2, "acct2@x.ph", ["accounting_officer"]);
  await t.createUser(rep, "rep@x.ph", ["sales_rep"]);
  await t.createUser(rep2, "rep2@x.ph", ["sales_rep"]);
  await t.createUser(head, "head@x.ph", ["sales_head"]);
  await t.createUser(qa, "qa@x.ph", ["qa"]);
  sauce = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit, shelf_life_days, srp) values ('P1-1L', 'Premium Sweet Barbecue 1 liter', 'finished_good', 'bottle', 365, 256) returning id`))[0].id;
  cups = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit, release_on_receipt, track_expiry, srp) values ('MAT-CUPS-S', 'Plastic Cups S', 'merchandise', 'pcs', true, false, 617) returning id`))[0].id;
  await stock(sauce, 100, "L1", 120);
  await stock(cups, 50, "C1", 400);
});

describe("pricing", () => {
  it("customer price beats price list beats SRP", async () => {
    const c = (await t.as<{ id: string }>(head, `insert into public.customers (code, name, type) values ('', 'Mang Inasal Branch', 'distributor') returning id`))[0].id;
    const srp = await t.as<{ price: string; source: string }>(head, `select * from public.resolve_price($1, $2, 1)`, [c, sauce]);
    expect(srp[0]).toMatchObject({ price: "256.00", source: "SRP" });
    await t.as(head, `insert into public.price_list_items (price_list_id, product_id, min_qty, price) select id, $1, 1, 200 from public.price_lists where code = 'DISTRIBUTOR'`, [sauce]);
    await t.as(head, `insert into public.price_list_items (price_list_id, product_id, min_qty, price) select id, $1, 12, 190 from public.price_lists where code = 'DISTRIBUTOR'`, [sauce]);
    expect((await t.as<{ price: string }>(head, `select * from public.resolve_price($1, $2, 5)`, [c, sauce]))[0].price).toBe("200.00");
    expect((await t.as<{ price: string }>(head, `select * from public.resolve_price($1, $2, 24)`, [c, sauce]))[0].price).toBe("190.00");
    await t.as(head, `insert into public.customer_prices (customer_id, product_id, price) values ($1, $2, 180)`, [c, sauce]);
    expect((await t.as<{ price: string; source: string }>(head, `select * from public.resolve_price($1, $2, 24)`, [c, sauce]))[0]).toMatchObject({ price: "180.00", source: "customer" });
  });

  it("reps can't change price lists or credit terms", async () => {
    await expect(t.as(rep, `insert into public.price_list_items (price_list_id, product_id, price) select id, $1, 1 from public.price_lists where code = 'RETAIL'`, [sauce])).rejects.toThrow();
    const c = (await t.as<{ id: string; credit_limit: string }>(rep, `insert into public.customers (code, name, type, credit_limit, payment_terms_days, owner_id) values ('', 'Sari-sari ni Aling Nena', 'regular', 999999, 60, $1) returning id, credit_limit`, [rep]))[0];
    expect(c.credit_limit).toBe("0.00"); // reset: reps can't grant credit
    await expect(t.as(rep, `update public.customers set credit_limit = 5000 where id = $1`, [c.id])).rejects.toThrow(/credit terms/);
  });
});

describe("customers and CRM visibility", () => {
  it("reps see their own and unassigned customers, not another rep's", async () => {
    const mine = (await t.as<{ id: string }>(rep, `insert into public.customers (code, name, owner_id) values ('', 'Rep One Customer', $1) returning id`, [rep]))[0].id;
    expect((await t.as(rep2, `select id from public.customers where id = $1`, [mine])).length).toBe(0);
    expect((await t.as(head, `select id from public.customers where id = $1`, [mine])).length).toBe(1);
  });

  it("leads are private to their owner and convert into customers", async () => {
    const lead = (await t.as<{ id: string; number: string }>(rep, `insert into public.leads (number, name, company, mobile, customer_type) values ('', 'Ana Reyes', 'Ana''s Wings', '09171234567', 'reseller') returning id, number`))[0];
    expect(lead.number).toMatch(/^LD-/);
    expect((await t.as(rep2, `select id from public.leads where id = $1`, [lead.id])).length).toBe(0);
    await expect(t.as(rep, `update public.leads set stage = 'lost' where id = $1`, [lead.id])).rejects.toThrow(/why/);
    const cid = (await t.as<{ c: string }>(rep, `select public.convert_lead($1) c`, [lead.id]))[0].c;
    const c = await one<{ name: string; type: string; owner_id: string }>(`select name, type, owner_id from public.customers where id = $1`, [cid]);
    expect(c).toMatchObject({ name: "Ana's Wings", type: "reseller", owner_id: rep });
    expect((await one(`select stage from public.leads where id = $1`, [lead.id])).stage).toBe("won");
  });

  it("field visits store the GPS check-in", async () => {
    const c = (await t.as<{ id: string }>(rep, `insert into public.customers (code, name, owner_id) values ('', 'Visit Me Store', $1) returning id`, [rep]))[0].id;
    await t.as(rep, `insert into public.activities (kind, subject, customer_id, lat, lng, accuracy_m, checked_in_at, done_at) values ('visit', 'Product demo', $1, 14.6760, 121.0437, 12, now(), now())`, [c]);
    expect((await t.as<{ lat: string }>(rep, `select lat from public.activities where customer_id = $1`, [c]))[0].lat).toBe("14.676000");
  });
});

describe("shop (guests)", () => {
  it("guests read the catalog (no cost, no quantities) but nothing else", async () => {
    const cat = await t.asAnon<Record<string, unknown>>(`select * from public.shop_catalog()`);
    const s = cat.find((r) => r.sku === "P1-1L")!;
    expect(s.in_stock).toBe(true);
    expect(Object.keys(s)).not.toContain("avg_cost");
    expect(Object.keys(s)).not.toContain("available");
    expect(await t.asAnon(`select * from public.customers`)).toEqual([]);
    expect(await t.asAnon(`select * from public.sales_orders`)).toEqual([]);
    await expect(t.asAnon(`select * from public.resolve_price(null, $1, 1)`, [sauce])).rejects.toThrow();
  });

  it("a guest order reserves stock but doesn't deduct it", async () => {
    const before = await onHand(sauce);
    const avBefore = await available(sauce);
    const r = (await shopOrder("09181112222", [{ sku: "p1-1l", qty: 3 }]))[0].r;
    expect(r.status).toBe("awaiting_payment");
    expect(num(r.total)).toBe(768);
    expect(await onHand(sauce)).toBe(before);
    expect(await available(sauce)).toBe(avBefore - 3);
  });

  it("a guest never gets another customer's special price by using their mobile", async () => {
    const c = (await t.as<{ id: string }>(head, `insert into public.customers (code, name, type, mobile) values ('', 'Big Distributor', 'distributor', '09190000001') returning id`))[0].id;
    await t.as(head, `insert into public.customer_prices (customer_id, product_id, price) values ($1, $2, 100)`, [c, sauce]);
    const r = (await shopOrder("09190000001", [{ sku: "P1-1L", qty: 1 }]))[0].r;
    expect(num(r.total)).toBe(256);
  });

  it("validates input and rejects stock that isn't there", async () => {
    await expect(shopOrder("12345", [{ sku: "P1-1L", qty: 1 }])).rejects.toThrow(/mobile/);
    await expect(shopOrder("09181112223", [{ sku: "P1-1L", qty: 0 }])).rejects.toThrow(/Quantity/);
    await expect(shopOrder("09181112223", [{ sku: "MAT-CUPS-S", qty: 500 }])).rejects.toThrow(/Only 50/);
  });

  it("track page needs the right mobile", async () => {
    const r = (await shopOrder("09181113333", [{ sku: "MAT-CUPS-S", qty: 1 }]))[0].r;
    expect((await t.asAnon<{ s: unknown }>(`select public.shop_order_status($1, '09999999999') s`, [r.number]))[0].s).toBeNull();
    const st = (await t.asAnon<{ s: { status: string; lines: unknown[] } }>(`select public.shop_order_status($1, '+639181113333') s`, [r.number]))[0].s;
    expect(st.status).toBe("awaiting_payment");
    expect(st.lines.length).toBe(1);
  });
});

describe("pay → pack → ready (stock deducted) → dispatch → deliver", () => {
  it("runs the full shop flow and deducts stock only at ready for pickup", async () => {
    const r = (await shopOrder("09185550000", [{ sku: "P1-1L", qty: 2 }, { sku: "MAT-CUPS-S", qty: 1 }], "Liza Santos"))[0].r;
    const id = (await one<{ id: string }>(`select id from public.sales_orders where number = $1`, [r.number])).id;
    const sauceBefore = await onHand(sauce);

    // can't release an unpaid order
    await expect(t.as(wh, `select public.mark_ready_for_pickup($1)`, [id])).rejects.toThrow(/paid or credit-approved/);

    // customer submits the GCash reference; finance confirms
    await t.asAnon(`select public.submit_shop_payment($1, '09185550000', 'gcash', 'GC123456789', 1129)`, [r.number]);
    const pay = await one<{ id: string; status: string }>(`select id, status from public.payments where order_id = $1`, [id]);
    expect(pay.status).toBe("pending");
    expect((await t.as(acct, `select id from public.notifications where type = 'payment.submitted'`)).length).toBeGreaterThan(0);
    await t.as(acct, `select public.confirm_payment($1)`, [pay.id]);
    expect((await order(id)).status).toBe("confirmed");
    expect(await onHand(sauce)).toBe(sauceBefore); // paid, but not prepared yet

    await t.as(wh, `select public.start_packing($1)`, [id]);
    await t.as(wh, `select public.mark_ready_for_pickup($1)`, [id]);
    expect(await onHand(sauce)).toBe(sauceBefore - 2);
    const mv = await t.as<{ movement_type: string; qty: string }>(wh, `select movement_type, qty from public.stock_movements where doc_id = $1 order by id`, [id]);
    expect(mv.map((m) => [m.movement_type, num(m.qty)]).sort((a, b) => Number(a[1]) - Number(b[1]))).toEqual([["sale_dispatch", -2], ["sale_dispatch", -1]]);
    expect((await one(`select count(*)::int n from public.reservations where source_id = $1 and released_at is null`, [id])).n).toBe(0);
    const inv = await one<{ number: string; total: string }>(`select number, total from public.billing_invoices where order_id = $1`, [id]);
    expect(inv.number).toMatch(/^BI-/);
    expect(num(inv.total)).toBe(1129);

    await t.as(wh, `select public.dispatch_order($1, 'J&T Express', 'JT0001', 120, null)`, [id]);
    await t.as(wh, `select public.mark_delivered($1, 'Received by Liza')`, [id]);
    expect((await order(id)).status).toBe("delivered");
    const st = (await t.asAnon<{ s: { shipment: { tracking_no: string } } }>(`select public.shop_order_status($1, '09185550000') s`, [r.number]))[0].s;
    expect(st.shipment.tracking_no).toBe("JT0001");
  });

  it("whoever records a payment can't confirm it", async () => {
    const c = (await t.as<{ id: string }>(head, `insert into public.customers (code, name) values ('', 'Walk-in Buyer') returning id`))[0].id;
    const id = await staffOrder(head, c, [{ product: cups, qty: 1 }]);
    await t.as(head, `select public.place_sales_order($1)`, [id]);
    const pid = (await t.as<{ p: string }>(acct, `select public.record_payment($1, $2, 'cash', 617, '') p`, [c, id]))[0].p;
    await expect(t.as(acct, `select public.confirm_payment($1)`, [pid])).rejects.toThrow(/someone else/);
    await expect(t.as(rep, `select public.confirm_payment($1)`, [pid])).rejects.toThrow(/finance/);
    await t.as(acct2, `select public.confirm_payment($1)`, [pid]);
    expect((await order(id)).status).toBe("confirmed");
  });

  it("returns come back into a non-sellable RETURNS bin", async () => {
    const c = (await t.as<{ id: string }>(head, `insert into public.customers (code, name) values ('', 'Returner') returning id`))[0].id;
    const id = await staffOrder(head, c, [{ product: sauce, qty: 1 }]);
    await t.as(head, `select public.place_sales_order($1)`, [id]);
    const pid = (await t.as<{ p: string }>(acct, `select public.record_payment($1, $2, 'bank_transfer', 256, 'BDO-7788') p`, [c, id]))[0].p;
    await t.as(acct2, `select public.confirm_payment($1)`, [pid]);
    await t.as(wh, `select public.mark_ready_for_pickup($1)`, [id]);
    const avBefore = await available(sauce);
    const ohBefore = await onHand(sauce);
    await t.as(wh, `select public.return_sales_order($1, 'Damaged in transit')`, [id]);
    expect(await onHand(sauce)).toBe(ohBefore + 1);
    expect(await available(sauce)).toBe(avBefore); // not sellable until the warehouse moves it
    expect((await one(`select status from public.billing_invoices where order_id = $1`, [id])).status).toBe("void");
  });
});

describe("staff orders, discounts, credit", () => {
  it("reps can't discount; sales head can", async () => {
    const c = (await t.as<{ id: string }>(rep, `insert into public.customers (code, name, owner_id) values ('', 'Discount Seeker', $1) returning id`, [rep]))[0].id;
    await expect(staffOrder(rep, c, [{ product: sauce, qty: 1, disc: 10 }])).rejects.toThrow(/discount/);
    await expect(staffOrder(rep, c, [{ product: sauce, qty: 1, price: 200 }])).rejects.toThrow(/discount/);
    const id = await staffOrder(head, c, [{ product: sauce, qty: 2, disc: 10 }]);
    const o = await one<{ subtotal: string; discount_total: string; total: string }>(`select subtotal, discount_total, total from public.sales_orders where id = $1`, [id]);
    expect([num(o.subtotal), num(o.discount_total), num(o.total)]).toEqual([512, 51.2, 460.8]);
  });

  it("lines are locked once the order is placed", async () => {
    const c = (await t.as<{ id: string }>(rep, `insert into public.customers (code, name, owner_id) values ('', 'Locked Lines', $1) returning id`, [rep]))[0].id;
    const id = await staffOrder(rep, c, [{ product: cups, qty: 1 }]);
    await t.as(rep, `select public.place_sales_order($1)`, [id]);
    await expect(t.as(rep, `update public.sales_order_lines set qty = 5 where order_id = $1`, [id])).resolves.toEqual([]); // RLS: no longer editable
    expect(num((await one<{ qty: string }>(`select qty from public.sales_order_lines where order_id = $1`, [id])).qty)).toBe(1);
    await expect(t.as(rep, `update public.sales_orders set status = 'confirmed' where id = $1`, [id])).resolves.toEqual([]);
    expect((await order(id)).status).toBe("awaiting_payment");
  });

  it("terms orders over the limit go to the CEO; approval releases them without payment", async () => {
    const c = (await t.as<{ id: string }>(head, `insert into public.customers (code, name, type, payment_terms_days, credit_limit) values ('', 'Corporate Canteen', 'corporate', 30, 1000) returning id`))[0].id;
    const small = await staffOrder(head, c, [{ product: sauce, qty: 2 }], "terms");
    expect((await t.as<{ s: string }>(head, `select public.place_sales_order($1) s`, [small]))[0].s).toBe("confirmed");
    const big = await staffOrder(head, c, [{ product: sauce, qty: 3 }], "terms"); // 512 + 768 > 1000
    expect((await t.as<{ s: string }>(head, `select public.place_sales_order($1) s`, [big]))[0].s).toBe("credit_review");
    await expect(t.as(wh, `select public.mark_ready_for_pickup($1)`, [big])).rejects.toThrow(/paid or credit-approved/);
    await approveStep(big, ceo);
    expect((await order(big)).status).toBe("confirmed");
    const before = await onHand(sauce);
    await t.as(wh, `select public.mark_ready_for_pickup($1)`, [big]);
    expect(await onHand(sauce)).toBe(before - 3);
    expect((await order(big)).due_date).not.toBeNull();
    expect(num((await t.as<{ b: string }>(head, `select public.customer_balance($1) b`, [c]))[0].b)).toBe(1280);
  });

  it("rejected credit cancels the order and frees the stock", async () => {
    const c = (await t.as<{ id: string }>(head, `insert into public.customers (code, name, type, payment_terms_days, credit_limit, on_hold) values ('', 'On Hold Co', 'corporate', 30, 50000, true) returning id`))[0].id;
    const av = await available(cups);
    const id = await staffOrder(head, c, [{ product: cups, qty: 2 }], "terms");
    await t.as(head, `select public.place_sales_order($1)`, [id]);
    expect(await available(cups)).toBe(av - 2);
    const s = await one<{ id: string }>(`select s.id from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1 and s.status = 'pending'`, [id]);
    await t.as(ceo, `select public.act_on_approval($1, 'reject', 'customer on hold')`, [s.id]);
    expect((await order(id)).status).toBe("cancelled");
    expect(await available(cups)).toBe(av);
  });

  it("cancelling frees reservations; unpaid shop orders auto-cancel", async () => {
    const av = await available(cups);
    const r = (await shopOrder("09187770000", [{ sku: "MAT-CUPS-S", qty: 4 }]))[0].r;
    expect(await available(cups)).toBe(av - 4);
    await t.db.query(`update public.sales_orders set placed_at = now() - interval '49 hours' where number = $1`, [r.number]);
    expect((await one<{ n: number }>(`select public.cancel_unpaid_orders() n`)).n).toBeGreaterThan(0);
    expect((await one(`select status from public.sales_orders where number = $1`, [r.number])).status).toBe("cancelled");
    expect(await available(cups)).toBe(av);
  });
});

describe("official sales invoice monitoring", () => {
  it("flags duplicates, gaps, out-of-range numbers and invoices without SI", async () => {
    await t.as(acct, `insert into public.si_booklets (series, start_no, end_no) values ('A', 1001, 1050)`);
    await expect(t.as(acct, `insert into public.si_booklets (series, start_no, end_no) values ('A', 1040, 1100)`)).rejects.toThrow(/overlaps/);
    const invs = await t.as<{ id: string }>(acct, `select id from public.billing_invoices where status = 'issued' order by number`);
    expect(invs.length).toBeGreaterThan(1);
    await t.as(acct, `select public.record_si($1, 'A', 1001)`, [invs[0].id]);
    await expect(t.as(acct, `select public.record_si($1, 'A', 1001)`, [invs[1].id])).rejects.toThrow(/duplicate/);
    await expect(t.as(acct, `select public.record_si($1, 'A', 1005)`, [invs[0].id])).rejects.toThrow(/already has/);
    await t.as(acct, `select public.record_si(null, 'A', 1004, 'void', 'Wrong amount written')`); // invs[1] stays without SI
    await t.as(acct, `select public.record_si(null, 'A', 1002, 'spoiled', 'Torn')`);
    await t.as(acct, `select public.record_si(null, 'B', 77, 'void', 'Old booklet')`);
    await t.db.query(`update public.billing_invoices set issued_on = issued_on - 2`);
    const ex = await t.as<{ kind: string; si_no: number | null }>(acct, `select kind, si_no from public.si_exceptions order by kind, si_no`);
    expect(ex.filter((e) => e.kind === "gap").map((e) => e.si_no)).toEqual([1003]);
    expect(ex.filter((e) => e.kind === "out_of_range").map((e) => e.si_no)).toEqual([77]);
    expect(ex.some((e) => e.kind === "missing_si")).toBe(true);
    await expect(t.as(rep, `select public.record_si(null, 'A', 1010, 'void', 'x')`)).rejects.toThrow(/can't record/);
  });
});

describe("audit", () => {
  it("every new sales table is audited or exempt", async () => {
    const missing = await t.db.query<{ t: string }>(`
      select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('customers','customer_contacts','customer_addresses','customer_prices','price_lists','price_list_items','leads','activities',
                          'sales_orders','sales_order_lines','sales_order_allocations','payments','shipments','billing_invoices','si_booklets','si_issuances')
        and not exists (select 1 from public.audit_tables a where a.table_name = c.relname)
        and not exists (select 1 from public.audit_exempt e where e.table_name = c.relname)`);
    expect(missing.rows).toEqual([]);
  });
});
