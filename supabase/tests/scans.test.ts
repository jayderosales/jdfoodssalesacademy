/**
 * Photo encoding: scans are private to the uploader (plus whoever handles that kind of document), document transmittals
 * are received by someone other than the sender, and expense receipts liquidate petty cash or become a draft journal,
 * never twice for the same official receipt.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const u = (n: number) => `71000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ceo = u(1);
const acct = u(2);
const acct2 = u(3);
const ops = u(4);
const wh = u(5);
const staff = u(6);
const staff2 = u(7);

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];
const approve = async (record: string, by: string) => {
  const s = await one<{ id: string }>(`select s.id from public.approval_steps s join public.approval_requests r on r.id = s.request_id where r.record_id = $1 and s.status = 'pending'`, [record]);
  await t.as(by, `select public.act_on_approval($1, 'approve', 'ok')`, [s.id]);
};
const account = async (code: string) => (await one<{ id: string }>(`select id from public.accounts where code = $1`, [code])).id;

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(ceo, "ceo@y.ph", ["ceo"]);
  await t.createUser(acct, "acct@y.ph", ["accounting_officer"]);
  await t.createUser(acct2, "acct2@y.ph", ["accounting_officer"]);
  await t.createUser(ops, "ops@y.ph", ["operations_manager"]);
  await t.createUser(wh, "wh@y.ph", ["warehouse"]);
  await t.createUser(staff, "staff@y.ph", ["employee"]);
  await t.createUser(staff2, "staff2@y.ph", ["employee"]);
});

describe("approver check", () => {
  it("says whether anyone other than the requester can approve", async () => {
    expect((await t.as<{ ok: boolean }>(staff, `select public.approvers_available('petty_cash', 500) ok`))[0].ok).toBe(true); // ops manager
    // the CEO's own journal: only the CEO approves journals and nobody may approve their own
    expect((await t.as<{ ok: boolean }>(ceo, `select public.approvers_available('journal_entry', 500) ok`))[0].ok).toBe(false);
    expect((await t.as<{ ok: boolean }>(acct, `select public.approvers_available('journal_entry', 500) ok`))[0].ok).toBe(true);
  });
});

describe("document scans", () => {
  it("are visible to the uploader and to whoever handles that kind, not to other staff", async () => {
    const s = (await t.as<{ id: string; status: string }>(staff, `insert into public.document_scans (kind, status) values ('supplier_bill', 'done') returning id, status`))[0];
    expect(s.status).toBe("reading"); // status starts at reading whatever the client sends
    expect((await t.as(staff2, `select id from public.document_scans where id = $1`, [s.id])).length).toBe(0);
    expect((await t.as(acct, `select id from public.document_scans where id = $1`, [s.id])).length).toBe(1); // accounting handles bills
    expect((await t.as(wh, `select id from public.document_scans where id = $1`, [s.id])).length).toBe(0);
    await expect(t.as(staff, `update public.document_scans set kind = 'payment_slip' where id = $1`, [s.id])).rejects.toThrow(/can't change/);
    await t.as(staff, `update public.document_scans set status = 'discarded' where id = $1`, [s.id]);
    await expect(t.as(staff, `update public.document_scans set status = 'ready' where id = $1`, [s.id])).rejects.toThrow(/closed/);
  });
});

describe("document transmittals", () => {
  it("the sender lists documents; someone else in accounting ticks them off", async () => {
    const tr = (await t.as<{ id: string; number: string }>(staff, `insert into public.document_transmittals (number, from_name) values ('', 'Pasig branch') returning id, number`))[0];
    expect(tr.number).toMatch(/^TRN-/);
    const l1 = (await t.as<{ id: string }>(staff, `insert into public.document_transmittal_lines (transmittal_id, doc_type, doc_no, amount) values ($1, 'Sales invoice', '1001', 5000) returning id`, [tr.id]))[0].id;
    const l2 = (await t.as<{ id: string }>(staff, `insert into public.document_transmittal_lines (transmittal_id, doc_type, doc_no) values ($1, 'Delivery receipt', 'DR-77') returning id`, [tr.id]))[0].id;
    await expect(t.as(staff, `update public.document_transmittal_lines set received = true where id = $1`, [l1])).rejects.toThrow(/Mark received/);
    await expect(t.as(staff, `select public.receive_transmittal($1, $2)`, [tr.id, [l1]])).rejects.toThrow(/accounting/);
    expect((await t.as(staff2, `select id from public.document_transmittals where id = $1`, [tr.id])).length).toBe(0);
    expect((await t.as<{ s: string }>(acct, `select public.receive_transmittal($1, $2) s`, [tr.id, [l1]]))[0].s).toBe("partial");
    await t.as(staff, `delete from public.document_transmittal_lines where id = $1`, [l2]); // RLS: no longer the sender's to edit
    expect((await one<{ n: number }>(`select count(*)::int n from public.document_transmittal_lines where transmittal_id = $1`, [tr.id])).n).toBe(2);
    expect((await t.as<{ s: string }>(acct, `select public.receive_transmittal($1, $2) s`, [tr.id, [l2]]))[0].s).toBe("received");
    const line = await one<{ received_by: string }>(`select received_by from public.document_transmittal_lines where id = $1`, [l1]);
    expect(line.received_by).toBe(acct);
  });

  it("accounting can't receive a transmittal they sent", async () => {
    const tr = (await t.as<{ id: string }>(acct, `insert into public.document_transmittals (number, from_name) values ('', 'Accounting') returning id`))[0].id;
    const l = (await t.as<{ id: string }>(acct, `insert into public.document_transmittal_lines (transmittal_id, doc_type) values ($1, 'Cheque') returning id`, [tr]))[0].id;
    await expect(t.as(acct, `select public.receive_transmittal($1, $2)`, [tr, [l]])).rejects.toThrow(/other than the sender/);
    await t.as(acct2, `select public.receive_transmittal($1, $2)`, [tr, [l]]);
  });
});

describe("expense receipts", () => {
  it("liquidate released petty cash up to the amount, once per official receipt", async () => {
    const pc = (await t.as<{ id: string }>(staff, `insert into public.petty_cash_requests (number, entity_id, amount, purpose) values ('', (select id from public.entities limit 1), 1000, 'Fuel and parking') returning id`))[0].id;
    await t.as(staff, `select public.submit_petty_cash($1)`, [pc]);
    await approve(pc, ops);
    const fuel = await account("6100");
    const args = (receipt: string, amount: number) => [receipt, amount, fuel, pc];
    const sql = `select public.record_expense_receipt(current_date, 'Petron Ortigas', '000-111-222', $1, $2, 0, $3, 'Fuel', $4, null) id`;
    await expect(t.as(staff, sql, args("OR-1", 600))).rejects.toThrow(/released/);
    await t.as(acct, `select public.release_petty_cash($1, $2)`, [pc, fuel]);
    await t.as(staff, sql, args("OR-1", 600));
    await expect(t.as(staff, sql, args("or-1", 100))).rejects.toThrow(/already recorded/);
    await expect(t.as(staff, sql, args("OR-2", 500))).rejects.toThrow(/only ₱1000/);
    await expect(t.as(staff2, sql, args("OR-3", 100))).rejects.toThrow(/requester or accounting/);
    expect((await t.as(staff, `select id from public.expense_receipts where petty_cash_request_id = $1`, [pc])).length).toBe(1);
    await expect(t.as(staff, `insert into public.expense_receipts (receipt_date, vendor_name, amount, expense_account_id) values (current_date, 'X Store', 5, $1)`, [fuel])).rejects.toThrow();
  });

  it("paid from a company account becomes a balanced draft journal (expense + input VAT / cash) for the CEO", async () => {
    const meals = await account("6190");
    const cash = await account("1010");
    await expect(t.as(staff, `select public.record_expense_receipt(current_date, 'Jollibee', '', 'OR-9', 560, 60, $1, 'Team lunch', null, $2)`, [meals, cash])).rejects.toThrow(/Only accounting/);
    const id = (await t.as<{ id: string }>(acct, `select public.record_expense_receipt(current_date, 'Jollibee', '123', 'OR-9', 560, 60, $1, 'Team lunch', null, $2) id`, [meals, cash]))[0].id;
    const r = await one<{ journal_entry_id: string }>(`select journal_entry_id from public.expense_receipts where id = $1`, [id]);
    const je = await one<{ status: string; source: string; created_by: string }>(`select status, source, created_by from public.journal_entries where id = $1`, [r.journal_entry_id]);
    expect(je).toMatchObject({ status: "draft", source: "manual", created_by: acct });
    const lines = (await t.db.query<{ debit: string; credit: string; system_key: string | null }>(`select jl.debit, jl.credit, a.system_key from public.journal_lines jl join public.accounts a on a.id = jl.account_id where entry_id = $1 order by line_no`, [r.journal_entry_id])).rows;
    expect(lines.map((l) => [Number(l.debit), Number(l.credit)])).toEqual([[500, 0], [60, 0], [0, 560]]);
    expect(lines[1].system_key).toBe("input_vat");
    await t.as(acct, `select public.submit_journal($1)`, [r.journal_entry_id]);
    await approve(r.journal_entry_id, ceo);
    expect((await one<{ status: string }>(`select status from public.journal_entries where id = $1`, [r.journal_entry_id])).status).toBe("posted");
  });
});
