/**
 * Phase 5a: chart of accounts, balanced/immutable journals, locked periods, manual journals with CEO approval,
 * reversals, and the posting engine for order-to-cash, procure-to-pay, stock losses, petty cash and supplier payments.
 * Also the unposted queue, bank auto-match, trial balance and starting the books.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const u = (n: number) => `70000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ceo = u(1);
const cfo = u(2);
const acct = u(3);
const acct2 = u(4);
const ops = u(5);
const wh = u(6);
const qa = u(7);
const rep = u(8);
const staff = u(9);
let fg = "";
let sauce = ""; // finished good, SRP 112 (VAT-inclusive)
let sup = "";

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const num = (v: unknown) => Number(v);
const approve = async (record: string, by = ceo) => {
  const s = await one<{ id: string }>(`select s.id from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1 and s.status = 'pending'`, [record]);
  await t.as(by, `select public.act_on_approval($1, 'approve', 'ok')`, [s.id]);
};
/** Balance of an account by system key (debit − credit) over posted entries. */
const bal = async (key: string) =>
  num((await one<{ b: string }>(`select coalesce(sum(jl.debit - jl.credit), 0) b from public.journal_lines jl join public.journal_entries j on j.id = jl.entry_id join public.accounts a on a.id = jl.account_id where j.status = 'posted' and a.system_key = $1`, [key])).b);
const entriesFor = (sourceTable: string, sourceId: string) =>
  t.db.query<{ source: string; total: string }>(`select source, total from public.journal_entries where source_table = $1 and source_id = $2 and status = 'posted' order by created_at`, [sourceTable, sourceId]).then((r) => r.rows);

beforeAll(async () => {
  t = await createTestDb();
  fg = (await one<{ id: string }>(`select id from public.locations where code = 'PLR-FG'`)).id;
  await t.createUser(ceo, "ceo@x.ph", ["ceo"]);
  await t.createUser(cfo, "cfo@x.ph", ["cfo"]);
  await t.createUser(acct, "acct@x.ph", ["accounting_officer"]);
  await t.createUser(acct2, "acct2@x.ph", ["accounting_officer"]);
  await t.createUser(ops, "ops@x.ph", ["operations_manager"]);
  await t.createUser(wh, "wh@x.ph", ["warehouse"]);
  await t.createUser(qa, "qa@x.ph", ["qa"]);
  await t.createUser(rep, "rep@x.ph", ["sales_head"]);
  await t.createUser(staff, "staff@x.ph", ["employee"]);
  sauce = (await t.as<{ id: string }>(ops, `insert into public.products (sku, name, item_type, base_unit, shelf_life_days, srp) values ('P1-1L', 'Sweet BBQ 1L', 'finished_good', 'bottle', 365, 112) returning id`))[0].id;
  sup = (await t.as<{ id: string }>(ops, `insert into public.suppliers (code, name, vat_registered, payment_terms_days) values ('', 'Sauce Bottler Inc', true, 30) returning id`))[0].id;
  await t.as(ops, `update public.suppliers set status = 'approved' where id = $1`, [sup]);
  await t.db.query(`update public.suppliers set ewt_rate = 1 where id = $1`, [sup]);
});

