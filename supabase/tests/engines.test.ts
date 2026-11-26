/**
 * Phase 1b: numbering, outbox, notifications, working-hours calendar, escalation, approval engine, petty cash,
 * attachments, importers.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const u = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ceo = u(1);
const ops = u(2);
const rep = u(3);
const sup = u(4);
const other = u(5);
const ops2 = u(6);
let entityId = "";

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await t.db.query<T>(sql, params)).rows[0];

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(ceo, "ceo@x.ph", ["ceo"]);
  await t.createUser(ops, "ops@x.ph", ["operations_manager"]);
  await t.createUser(rep, "rep@x.ph", ["sales_rep"]);
  await t.createUser(sup, "sup@x.ph", ["sales_head"]);
  await t.createUser(other, "other@x.ph", ["warehouse"]);
  entityId = (await one<{ id: string }>(`select id from public.entities where code = 'JDF'`)).id;
  // rep reports to sup (via employee records)
  const supEmp = (await one<{ id: string }>(`insert into public.employees (entity_id, employee_no, full_name) values ($1, 'S1', 'Sup') returning id`, [entityId])).id;
  const repEmp = (await one<{ id: string }>(`insert into public.employees (entity_id, employee_no, full_name, supervisor_id) values ($1, 'R1', 'Rep', $2) returning id`, [entityId, supEmp])).id;
  const opsEmp = (await one<{ id: string }>(`insert into public.employees (entity_id, employee_no, full_name, supervisor_id) values ($1, 'O1', 'Ops', $2) returning id`, [entityId, supEmp])).id;
  await t.db.query(`update public.profiles set employee_id = $1 where id = $2`, [supEmp, sup]);
  await t.db.query(`update public.profiles set employee_id = $1 where id = $2`, [repEmp, rep]);
  await t.db.query(`update public.profiles set employee_id = $1 where id = $2`, [opsEmp, ops]);
});

async function newRequest(by: string, amount: number, purpose = "Delivery fuel") {
  const rows = await t.as<{ id: string; number: string; status: string }>(
    by,
    `insert into public.petty_cash_requests (amount, purpose) values ($1, $2) returning id, number, status`,
    [amount, purpose],
  );
  return rows[0];
}
const pendingStep = async (requestId: string) =>
  one<{ id: string; approver_ids: string[]; step_no: number }>(
    `select id, approver_ids, step_no from public.approval_steps where request_id = $1 and status = 'pending'`,
    [requestId],
  );

describe("document numbering", () => {
  it("numbers petty cash requests per year with no gaps, even after a rollback", async () => {
    const a = await newRequest(rep, 100);
    expect(a.number).toMatch(/^PCR-\d{4}-00001$/);
    await expect(t.as(rep, `insert into public.petty_cash_requests (amount, purpose) values (-5, 'bad')`)).rejects.toThrow();
    const b = await newRequest(rep, 200);
    expect(b.number).toMatch(/-00002$/);
    expect(a.status).toBe("draft");
  });
  it("can't be called directly through the API", async () => {
    await expect(t.as(rep, `select public.next_document_number('petty_cash_request')`)).rejects.toThrow(/permission denied/);
  });
});

describe("working hours", () => {
  const at = async (start: string, hours: number) =>
    (await one<{ v: string }>(`select to_char(public.add_working_hours($1::timestamptz, $2) at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') v`, [start, hours])).v;
  it("counts only Mon–Sat 8:00–17:00 Manila", async () => {
    // Fri 2027-01-08 16:00 + 2h → Sat 09:00
    expect(await at("2027-01-08 16:00+08", 2)).toBe("2027-01-09 09:00");
    // Sat 16:00 + 2h → (Sunday skipped) Mon 09:00
    expect(await at("2027-01-09 16:00+08", 2)).toBe("2027-01-11 09:00");
    // before opening: Mon 06:00 + 1h → Mon 09:00
    expect(await at("2027-01-11 06:00+08", 1)).toBe("2027-01-11 09:00");
    // 24 working hours from Mon 08:00 = 9h Mon + 9h Tue + 6h Wed → Wed 14:00
    expect(await at("2027-01-11 08:00+08", 24)).toBe("2027-01-13 14:00");
  });
  it("skips holidays", async () => {
    // Thu 2027-03-24 16:00 + 2h: Thu–Sat (25–27) are holidays, Sunday off → Mon 29 09:00
    expect(await at("2027-03-24 16:00+08", 2)).toBe("2027-03-29 09:00");
  });
});

describe("approval engine", () => {
  it("routes up to ₱50,000 to the operations manager and above to the CEO", async () => {
    const small = await newRequest(rep, 50000);
    await t.as(rep, `select public.submit_petty_cash($1)`, [small.id]);
    const r1 = await one<{ id: string; status: string }>(`select id, status from public.approval_requests where record_id = $1`, [small.id]);
    expect((await pendingStep(r1.id)).approver_ids).toEqual([ops]);
    expect((await one(`select status from public.petty_cash_requests where id = $1`, [small.id])).status).toBe("submitted");

    const big = await newRequest(rep, 50000.01);
    await t.as(rep, `select public.submit_petty_cash($1)`, [big.id]);
    const r2 = await one<{ id: string }>(`select id from public.approval_requests where record_id = $1`, [big.id]);
    expect((await pendingStep(r2.id)).approver_ids).toEqual([ceo]);
  });

  it("notifies the approver, lets them approve from the inbox, and tells the requester", async () => {
    const req = await newRequest(rep, 1500, "Tricycle fare for samples");
    await t.as(rep, `select public.submit_petty_cash($1)`, [req.id]);
    const ar = await one<{ id: string; number: string }>(`select id, number from public.approval_requests where record_id = $1`, [req.id]);
    expect(ar.number).toMatch(/^APR-/);
    const n1 = await t.as<{ payload: { title: string }; href: string }>(ops, `select payload, href from public.notifications where type = 'approval.assigned' and payload->>'title' like '%Tricycle%'`);
    expect(n1).toHaveLength(1);
    expect(n1[0].href).toBe(`/approvals/${ar.id}`);

    const inbox = await t.as(ops, `select s.id from public.approval_steps s where s.status = 'pending' and s.approver_ids && public.my_approver_ids()`);
    expect(inbox.length).toBeGreaterThan(0);

    const step = await pendingStep(ar.id);
    expect((await t.as<{ r: string }>(ops, `select public.act_on_approval($1, 'approve', 'ok') r`, [step.id]))[0].r).toBe("approved");
    expect((await one(`select status from public.petty_cash_requests where id = $1`, [req.id])).status).toBe("approved");
    const n2 = await t.as<{ payload: { title: string } }>(rep, `select payload from public.notifications where type = 'approval.decided' order by created_at desc limit 1`);
    expect(n2[0].payload.title).toContain("approved");

    const trail = await t.as<{ entity: string; action: string }>(ceo, `select entity, action from public.audit_log where entity in ('approval_requests','approval_steps','petty_cash_requests') and (entity_id = $1 or entity_id = $2 or entity_id = $3)`, [req.id, ar.id, step.id]);
    expect(trail.map((x) => `${x.entity}:${x.action}`)).toEqual(expect.arrayContaining(["petty_cash_requests:insert", "approval_requests:insert", "approval_steps:update", "petty_cash_requests:update"]));
  });

  it("never lets someone approve their own request (they're skipped and it goes up)", async () => {
    const req = await newRequest(ops, 900);
    await t.as(ops, `select public.submit_petty_cash($1)`, [req.id]);
    const ar = await one<{ id: string }>(`select id from public.approval_requests where record_id = $1`, [req.id]);
    const step = await pendingStep(ar.id);
    expect(step.approver_ids).not.toContain(ops);
    expect(step.approver_ids).toEqual([ceo]);
    await expect(t.as(ops, `select public.act_on_approval($1, 'approve', '')`, [step.id])).rejects.toThrow(/own request/);
  });

  it("rejects people who aren't approvers and requires a reason to reject or return", async () => {
    const req = await newRequest(rep, 300);
    await t.as(rep, `select public.submit_petty_cash($1)`, [req.id]);
    const ar = await one<{ id: string }>(`select id from public.approval_requests where record_id = $1`, [req.id]);
    const step = await pendingStep(ar.id);
    await expect(t.as(other, `select public.act_on_approval($1, 'approve', '')`, [step.id])).rejects.toThrow(/not an approver/);
    await expect(t.as(ops, `select public.act_on_approval($1, 'reject', '')`, [step.id])).rejects.toThrow(/comment/);
    await t.as(ops, `select public.act_on_approval($1, 'return', 'Attach the receipt please')`, [step.id]);
    expect((await one(`select status from public.petty_cash_requests where id = $1`, [req.id])).status).toBe("returned");
    // the requester can edit and resubmit
    await t.as(rep, `update public.petty_cash_requests set amount = 350 where id = $1`, [req.id]);
    await t.as(rep, `select public.submit_petty_cash($1)`, [req.id]);
    expect(Number((await one(`select count(*) n from public.approval_requests where record_id = $1`, [req.id])).n)).toBe(2);
  });

  it("guards the document: no editing after submit, no self-approving by changing status", async () => {
    const req = await newRequest(rep, 400);
    await expect(t.as(rep, `update public.petty_cash_requests set status = 'approved' where id = $1`, [req.id])).rejects.toThrow(/approval process/);
    await t.as(rep, `select public.submit_petty_cash($1)`, [req.id]);
    expect(await t.as(rep, `update public.petty_cash_requests set amount = 1 where id = $1 returning id`, [req.id])).toEqual([]);
    await expect(t.as(rep, `insert into public.approval_steps (request_id, step_no, approver_ids) select id, 9, array[$1]::uuid[] from public.approval_requests limit 1`, [rep])).rejects.toThrow(/row-level security/);
  });

  it("lets an approver delegate while away; the delegate's action records both people", async () => {
    await t.createUser(ops2, "ops2@x.ph", ["employee"]);
    await t.as(ops, `insert into public.approval_delegations (from_user, to_user, starts_on, ends_on, reason) values ($1, $2, public.manila_today(), public.manila_today() + 7, 'On leave')`, [ops, ops2]);
    const req = await newRequest(rep, 700);
    await t.as(rep, `select public.submit_petty_cash($1)`, [req.id]);
    const ar = await one<{ id: string }>(`select id from public.approval_requests where record_id = $1`, [req.id]);
    expect((await t.as(ops2, `select id from public.notifications where type = 'approval.assigned'`)).length).toBeGreaterThan(0);
    const step = await pendingStep(ar.id);
    await t.as(ops2, `select public.act_on_approval($1, 'approve', 'covering')`, [step.id]);
    const s = await one<{ acted_by: string; acted_on_behalf_of: string }>(`select acted_by, acted_on_behalf_of from public.approval_steps where id = $1`, [step.id]);
    expect(s).toEqual({ acted_by: ops2, acted_on_behalf_of: ops });
  });

  it("lets the requester cancel a pending request (back to draft)", async () => {
    const req = await newRequest(rep, 250);
    await t.as(rep, `select public.submit_petty_cash($1)`, [req.id]);
    const ar = await one<{ id: string }>(`select id from public.approval_requests where record_id = $1`, [req.id]);
    await expect(t.as(ops, `select public.cancel_approval($1)`, [ar.id])).rejects.toThrow(/submitted it/);
    await t.as(rep, `select public.cancel_approval($1)`, [ar.id]);
    expect((await one(`select status from public.petty_cash_requests where id = $1`, [req.id])).status).toBe("draft");
  });

  it("only shows requests to the requester, approvers and people allowed to see all", async () => {
    const req = await newRequest(rep, 123);
    expect(await t.as(other, `select id from public.petty_cash_requests where id = $1`, [req.id])).toEqual([]);
    expect((await t.as(ops, `select id from public.petty_cash_requests where id = $1`, [req.id])).length).toBe(1); // view_all
  });
});

describe("escalation", () => {
  it("escalates an overdue approval to the approver's supervisor after 24 working hours, then to the CEO feed after 48, once each", async () => {
    const req = await newRequest(rep, 600, "Escalation test");
    await t.as(rep, `select public.submit_petty_cash($1)`, [req.id]);
    const ar = await one<{ id: string }>(`select id from public.approval_requests where record_id = $1`, [req.id]);
    const step = await pendingStep(ar.id);
    // pretend it was assigned on Mon 2027-01-11 08:00 Manila
    await t.db.query(`update public.approval_steps set assigned_at = '2027-01-11 08:00+08' where id = $1`, [step.id]);
    const run = async (now: string) => {
      await t.db.query(`select public.escalate_overdue($1::timestamptz)`, [now]);
      return Number((await one<{ n: number }>(`select count(*) n from public.escalations where item_id = $1`, [step.id])).n);
    };

    const mine = async (who: string, type: string) =>
      (await t.as(who, `select id from public.notifications where type = $1 and payload->>'title' like '%Escalation test%'`, [type])).length;
    expect(await run("2027-01-13 13:00+08")).toBe(0); // 23 working hours
    expect(await run("2027-01-13 14:30+08")).toBe(1); // past 24 → supervisor
    expect(await mine(sup, "escalation.supervisor")).toBe(1);
    expect(await run("2027-01-13 15:00+08")).toBe(1); // again: nothing new for this item
    expect(await mine(sup, "escalation.supervisor")).toBe(1);

    expect(await run("2027-01-18 08:00+08")).toBe(2); // well past 48 working hours → executives
    expect(await mine(ceo, "escalation.executive")).toBe(1);
    expect((await t.as(ceo, `select id from public.risk_alerts where item_id = $1 and resolved_at is null`, [step.id])).length).toBe(1);
    expect(await t.as(rep, `select id from public.risk_alerts`)).toEqual([]);

    // deciding clears the risk alert
    await t.as(ops, `select public.act_on_approval($1, 'approve', 'sorry for the delay')`, [step.id]);
    expect((await t.as(ceo, `select id from public.risk_alerts where item_id = $1 and resolved_at is null`, [step.id])).length).toBe(0);
  });
});

describe("notifications", () => {
  it("users can switch off optional notifications but not mandatory ones, and mark them read", async () => {
    await t.db.query(`insert into public.notification_rules (event_type, label, title_template) values ('test.optional', 'Optional', 'Hello {{name}}')`);
    await t.as(rep, `insert into public.notification_preferences (user_id, event_type, in_app, email) values ($1, 'test.optional', false, false)`, [rep]);
    await t.db.query(`select public.emit_event('test.optional', 'x', '1', $1)`, [JSON.stringify({ recipients: [rep, other], name: "Ana" })]);
    expect(await t.as(rep, `select id from public.notifications where type = 'test.optional'`)).toEqual([]);
    const o = await t.as<{ payload: { title: string } }>(other, `select payload from public.notifications where type = 'test.optional'`);
    expect(o[0].payload.title).toBe("Hello Ana");
    expect((await t.as<{ n: number }>(other, `select public.mark_notifications_read() n`))[0].n).toBeGreaterThan(0);
    expect(await t.as(other, `select id from public.notifications where read_at is null`)).toEqual([]);
  });
  it("queues email only when email is switched on", async () => {
    const statuses = await t.db.query<{ email_status: string }>(`select distinct email_status from public.notifications where type like 'approval.%'`);
    expect(statuses.rows.map((r) => r.email_status)).toEqual(["skipped"]);
  });
  it("retries a failing handler later instead of blocking the business change", async () => {
    await t.db.query(`create or replace function public.handle_domain_event(e public.domain_events) returns void language plpgsql as $$ begin raise exception 'boom'; end $$`);
    const id = (await one<{ id: number }>(`select public.emit_event('test.fail', 'x', '1', '{}') id`)).id;
    const e = await one<{ status: string; attempts: number; last_error: string }>(`select status, attempts, last_error from public.domain_events where id = $1`, [id]);
    expect(e).toMatchObject({ status: "pending", attempts: 1, last_error: "boom" });
  });
});

describe("attachments", () => {
  it("follow access to the record", async () => {
    const req = await newRequest(rep, 222);
    const path = `petty_cash_requests/${req.id}/abc-receipt.jpg`;
    await t.as(rep, `insert into public.attachments (record_table, record_id, storage_path, filename, mime_type, size_bytes) values ('petty_cash_requests', $1, $2, 'receipt.jpg', 'image/jpeg', 1000)`, [req.id, path]);
    expect((await t.as(rep, `select id from public.attachments where record_id = $1`, [req.id])).length).toBe(1);
    expect(await t.as(other, `select id from public.attachments where record_id = $1`, [req.id])).toEqual([]);
    await expect(
      t.as(other, `insert into public.attachments (record_table, record_id, storage_path, filename, size_bytes) values ('petty_cash_requests', $1, $2, 'x.jpg', 10)`, [req.id, `petty_cash_requests/${req.id}/x.jpg`]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("importers", () => {
  it("import employees all-or-nothing, linking supervisors by employee number", async () => {
    const hr = u(20);
    await t.createUser(hr, "hr@x.ph", ["hr_head"]);
    const rows = [
      { employee_no: "E100", full_name: "Boss", department: "Sales" },
      { employee_no: "E101", full_name: "Staff", department: "SALES", supervisor_no: "E100", hire_date: "2026-01-15" },
    ];
    const res = await t.as<{ r: { created: number; updated: number } }>(hr, `select public.import_employees($1) r`, [JSON.stringify(rows)]);
    expect(res[0].r).toEqual({ created: 2, updated: 0 });
    const staff = await one<{ sup: string }>(`select s.full_name sup from public.employees e join public.employees s on s.id = e.supervisor_id where e.employee_no = 'E101'`);
    expect(staff.sup).toBe("Boss");
    // a bad row fails the whole file
    await expect(
      t.as(hr, `select public.import_employees($1)`, [JSON.stringify([{ employee_no: "E102", full_name: "Ok" }, { employee_no: "E103", full_name: "Bad", hire_date: "not-a-date" }])]),
    ).rejects.toThrow();
    expect(await t.db.query(`select id from public.employees where employee_no = 'E102'`).then((r) => r.rows)).toEqual([]);
    // people without employees.manage can't import
    await expect(t.as(rep, `select public.import_employees($1)`, [JSON.stringify([{ employee_no: "E104", full_name: "X" }])])).rejects.toThrow(/row-level security/);
  });
});
