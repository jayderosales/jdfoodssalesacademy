/**
 * Phase 1a: audit trail, external self-registration and sign-in logs.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;
const admin = "20000000-0000-0000-0000-000000000001";
const auditor = "20000000-0000-0000-0000-000000000002";
const rep = "20000000-0000-0000-0000-000000000003";
const hr = "20000000-0000-0000-0000-000000000004";

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(admin, "admin@x.ph", ["super_admin"]);
  await t.createUser(auditor, "auditor@x.ph", ["auditor"]);
  await t.createUser(rep, "rep@x.ph", ["sales_rep"]);
  await t.createUser(hr, "hr@x.ph", ["hr_head"]);
});

describe("audit coverage", () => {
  it("every public table is either audited or listed as exempt with a reason", async () => {
    const rows = (await t.db.query<{ tablename: string }>(`
      select tablename from pg_tables where schemaname = 'public'
        and tablename not in (select table_name from public.audit_tables)
        and tablename not in (select table_name from public.audit_exempt)`)).rows;
    expect(rows).toEqual([]);
  });
  it("every audited table really has the audit trigger", async () => {
    const rows = (await t.db.query<{ table_name: string }>(`
      select a.table_name from public.audit_tables a
      where not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                        where c.relname = a.table_name and tg.tgname = 'audit_' || a.table_name)`)).rows;
    expect(rows).toEqual([]);
  });
});

describe("audit trail", () => {
  it("records who changed which fields", async () => {
    const id = (await t.as<{ id: string }>(admin, `insert into public.departments (entity_id, code, name) select id, 'AUD', 'Audit test' from public.entities returning id`))[0].id;
    await t.as(admin, `update public.departments set name = 'Audit test 2' where id = $1`, [id]);
    const rows = await t.as<{ action: string; actor_id: string; diff: Record<string, unknown> | null }>(
      admin,
      `select action, actor_id, diff from public.audit_log where entity = 'departments' and entity_id = $1 order by id`,
      [id],
    );
    expect(rows.map((r) => r.action)).toEqual(["insert", "update"]);
    expect(rows[1].actor_id).toBe(admin);
    expect(rows[1].diff).toEqual({ name: ["Audit test", "Audit test 2"] });
  });
  it("skips updates that only touch ignored columns", async () => {
    const before = Number((await t.db.query<{ n: number }>(`select count(*) n from public.audit_log where entity = 'profiles'`)).rows[0].n);
    await t.as(rep, `update public.profiles set last_active_at = now() where id = $1`, [rep]);
    const after = Number((await t.db.query<{ n: number }>(`select count(*) n from public.audit_log where entity = 'profiles'`)).rows[0].n);
    expect(after).toBe(before);
  });
  it("can't be changed or deleted, even by the service role", async () => {
    await expect(t.db.query(`update public.audit_log set action = 'x'`)).rejects.toThrow(/can't be changed/);
    await expect(t.db.query(`delete from public.audit_log`)).rejects.toThrow(/can't be changed/);
  });
  it("hides restricted entries from auditors without the restricted permission", async () => {
    await t.db.query(`insert into public.audit_log (action, entity, entity_id, is_restricted) values ('update', 'salaries', 'x', true)`);
    expect(await t.as(auditor, `select id from public.audit_log where is_restricted`)).toEqual([]);
    expect((await t.as(admin, `select id from public.audit_log where is_restricted`)).length).toBe(1);
  });
  it("logs reads of restricted data", async () => {
    await t.as(admin, `select public.log_restricted_access('employees', 'abc', 'payroll review')`);
    expect(await t.as(admin, `select table_name, record_id, purpose from public.restricted_access_log`)).toEqual([
      { table_name: "employees", record_id: "abc", purpose: "payroll review" },
    ]);
    expect(await t.as(auditor, `select id from public.restricted_access_log`)).toEqual([]);
  });
});

describe("external self-registration", () => {
  const cust = "20000000-0000-0000-0000-0000000000c1";
  it("creates a pending customer with no access", async () => {
    await t.db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'resto@x.ph', $2)`, [
      cust,
      JSON.stringify({ account_type: "customer", full_name: "Ana Cruz", company_name: "Ana's Eatery", phone: "0917", roles: ["super_admin"] }),
    ]);
    const p = (await t.db.query(`select status, account_type, company_name, role, approved_at from public.profiles where id = $1`, [cust])).rows[0];
    expect(p).toEqual({ status: "inactive", account_type: "customer", company_name: "Ana's Eatery", role: null, approved_at: null });
    expect(await t.db.query(`select * from public.user_roles where user_id = $1`, [cust]).then((r) => r.rows)).toEqual([]);
    expect(await t.as(cust, `select id from public.profiles`, [], "aal1")).toEqual([]);
  });
  it("only user admins can approve; approval grants the portal role", async () => {
    await expect(t.as(hr, `select public.approve_registration($1)`, [cust])).rejects.toThrow(/permission/);
    await t.as(admin, `select public.approve_registration($1)`, [cust]);
    const rows = await t.as<{ ok: boolean; staff: boolean }>(
      cust,
      `select public.has_permission('portal.customer') ok, public.is_active_user() staff`,
      [],
      "aal1",
    );
    expect(rows[0]).toEqual({ ok: true, staff: false });
    await expect(t.as(admin, `select public.approve_registration($1)`, [cust])).rejects.toThrow(/already active/);
  });
  it("users can't change their own account type", async () => {
    // portal users can't edit their profile row at all yet (portal profile editing comes in Phase 7)
    expect(await t.as(cust, `update public.profiles set account_type = 'distributor' where id = $1 returning id`, [cust], "aal1")).toEqual([]);
    // and staff who can edit their own row still can't change their account type
    await expect(t.as(rep, `update public.profiles set account_type = 'distributor' where id = $1`, [rep])).rejects.toThrow(/administrator/);
  });
});

describe("sign-in history", () => {
  it("users see their own sign-ins; security admins and auditors see all", async () => {
    await t.db.query(`insert into public.login_events (user_id, email, method, success) values ($1, 'rep@x.ph', 'password', true), ($2, 'hr@x.ph', 'password', false)`, [rep, hr]);
    expect((await t.as(rep, `select user_id from public.login_events`)).map((r) => r.user_id)).toEqual([rep]);
    expect((await t.as(auditor, `select id from public.login_events`)).length).toBe(2);
    await expect(t.as(rep, `insert into public.login_events (user_id, method, success) values ($1, 'password', true)`, [rep])).rejects.toThrow(/row-level security/);
  });
});