describe("chart of accounts and journals", () => {
  it("seeds a chart with the posting accounts the engine needs", async () => {
    const keys = (await t.db.query<{ system_key: string }>(`select system_key from public.accounts where system_key is not null`)).rows.map((r) => r.system_key);
    for (const k of ["ar", "ap", "inventory", "sales", "output_vat", "input_vat", "cogs", "grni", "ewt_payable", "petty_cash", "bank_main"]) expect(keys).toContain(k);
    // staff can't see the books: only the names of expense accounts (to say what a petty cash receipt was for)
    expect((await t.as(staff, `select id from public.accounts where type <> 'expense'`)).length).toBe(0);
    expect((await t.as(staff, `select id from public.journal_lines`)).length).toBe(0);
  });

  it("manual journals must balance, need CEO approval, and can't change once posted", async () => {
    const je = (await t.as<{ id: string; number: string }>(acct, `insert into public.journal_entries (number, entry_date, memo) values ('', current_date, 'Owner capital') returning id, number`))[0];
    expect(je.number).toMatch(/^JE-/);
    const bank = (await one<{ id: string }>(`select id from public.accounts where system_key = 'bank_main'`)).id;
    const cap = (await one<{ id: string }>(`select id from public.accounts where code = '3010'`)).id;
    const header = (await one<{ id: string }>(`select id from public.accounts where code = '1000'`)).id;
    await expect(t.as(acct, `insert into public.journal_lines (entry_id, account_id, debit) values ($1, $2, 100)`, [je.id, header])).rejects.toThrow(/heading/);
    await t.as(acct, `insert into public.journal_lines (entry_id, account_id, debit) values ($1, $2, 100000)`, [je.id, bank]);
    await t.as(acct, `insert into public.journal_lines (entry_id, account_id, credit) values ($1, $2, 90000)`, [je.id, cap]);
    await expect(t.as(acct, `select public.submit_journal($1)`, [je.id])).rejects.toThrow(/must be equal/);
    await t.as(acct, `update public.journal_lines set credit = 100000 where entry_id = $1 and credit > 0`, [je.id]);
    await t.as(acct, `select public.submit_journal($1)`, [je.id]);
    await approve(je.id);
    const posted = await one<{ status: string; total: string; is_test: boolean }>(`select status, total, is_test from public.journal_entries where id = $1`, [je.id]);
    expect(posted).toMatchObject({ status: "posted", is_test: true });
    expect(num(posted.total)).toBe(100000);
    await expect(t.db.query(`update public.journal_lines set debit = 1 where entry_id = $1`, [je.id])).rejects.toThrow(/can't be changed/);
    await expect(t.db.query(`delete from public.journal_entries where id = $1`, [je.id])).rejects.toThrow(/can't be deleted/);
    // reversal mirrors it
    const rid = (await t.as<{ r: string }>(acct, `select public.reverse_journal($1, current_date, 'Entered twice') r`, [je.id]))[0].r;
    expect((await one<{ reversed_by: string }>(`select reversed_by from public.journal_entries where id = $1`, [je.id])).reversed_by).toBe(rid);
  });

  it("locked periods reject postings", async () => {
    const last = (await one<{ d: string }>(`select (date_trunc('month', current_date) - interval '1 month')::date::text d`)).d;
    await t.as(cfo, `select public.close_period($1, 'locked')`, [last]);
    const je = (await t.as<{ id: string }>(acct, `insert into public.journal_entries (number, entry_date, memo) values ('', $1, 'Late') returning id`, [last]))[0].id;
    const a1 = (await one<{ id: string }>(`select id from public.accounts where code = '6020'`)).id;
    const a2 = (await one<{ id: string }>(`select id from public.accounts where system_key = 'bank_main'`)).id;
    await t.as(acct, `insert into public.journal_lines (entry_id, account_id, debit) values ($1, $2, 500), ($1, $3, 0.01)`, [je, a1, a2]).catch(() => undefined);
    await t.as(acct, `delete from public.journal_lines where entry_id = $1`, [je]);
    await t.as(acct, `insert into public.journal_lines (entry_id, account_id, debit) values ($1, $2, 500)`, [je, a1]);
    await t.as(acct, `insert into public.journal_lines (entry_id, account_id, credit) values ($1, $2, 500)`, [je, a2]);
    await expect(t.as(acct, `select public.submit_journal($1)`, [je])).rejects.toThrow(/locked/);
    await expect(t.as(acct, `select public.close_period($1, 'open')`, [last])).rejects.toThrow(/finance head/);
  });
});

describe("order to cash", () => {
  let order = "";
  let customer = "";
  it("receiving stock posts inventory against clearing; QA release changes nothing", async () => {
    const r = (await t.as<{ id: string }>(ops, `insert into public.stock_receipts (number, location_id) values ('x', $1) returning id`, [fg]))[0];
    await t.as(ops, `insert into public.stock_receipt_lines (receipt_id, product_id, unit_code, qty, unit_cost, lot_no, expiry_date) values ($1, $2, 'bottle', 100, 50, 'L1', current_date + 300)`, [r.id, sauce]);
    await t.as(ops, `select public.post_receipt($1)`, [r.id]);
    const b = (await one<{ id: string }>(`select id from public.batches where lot_no = 'L1'`)).id;
    await t.as(qa, `select public.set_batch_status($1, 'released', 'ok')`, [b]);
    expect(await bal("inventory")).toBe(5000);
    expect(await bal("inventory_clearing")).toBe(-5000);
  });

  it("releasing a sale posts AR / revenue / output VAT and COGS / inventory; the payment clears AR", async () => {
    customer = (await t.as<{ id: string }>(rep, `insert into public.customers (code, name) values ('', 'Cash Buyer') returning id`))[0].id;
    order = (await t.as<{ id: string }>(rep, `insert into public.sales_orders (number, customer_id, channel, payment_mode, location_id) values ('x', $1, 'phone', 'prepaid', $2) returning id`, [customer, fg]))[0].id;
    await t.as(rep, `insert into public.sales_order_lines (order_id, product_id, qty) values ($1, $2, 10)`, [order, sauce]); // 10 × 112 = 1,120 incl. VAT
    await t.as(rep, `select public.place_sales_order($1)`, [order]);
    const pid = (await t.as<{ p: string }>(acct, `select public.record_payment($1, $2, 'gcash', 1120, 'GC-555') p`, [customer, order]))[0].p;
    await t.as(acct2, `select public.confirm_payment($1)`, [pid]);
    expect(await bal("gcash")).toBe(1120);
    expect(await bal("ar")).toBe(-1120); // customer paid ahead of release
    await t.as(wh, `select public.mark_ready_for_pickup($1)`, [order]);
    expect(await bal("ar")).toBe(0);
    expect(await bal("sales")).toBe(-1000);
    expect(await bal("output_vat")).toBe(-120);
    expect(await bal("cogs")).toBe(500);
    expect(await bal("inventory")).toBe(4500);
    const e = await entriesFor("sales_orders", order);
    expect(e.map((x) => x.source)).toEqual(["sale"]);
    // the sale line carries the channel and customer for drill-down
    const line = await one<{ channel: string; customer_id: string }>(`select jl.channel, jl.customer_id from public.journal_lines jl join public.journal_entries j on j.id = jl.entry_id join public.accounts a on a.id = jl.account_id where j.source = 'sale' and a.system_key = 'sales'`);
    expect(line).toMatchObject({ channel: "phone", customer_id: customer });
  });

  it("a return reverses the sale and brings the cost back", async () => {
    await t.as(wh, `select public.return_sales_order($1, 'Damaged bottles')`, [order]);
    expect(await bal("sales")).toBe(0);
    expect(await bal("output_vat")).toBe(0);
    expect(await bal("ar")).toBe(-1120); // money still held for the customer (refund or credit)
    expect(await bal("cogs")).toBe(0);
  });
});

describe("procure to pay", () => {
  it("PO receipt → GRNI; matched invoice → GRNI + input VAT / AP; CEO-approved payment → AP / bank / EWT", async () => {
    const po = (await t.as<{ id: string }>(ops, `insert into public.purchase_orders (number, supplier_id, location_id) values ('', $1, $2) returning id`, [sup, fg]))[0].id;
    await t.as(ops, `insert into public.purchase_order_lines (po_id, product_id, unit_code, qty, unit_price) values ($1, $2, 'bottle', 100, 56)`, [po, sauce]); // 5,600 incl VAT → net 5,000
    await t.as(ops, `select public.submit_purchase_order($1)`, [po]);
    await approve(po);
    await t.as(ops, `select public.mark_po_sent($1)`, [po]);
    const line = (await one<{ id: string }>(`select id from public.purchase_order_lines where po_id = $1`, [po])).id;
    await t.as(wh, `select public.receive_purchase_order($1, $2)`, [po, JSON.stringify([{ po_line_id: line, qty: 100, lot_no: "L2", expiry_date: "2027-09-01" }])]);
    expect(await bal("grni")).toBe(-5000);

    const inv = (await t.as<{ id: string }>(acct, `insert into public.supplier_invoices (number, supplier_id, po_id, invoice_no, invoice_date) values ('', $1, $2, 'INV-77', current_date) returning id`, [sup, po]))[0].id;
    await t.as(acct, `insert into public.supplier_invoice_lines (invoice_id, po_line_id, qty, unit_price) values ($1, $2, 100, 56)`, [inv, line]);
    expect((await t.as<{ s: string }>(acct, `select public.match_supplier_invoice($1) s`, [inv]))[0].s).toBe("matched");
    expect(await bal("grni")).toBe(0);
    expect(await bal("input_vat")).toBe(600);
    expect(await bal("ap")).toBe(-5600);

    const bank = (await one<{ id: string }>(`select id from public.accounts where system_key = 'bank_main'`)).id;
    const pay = (await t.as<{ id: string; number: string }>(acct, `insert into public.supplier_payments (number, supplier_id, account_id) values ('', $1, $2) returning id, number`, [sup, bank]))[0];
    expect(pay.number).toMatch(/^SPAY-/);
    await expect(t.as(acct, `insert into public.supplier_payment_lines (payment_id, invoice_id, amount) values ($1, $2, 9999)`, [pay.id, inv])).rejects.toThrow(/still open/);
    await t.as(acct, `insert into public.supplier_payment_lines (payment_id, invoice_id, amount) values ($1, $2, 5600)`, [pay.id, inv]);
    const p = await one<{ gross: string; ewt_amount: string; net_paid: string }>(`select gross, ewt_amount, net_paid from public.supplier_payments where id = $1`, [pay.id]);
    expect([num(p.gross), num(p.ewt_amount), num(p.net_paid)]).toEqual([5600, 50, 5550]); // 1% of net 5,000
    await expect(t.as(acct, `select public.mark_supplier_payment_paid($1, 'BDO-1')`, [pay.id])).rejects.toThrow(/approved/);
    await t.as(acct, `select public.submit_supplier_payment($1)`, [pay.id]);
    const s = await one<{ approver_ids: string[] }>(`select s.approver_ids from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1`, [pay.id]);
    expect(s.approver_ids).toEqual([ceo]);
    await approve(pay.id);
    await t.as(acct, `select public.mark_supplier_payment_paid($1, 'BDO-TRF-889')`, [pay.id]);
    expect(await bal("ap")).toBe(0);
    expect(await bal("ewt_payable")).toBe(-50);
    expect(num((await one<{ paid_amount: string }>(`select paid_amount from public.supplier_invoices where id = $1`, [inv])).paid_amount)).toBe(5600);
  });
});

describe("other postings", () => {
  it("damage write-off: inventory loss / inventory", async () => {
    const before = await bal("inventory_loss");
    const b = (await one<{ id: string }>(`select id from public.batches where lot_no = 'L1'`)).id;
    const adj = (await t.as<{ id: string }>(wh, `insert into public.stock_adjustments (number, location_id, reason_type) values ('x', $1, 'damage') returning id`, [fg]))[0].id;
    await t.as(wh, `insert into public.stock_adjustment_lines (adjustment_id, product_id, batch_id, qty) values ($1, $2, $3, -2)`, [adj, sauce, b]);
    await t.as(wh, `select public.submit_adjustment($1)`, [adj]);
    await approve(adj, ops);
    expect((await bal("inventory_loss")) - before).toBeGreaterThan(0);
  });

  it("petty cash release posts the expense against the fund", async () => {
    const pc = (await t.as<{ id: string }>(staff, `insert into public.petty_cash_requests (number, entity_id, amount, purpose) values ('', (select id from public.entities limit 1), 750, 'Courier for samples') returning id`))[0].id;
    await t.as(staff, `select public.submit_petty_cash($1)`, [pc]);
    await approve(pc, ops);
    const courier = (await one<{ id: string }>(`select id from public.accounts where code = '6040'`)).id;
    await expect(t.as(staff, `select public.release_petty_cash($1, $2)`, [pc, courier])).rejects.toThrow(/accounting/);
    await t.as(acct, `select public.release_petty_cash($1, $2)`, [pc, courier]);
    expect(await bal("petty_cash")).toBe(-750);
  });

  it("a missing account sends the event to the unposted queue without blocking the sale", async () => {
    // the guard stops anyone deactivating a system account; simulate a broken setup behind its back
    await t.db.query(`alter table public.accounts disable trigger account_guard`);
    await t.db.query(`update public.accounts set active = false where system_key = 'cogs'`);
    const r = (await t.as<{ id: string }>(ops, `insert into public.stock_receipts (number, location_id) values ('x', $1) returning id`, [fg]))[0];
    await t.as(ops, `insert into public.stock_receipt_lines (receipt_id, product_id, unit_code, qty, unit_cost, lot_no, expiry_date) values ($1, $2, 'bottle', 5, 50, 'L3', current_date + 300)`, [r.id, sauce]);
    await t.as(ops, `select public.post_receipt($1)`, [r.id]);
    const c = (await t.as<{ id: string }>(rep, `insert into public.customers (code, name) values ('', 'Queue Test') returning id`))[0].id;
    const o = (await t.as<{ id: string }>(rep, `insert into public.sales_orders (number, customer_id, payment_mode, location_id) values ('x', $1, 'prepaid', $2) returning id`, [c, fg]))[0].id;
    await t.as(rep, `insert into public.sales_order_lines (order_id, product_id, qty) values ($1, $2, 1)`, [o, sauce]);
    await t.as(rep, `select public.place_sales_order($1)`, [o]);
    const p = (await t.as<{ p: string }>(acct, `select public.record_payment($1, $2, 'cash', 112, '') p`, [c, o]))[0].p;
    await t.as(acct2, `select public.confirm_payment($1)`, [p]);
    await t.as(wh, `select public.mark_ready_for_pickup($1)`, [o]);
    expect((await one(`select status from public.sales_orders where id = $1`, [o])).status).toBe("ready_for_pickup"); // the sale went through
    const q = await t.as<{ error: string }>(acct, `select error from public.unposted_events where resolved_at is null`);
    expect(q.some((x) => /cogs/.test(x.error))).toBe(true);
    await t.db.query(`update public.accounts set active = true where system_key = 'cogs'`);
    await t.db.query(`alter table public.accounts enable trigger account_guard`);
    expect((await t.as<{ n: number }>(acct, `select public.retry_unposted() n`))[0].n).toBeGreaterThan(0);
    expect((await t.as(acct, `select 1 from public.unposted_events where resolved_at is null`)).length).toBe(0);
  });

  it("system accounts can be renamed but not deactivated, and accounts can't be deleted", async () => {
    await expect(t.db.query(`update public.accounts set active = false where system_key = 'cogs'`)).rejects.toThrow(/automatic postings/);
    await expect(t.db.query(`update public.accounts set code = '5011' where system_key = 'cogs'`)).rejects.toThrow(/automatic postings/);
    await t.db.query(`update public.accounts set name = 'Cost of goods sold (renamed)' where system_key = 'cogs'`);
    await expect(t.db.query(`delete from public.accounts where code = '6110'`)).rejects.toThrow(/can't be deleted/);
  });
});

describe("reports, bank reconciliation, starting the books", () => {
  it("the trial balance balances and AR/AP tie out", async () => {
    const tb = await t.as<{ debit: string; credit: string; closing: string }>(acct, `select * from public.trial_balance('2000-01-01', current_date)`);
    const sum = tb.reduce((s, r) => s + num(r.closing), 0);
    expect(Math.round(sum * 100)).toBe(0);
    expect((await t.as(staff, `select * from public.trial_balance('2000-01-01', current_date)`)).filter((r) => num((r as { closing: string }).closing) !== 0).length).toBe(0);
  });

  it("bank auto-match pairs statement lines with ledger lines", async () => {
    const bank = (await one<{ id: string }>(`select id from public.accounts where system_key = 'bank_main'`)).id;
    await t.as(acct, `insert into public.bank_statement_lines (account_id, txn_date, description, amount) values ($1, current_date, 'TRF BDO-TRF-889', -5550), ($1, current_date, 'Unknown fee', -25)`, [bank]);
    expect((await t.as<{ n: number }>(acct, `select public.bank_auto_match($1) n`, [bank]))[0].n).toBe(1);
    expect((await t.as(acct, `select id from public.bank_statement_lines where journal_line_id is null`)).length).toBe(1);
    await expect(t.as(staff, `select public.bank_auto_match($1)`, [bank])).rejects.toThrow(/reconcile/);
  });

  it("VAT summary shows output and input VAT", async () => {
    const v = await t.as<{ output_vat: string; input_vat: string }>(acct, `select * from public.vat_summary`);
    expect(num(v[0].input_vat)).toBe(600);
  });

  it("starting the books wipes the test postings", async () => {
    expect(num((await one<{ n: string }>(`select count(*) n from public.journal_entries where is_test`)).n)).toBeGreaterThan(0);
    await expect(t.as(acct, `select public.start_books('2027-01-01')`)).rejects.toThrow(/finance head/);
    await expect(t.as(cfo, `select public.start_books('2027-01-15')`)).rejects.toThrow(/first day/);
    await t.as(cfo, `select public.start_books('2027-01-01')`);
    expect(num((await one<{ n: string }>(`select count(*) n from public.journal_entries`)).n)).toBe(0);
    await expect(t.as(cfo, `select public.start_books('2027-02-01')`)).rejects.toThrow(/already/);
    const ob = await t.as<{ id: string }>(cfo, `select public.import_opening_balances('2026-12-31', $1) id`, [JSON.stringify([{ account: "1030", debit: 250000 }, { account: "3010", credit: 250000 }])]);
    expect((await one<{ is_test: boolean; source: string }>(`select is_test, source from public.journal_entries where id = $1`, [ob[0].id]))).toMatchObject({ is_test: false, source: "opening" });
  });
});

describe("audit", () => {
  it("every accounting table is audited or exempt", async () => {
    const missing = await t.db.query<{ t: string }>(`
      select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('accounts','payment_method_accounts','fiscal_periods','journal_entries','journal_lines','unposted_events','supplier_payments','supplier_payment_lines','bank_statement_lines')
        and not exists (select 1 from public.audit_tables a where a.table_name = c.relname)
        and not exists (select 1 from public.audit_exempt e where e.table_name = c.relname)`);
    expect(missing.rows).toEqual([]);
  });
});
