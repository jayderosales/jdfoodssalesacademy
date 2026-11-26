/**
 * Whole-app simulation on the real migrations.
 *  A. One business day through every module, as the real roles: buy → receive → QA → bill → pay supplier,
 *     sell → pay → pack → release → deliver, petty cash → liquidate, production report, transmittal, CEO reports.
 *     Checks that money and stock end up where they should and nothing fails to post.
 *  B. A year of volume (thousands of orders, payments, journal lines), then times the CEO and accounting reports
 *     so slow queries show up before users feel them.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const u = (n: number) => `74000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ceo = u(1), ops = u(2), acct = u(3), acct2 = u(4), wh = u(5), qa = u(6), rep = u(7), sup = u(8), staff = u(9);
let fg = "", plant = "", sauce = "", supplier = "";

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const num = (v: unknown) => Number(v);
const approve = async (record: string, by = ceo) => {
  const s = await one<{ id: string }>(`select s.id from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1 and s.status = 'pending'`, [record]);
  await t.as(by, `select public.act_on_approval($1, 'approve', 'ok')`, [s.id]);
};
const bal = async (key: string) => num((await one<{ b: string }>(`select coalesce(sum(jl.debit - jl.credit), 0) b from public.journal_lines jl join public.journal_entries j on j.id = jl.entry_id join public.accounts a on a.id = jl.account_id where j.status = 'posted' and a.system_key = $1`, [key])).b);
const onHand = async (product: string) => num((await one<{ q: string }>(`select coalesce(sum(on_hand), 0) q from public.stock_balances where product_id = $1`, [product])).q);
const timed = async <T>(label: string, f: () => Promise<T>, log: { step: string; ms: number }[]) => {
  const s = performance.now();
  const r = await f();
  log.push({ step: label, ms: Math.round(performance.now() - s) });
  return r;
};

beforeAll(async () => {
  t = await createTestDb();
  fg = (await one<{ id: string }>(`select id from public.locations where code = 'PLR-FG'`)).id;
  plant = (await one<{ id: string }>(`select id from public.locations where type in ('plant', 'warehouse') and active order by type = 'plant' desc limit 1`)).id;
  await t.createUser(ceo, "ceo@sim.ph", ["ceo"]);
  await t.createUser(ops, "ops@sim.ph", ["operations_manager"]);
  await t.createUser(acct, "acct@sim.ph", ["accounting_officer"]);
  await t.createUser(acct2, "acct2@sim.ph", ["accounting_officer"]);
  await t.createUser(wh, "wh@sim.ph", ["warehouse"]);
  await t.createUser(qa, "qa@sim.ph", ["qa"]);
  await t.createUser(rep, "rep@sim.ph", ["sales_head"]);
  await t.createUser(sup, "sup@sim.ph", ["manufacturing"]);
  await t.createUser(staff, "staff@sim.ph", ["employee"]);
  sauce = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit, shelf_life_days, srp) values ('SIM-1L', 'Sim Sauce 1L', 'finished_good', 'bottle', 365, 112) returning id`))[0].id;
  supplier = (await t.as<{ id: string }>(ops, `insert into public.suppliers (code, name, vat_registered, payment_terms_days) values ('', 'Sim Bottler Inc', true, 30) returning id`))[0].id;
  await t.as(ops, `update public.suppliers set status = 'approved' where id = $1`, [supplier]);
  await t.db.query(`update public.suppliers set ewt_rate = 1 where id = $1`, [supplier]);
});

describe("A. one business day through every module", () => {
  it("buys, sells, pays, produces and reports with the books balanced and nothing unposted", async () => {
    const log: { step: string; ms: number }[] = [];

    // ---- procure: PO → CEO approval → receive → QA release → supplier invoice (3-way match)
    const po = (await t.as<{ id: string }>(ops, `insert into public.purchase_orders (number, supplier_id, location_id) values ('', $1, $2) returning id`, [supplier, fg]))[0].id;
    await t.as(ops, `insert into public.purchase_order_lines (po_id, product_id, unit_code, qty, unit_price) values ($1, $2, 'bottle', 100, 56)`, [po, sauce]);
    await timed("submit PO", () => t.as(ops, `select public.submit_purchase_order($1)`, [po]), log);
    await timed("CEO approves PO", () => approve(po), log);
    await t.as(ops, `select public.mark_po_sent($1)`, [po]);
    const line = (await one<{ id: string }>(`select id from public.purchase_order_lines where po_id = $1`, [po])).id;
    await timed("receive PO (stock in, QA hold)", () => t.as(wh, `select public.receive_purchase_order($1, $2, 'DR-1')`, [po, JSON.stringify([{ po_line_id: line, qty: 100, lot_no: "SIM1", expiry_date: "2027-11-01" }])]), log);
    const batch = (await one<{ id: string }>(`select id from public.batches where product_id = $1`, [sauce])).id;
    await timed("QA releases lot", () => t.as(qa, `select public.set_batch_status($1, 'released', 'ok')`, [batch]), log);
    expect(await onHand(sauce)).toBe(100);
    const inv = (await t.as<{ id: string }>(acct, `insert into public.supplier_invoices (number, supplier_id, po_id, invoice_no, invoice_date) values ('', $1, $2, 'SIM-INV-1', current_date) returning id`, [supplier, po]))[0].id;
    await t.as(acct, `insert into public.supplier_invoice_lines (invoice_id, po_line_id, qty, unit_price) values ($1, $2, 100, 56)`, [inv, line]);
    expect((await timed("match supplier invoice", () => t.as<{ s: string }>(acct, `select public.match_supplier_invoice($1) s`, [inv]), log))[0].s).toBe("matched");

    // ---- sell: order → payment → confirm (other person) → pack → release (stock out, sale posted) → dispatch → deliver
    const c = (await t.as<{ id: string }>(rep, `insert into public.customers (code, name) values ('', 'Sim Grocery') returning id`))[0].id;
    const o = (await t.as<{ id: string }>(rep, `insert into public.sales_orders (number, customer_id, payment_mode, location_id, rep_id) values ('x', $1, 'prepaid', $2, $3) returning id`, [c, fg, rep]))[0].id;
    await t.as(rep, `insert into public.sales_order_lines (order_id, product_id, qty) values ($1, $2, 10)`, [o, sauce]);
    await timed("place order (reserve FEFO)", () => t.as(rep, `select public.place_sales_order($1)`, [o]), log);
    const p = (await timed("record payment", () => t.as<{ p: string }>(acct, `select public.record_payment($1, $2, 'gcash', 1120, 'GC-1') p`, [c, o]), log))[0].p;
    await timed("confirm payment", () => t.as(acct2, `select public.confirm_payment($1)`, [p]), log);
    await t.as(wh, `select public.start_packing($1)`, [o]);
    await timed("ready for pickup (stock out + sale posted)", () => t.as(wh, `select public.mark_ready_for_pickup($1)`, [o]), log);
    await t.as(wh, `select public.dispatch_order($1, 'J&T Express', 'JT-SIM', 120, null)`, [o]);
    await t.as(wh, `select public.mark_delivered($1, 'ok')`, [o]);
    expect(await onHand(sauce)).toBe(90);

    // ---- pay the supplier (CEO approval) with withholding tax
    const bank = (await one<{ id: string }>(`select id from public.accounts where system_key = 'bank_main'`)).id;
    const pay = (await t.as<{ id: string }>(acct, `insert into public.supplier_payments (number, supplier_id, account_id) values ('', $1, $2) returning id`, [supplier, bank]))[0].id;
    await t.as(acct, `insert into public.supplier_payment_lines (payment_id, invoice_id, amount) values ($1, $2, 5600)`, [pay, inv]);
    await t.as(acct, `select public.submit_supplier_payment($1)`, [pay]);
    await approve(pay);
    await timed("supplier payment paid (posted)", () => t.as(acct, `select public.mark_supplier_payment_paid($1, 'BDO-SIM')`, [pay]), log);

    // ---- petty cash → ops approves → accounting releases → staff liquidates with a receipt
    const pc = (await t.as<{ id: string }>(staff, `insert into public.petty_cash_requests (number, entity_id, amount, purpose) values ('', (select id from public.entities limit 1), 500, 'Courier') returning id`))[0].id;
    await t.as(staff, `select public.submit_petty_cash($1)`, [pc]);
    await approve(pc, ops);
    const courier = (await one<{ id: string }>(`select id from public.accounts where code = '6040'`)).id;
    await t.as(acct, `select public.release_petty_cash($1, $2)`, [pc, courier]);
    await timed("liquidate petty cash receipt", () => t.as(staff, `select public.record_expense_receipt(current_date, 'LBC Express', '', 'OR-55', 480, 0, $1, 'Samples', $2, null)`, [courier, pc]), log);

    // ---- production report, document transmittal
    const pr = (await t.as<{ id: string }>(sup, `insert into public.production_reports (number, location_id) values ('', $1) returning id`, [plant]))[0].id;
    await t.as(sup, `insert into public.production_report_lines (report_id, product_id, qty, unit_code, lot_no, mfg_date) values ($1, $2, 240, '', 'P-SIM-1', current_date)`, [pr, sauce]);
    await timed("submit production report", () => t.as(sup, `select public.submit_production_report($1)`, [pr]), log);
    const tr = (await t.as<{ id: string }>(staff, `insert into public.document_transmittals (number, from_name) values ('', 'Branch') returning id`))[0].id;
    const tl = (await t.as<{ id: string }>(staff, `insert into public.document_transmittal_lines (transmittal_id, doc_type, doc_no) values ($1, 'Sales invoice', '1001') returning id`, [tr]))[0].id;
    await t.as(acct, `select public.receive_transmittal($1, $2)`, [tr, [tl]]);

    // ---- the books and the CEO view
    expect((await one<{ n: number }>(`select count(*)::int n from public.unposted_events where resolved_at is null`)).n).toBe(0);
    const tb = await t.as<{ debit: string; credit: string; closing: string }>(acct, `select * from public.trial_balance(date_trunc('year', current_date)::date, current_date)`);
    expect(tb.reduce((s, r) => s + num(r.closing), 0)).toBeCloseTo(0, 2); // debits = credits
    expect(await bal("ap")).toBe(0); // invoice paid in full
    expect(await bal("ar")).toBe(0); // order paid in full
    expect(await bal("ewt_payable")).toBe(-50);
    const snap = (await timed("CEO snapshot", () => t.as<{ s: { sales: { today: string }; production_today: { lots: number } } }>(ceo, `select public.ceo_snapshot() s`), log))[0].s;
    expect(num(snap.sales.today)).toBe(1120);
    expect(snap.production_today.lots).toBe(1);
    expect(await one<{ n: number }>(`select public.send_ceo_daily_digest() n`)).toEqual({ n: 1 });

    console.table(log);
  });
});

describe("B. a year of volume", () => {
  it("keeps every report fast with thousands of records", async () => {
    // bulk seed as the database owner with triggers off (the rules were exercised in part A)
    await t.db.exec(`
      set session_replication_role = replica;
      insert into public.products (id, sku, name, item_type, base_unit, srp)
        select gen_random_uuid(), 'VOL-' || g, 'Volume product ' || g, 'finished_good', 'bottle', 50 + g from generate_series(1, 60) g;
      insert into public.customers (id, code, name) select gen_random_uuid(), 'VC' || g, 'Volume customer ' || g from generate_series(1, 400) g;
      create temp table vp as select id, row_number() over () rn from public.products where sku like 'VOL-%';
      create temp table vc as select id, row_number() over () rn from public.customers where code like 'VC%';
      insert into public.sales_orders (id, number, customer_id, channel, status, payment_mode, location_id, total, paid_amount, ready_at, rep_id, due_date, placed_at)
        select gen_random_uuid(), 'VSO-' || g, (select id from vc where rn = 1 + g % 400), (array['shop','phone','field','messenger'])[1 + g % 4],
               'delivered', case when g % 5 = 0 then 'terms' else 'prepaid' end, '${"$"}{FG}', 1000, case when g % 5 = 0 then 0 else 1000 end,
               now() - ((g % 365) || ' days')::interval, case when g % 3 = 0 then '${rep}'::uuid end, current_date - (g % 90) + 30, now() - ((g % 365) || ' days')::interval
        from generate_series(1, 6000) g;
      insert into public.sales_order_lines (order_id, product_id, qty, list_price, unit_price, line_total)
        select o.id, (select id from vp where rn = 1 + (abs(hashtext(o.number)) % 60)), 10, 100, 100, 1000 from public.sales_orders o where o.number like 'VSO-%';
      insert into public.payments (number, customer_id, order_id, method, amount, paid_on, status)
        select 'VPAY-' || o.number, o.customer_id, o.id, 'gcash', 1000, (o.ready_at)::date, 'confirmed' from public.sales_orders o where o.number like 'VSO-%' and o.paid_amount > 0;
      insert into public.journal_entries (id, number, entry_date, source, status, is_test, total, posted_at)
        select gen_random_uuid(), 'VJE-' || g, current_date - (g % 365), 'manual', 'posted', true, 1000, now() from generate_series(1, 12000) g;
      insert into public.journal_lines (entry_id, line_no, account_id, debit, credit)
        select j.id, 1, (select id from public.accounts where system_key = 'ar'), 1000, 0 from public.journal_entries j where j.number like 'VJE-%'
        union all
        select j.id, 2, (select id from public.accounts where system_key = 'sales'), 0, 1000 from public.journal_entries j where j.number like 'VJE-%';
      set session_replication_role = origin;
      analyze;
    `.replaceAll("${FG}", fg));
    expect((await one<{ n: number }>(`select count(*)::int n from public.sales_orders where number like 'VSO-%'`)).n).toBe(6000);

    const log: { step: string; ms: number }[] = [];
    const run = (label: string, sql: string, params: unknown[] = []) => timed(label, () => t.as(ceo, sql, params), log);
    await run("CEO snapshot", `select public.ceo_snapshot()`);
    await run("daily sales, 30 days", `select * from public.ceo_sales_daily(current_date - 29, current_date)`);
    await run("daily sales, 365 days", `select * from public.ceo_sales_daily(current_date - 364, current_date)`);
    for (const d of ["channel", "brand", "rep", "customer", "product"]) await run(`sales by ${d}, year`, `select * from public.ceo_sales_breakdown(date_trunc('year', current_date)::date, current_date, $1)`, [d]);
    await run("training vs sales", `select * from public.ceo_rep_performance()`);
    await run("trial balance, month", `select * from public.trial_balance(date_trunc('month', current_date)::date, current_date)`);
    await run("trial balance, year", `select * from public.trial_balance(date_trunc('year', current_date)::date, current_date)`);
    await run("receivables open items", `select id, total, paid_amount from public.sales_orders where status in ('ready_for_pickup','dispatched','delivered') and paid_amount < total`);
    await run("ledger, AR account month", `select jl.id from public.journal_lines jl join public.journal_entries j on j.id = jl.entry_id where jl.account_id = (select id from public.accounts where system_key = 'ar') and j.status = 'posted' and j.entry_date >= date_trunc('month', current_date)`);
    console.table(log);
    // PGlite runs single-threaded in WebAssembly, several times slower than the real database; the bound catches
    // runaway queries (missing indexes, row-by-row loops), not normal variation.
    for (const r of log) expect(r.ms, r.step).toBeLessThan(1000); // were 1–19 s before 20261210000001_rls_performance
  }, 300_000);
});
