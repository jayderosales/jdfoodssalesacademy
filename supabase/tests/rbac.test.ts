/**
 * Phase 1a: RBAC + RLS. One user per built-in role; checks what each can see and do, MFA enforcement, scoped roles,
 * role-granting rules and the Academy role cache.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";
import { PERMISSIONS, SYSTEM_ROLES, type SystemRole } from "../../src/lib/rbac/permissions";

type Db = Awaited<ReturnType<typeof createTestDb>>;
let t: Db;

/** What each built-in role is expected to hold (grants_all roles hold everything). */
const PC = "petty_cash.request";
const IV = "inventory.view";
const EXPECTED: Record<SystemRole, string[] | "all"> = {
  super_admin: "all",
  ceo: "all",
  cfo: ["org.view", PC, "petty_cash.view_all", "approvals.view_all", IV, "inventory.view_cost", "inventory.cost.manage", "sales.view", "sales.view_all", "sales.payments.confirm", "sales.invoices.manage", "sales.pricing.manage", "procurement.view", "procurement.invoices.manage", "procurement.view_bank", "procurement.request", "accounting.view", "accounting.journals.create", "accounting.periods.manage", "accounting.coa.manage", "ap.payments.create", "ar.manage", "bank.reconcile", "finance.reports.view", "transmittals.receive"],
  coo: ["org.view", PC, IV, "inventory.view_cost", "inventory.products.manage", "inventory.reorder.manage", "inventory.cost.manage", "sales.view", "sales.view_all", "sales.fulfil", "procurement.view", "procurement.suppliers.manage", "procurement.po.create", "procurement.request", "production.report", "production.view"],
  cmo: ["org.view", PC, IV, "sales.view", "sales.view_all", "procurement.request"],
  operations_manager: ["org.view", PC, "petty_cash.view_all", IV, "inventory.view_cost", "inventory.products.manage", "inventory.receive", "inventory.transfer", "inventory.adjust.request", "inventory.count", "inventory.reorder.manage", "inventory.cost.manage", "sales.view", "sales.view_all", "sales.orders.create", "sales.fulfil", "procurement.view", "procurement.suppliers.manage", "procurement.po.create", "procurement.request", "production.report", "production.view"],
  sales_head: ["org.view", "academy.team.manage", "academy.reports.view", "academy.learn", PC, IV, "sales.view", "sales.view_all", "sales.customers.manage", "sales.crm", "sales.orders.create", "sales.orders.discount", "sales.pricing.manage", "sales.payments.record", "procurement.request"],
  hr_head: ["org.view", "employees.manage", "admin.users.view", "academy.reports.view", PC, "procurement.request"],
  accounting_officer: ["org.view", PC, "petty_cash.view_all", IV, "inventory.view_cost", "sales.view", "sales.view_all", "sales.payments.record", "sales.payments.confirm", "sales.invoices.manage", "procurement.view", "procurement.invoices.manage", "procurement.view_bank", "procurement.request", "accounting.view", "accounting.journals.create", "ap.payments.create", "ar.manage", "bank.reconcile", "finance.reports.view", "transmittals.receive"],
  sales_rep: ["org.view", "academy.learn", PC, IV, "sales.view", "sales.customers.manage", "sales.crm", "sales.orders.create", "sales.payments.record", "procurement.request"],
  warehouse: ["org.view", PC, IV, "inventory.receive", "inventory.transfer", "inventory.adjust.request", "inventory.count", "sales.fulfil", "procurement.view", "procurement.request"],
  manufacturing: ["org.view", PC, IV, "inventory.transfer", "procurement.view", "procurement.request", "production.report", "production.view"],
  qa: ["org.view", PC, IV, "inventory.qa.release", "procurement.view", "procurement.request", "production.view"],
  creative: ["org.view", PC, "procurement.request"],
  trainer: ["org.view", "academy.team.manage", "academy.reports.view", PC, "procurement.request"],
  employee: ["org.view", PC, "procurement.request"],
  driver: ["org.view", PC],
  auditor: ["readonly.all", "audit.view", "org.view", "admin.users.view", "academy.reports.view", PC, "approvals.view_all", IV, "procurement.view", "accounting.view", "finance.reports.view"],
  customer: ["portal.customer"],
  distributor: ["portal.distributor"],
  supplier: ["portal.supplier"],
};
const holds = (role: SystemRole, perm: string) => EXPECTED[role] === "all" || (EXPECTED[role] as string[]).includes(perm);

const uid = (i: number) => `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const userOf = Object.fromEntries(SYSTEM_ROLES.map((r, i) => [r, uid(i + 1)])) as Record<SystemRole, string>;
let entityId = "";

beforeAll(async () => {
  t = await createTestDb();
  for (const role of SYSTEM_ROLES) await t.createUser(userOf[role], `${role}@x.ph`, [role]);
  entityId = (await t.db.query<{ id: string }>(`select id from public.entities where code = 'JDF'`)).rows[0].id;
});

describe("catalog", () => {
  it("permissions in the database match src/lib/rbac/permissions.ts", async () => {
    const rows = (await t.db.query<{ code: string; module: string; is_restricted: boolean }>(`select code, module, is_restricted from public.permissions order by code`)).rows;
    const db = Object.fromEntries(rows.map((r) => [r.code, { module: r.module, restricted: r.is_restricted }]));
    expect(db).toEqual(PERMISSIONS);
  });
  it("seeds every built-in role with the expected permissions", async () => {
    const roles = (await t.db.query<{ code: string; grants_all: boolean; perms: string[] | null }>(`
      select r.code, r.grants_all, array_agg(rp.permission_code order by rp.permission_code) filter (where rp.permission_code is not null) perms
      from public.roles r left join public.role_permissions rp on rp.role_id = r.id
      where r.is_system group by r.code, r.grants_all`)).rows;
    expect(roles.map((r) => r.code).sort()).toEqual([...SYSTEM_ROLES].sort());
    for (const r of roles) {
      const exp = EXPECTED[r.code as SystemRole];
      if (exp === "all") expect(r.grants_all, r.code).toBe(true);
      else expect(r.perms ?? [], r.code).toEqual([...exp].sort());
    }
  });
});

describe("access matrix (one user per role, MFA verified)", () => {
  for (const role of SYSTEM_ROLES) {
    it(role, async () => {
      const u = userOf[role];
      // organization directory
      const locs = await t.as(u, `select id from public.locations`);
      expect(locs.length > 0, "read locations").toBe(holds(role, "org.view") || holds(role, "readonly.all"));

      // organization admin
      const addLocation = t.as(u, `insert into public.locations (entity_id, code, name) values ($1, $2, $2)`, [entityId, `T-${role}`]);
      if (holds(role, "admin.org.manage")) await expect(addLocation).resolves.toBeDefined();
      else await expect(addLocation).rejects.toThrow(/row-level security/);

      // employees
      const addEmployee = t.as(u, `insert into public.employees (entity_id, employee_no, full_name) values ($1, $2, $2)`, [entityId, `E-${role}`]);
      if (holds(role, "employees.manage")) await expect(addEmployee).resolves.toBeDefined();
      else await expect(addEmployee).rejects.toThrow(/row-level security/);

      // audit log
      const audit = await t.as(u, `select id from public.audit_log limit 1`);
      expect(audit.length > 0, "read audit").toBe(holds(role, "audit.view"));

      // other users' role grants
      const grants = await t.as(u, `select id from public.user_roles where user_id <> $1`, [u]);
      expect(grants.length > 0, "read others' roles").toBe(holds(role, "admin.users.view") || holds(role, "readonly.all"));

      // role management
      const addRole = t.as(u, `insert into public.roles (code, name) values ($1, $1)`, [`custom_${role}`]);
      if (holds(role, "admin.roles.manage")) await expect(addRole).resolves.toBeDefined();
      else await expect(addRole).rejects.toThrow(/row-level security/);

      // settings
      const upd = await t.as(u, `update public.app_settings set onboarding_target_days = onboarding_target_days returning id`);
      expect(upd.length > 0, "update settings").toBe(holds(role, "admin.settings.manage") || holds(role, "academy.admin"));

      // everyone active can read their own profile; Academy access level is derived from permissions
      const me = await t.as<{ role: string | null }>(u, `select role from public.profiles where id = $1`, [u]);
      const expectedAcademy = holds(role, "academy.admin") ? "owner" : holds(role, "academy.team.manage") ? "manager" : holds(role, "academy.learn") ? "rep" : null;
      expect(me[0]?.role).toBe(expectedAcademy);

      // Academy lessons are for internal staff only
      const lessons = await t.as(u, `select id from public.lessons limit 1`);
      const internal = !["customer", "distributor", "supplier"].includes(role);
      expect(lessons.length > 0, "read lessons").toBe(internal);
    });
  }
});

describe("MFA", () => {
  it("an internal user without MFA (aal1) reads nothing but their own profile", async () => {
    const u = userOf.ceo;
    expect(await t.as(u, `select id from public.locations`, [], "aal1")).toEqual([]);
    expect(await t.as(u, `select id from public.lessons`, [], "aal1")).toEqual([]);
    expect(await t.as(u, `select id from public.profiles`, [], "aal1")).toEqual([{ id: u }]);
    const access = await t.as<{ mfa_required: boolean; mfa_ok: boolean; permission: string | null }>(u, `select * from public.my_access()`, [], "aal1");
    expect(access).toEqual([{ permission: null, mfa_required: true, mfa_ok: false, is_internal: true }]);
  });
  it("external portal users don't need MFA", async () => {
    const rows = await t.as<{ ok: boolean }>(userOf.customer, `select public.has_permission('portal.customer') ok`, [], "aal1");
    expect(rows[0].ok).toBe(true);
  });
  it("can be switched off in settings (e.g. during rollout)", async () => {
    await t.db.query(`update public.app_settings set require_mfa_internal = false`);
    try {
      expect((await t.as(userOf.sales_rep, `select id from public.lessons limit 1`, [], "aal1")).length).toBe(1);
    } finally {
      await t.db.query(`update public.app_settings set require_mfa_internal = true`);
    }
  });
});

describe("scoped and time-limited roles", () => {
  it("a role scoped to one location only applies there", async () => {
    const [a, b] = (await t.db.query<{ id: string }>(
      `insert into public.locations (entity_id, code, name, type, holds_inventory) values ($1, 'WH-A', 'Warehouse A', 'warehouse', true), ($1, 'WH-B', 'Warehouse B', 'warehouse', true) returning id`,
      [entityId],
    )).rows;
    const u = uid(900);
    await t.createUser(u, "scoped@x.ph", []);
    await t.db.query(`insert into public.user_roles (user_id, role_id, location_id) select $1, id, $2 from public.roles where code = 'warehouse'`, [u, a.id]);
    const rows = await t.as<{ at_a: boolean; at_b: boolean; anywhere: boolean }>(
      u,
      `select public.has_permission_at('org.view', $1) at_a, public.has_permission_at('org.view', $2) at_b, public.has_permission('org.view') anywhere`,
      [a.id, b.id],
    );
    expect(rows[0]).toEqual({ at_a: true, at_b: false, anywhere: true });
  });
  it("an expired role grants nothing", async () => {
    const u = uid(901);
    await t.createUser(u, "expired@x.ph", []);
    await t.db.query(`insert into public.user_roles (user_id, role_id, valid_from, valid_to) select $1, id, '2020-01-01', '2020-12-31' from public.roles where code = 'sales_rep'`, [u]);
    expect(await t.as(u, `select id from public.locations`)).toEqual([]);
  });
});

describe("granting roles", () => {
  it("super administrators can grant roles to others but not to themselves", async () => {
    const target = uid(910);
    await t.createUser(target, "target@x.ph", []);
    await t.as(userOf.super_admin, `insert into public.user_roles (user_id, role_id, granted_by) select $1, id, $2 from public.roles where code = 'sales_rep'`, [target, userOf.super_admin]);
    expect((await t.db.query(`select role from public.profiles where id = $1`, [target])).rows[0]).toEqual({ role: "rep" });
    await expect(
      t.as(userOf.super_admin, `insert into public.user_roles (user_id, role_id, granted_by) select $1, id, $1 from public.roles where code = 'auditor'`, [userOf.super_admin]),
    ).rejects.toThrow(/row-level security/);
  });
  it("someone who can only view users cannot grant roles", async () => {
    await expect(
      t.as(userOf.hr_head, `insert into public.user_roles (user_id, role_id, granted_by) select $1, id, $2 from public.roles where code = 'employee'`, [userOf.driver, userOf.hr_head]),
    ).rejects.toThrow(/row-level security/);
  });
  it("a user manager can only grant roles whose permissions they hold themselves", async () => {
    const mgr = uid(920);
    const target = uid(921);
    await t.createUser(mgr, "usermgr@x.ph", []);
    await t.createUser(target, "target2@x.ph", []);
    const roleId = (await t.as<{ id: string }>(userOf.super_admin, `insert into public.roles (code, name) values ('user_manager', 'User manager') returning id`))[0].id;
    await t.as(userOf.super_admin, `insert into public.role_permissions (role_id, permission_code) values ($1, 'admin.users.manage'), ($1, 'org.view'), ($1, 'petty_cash.request'), ($1, 'procurement.request')`, [roleId]);
    await t.as(userOf.super_admin, `insert into public.user_roles (user_id, role_id, granted_by) values ($1, $2, $3)`, [mgr, roleId, userOf.super_admin]);

    await t.as(mgr, `insert into public.user_roles (user_id, role_id, granted_by) select $1, id, $2 from public.roles where code = 'employee'`, [target, mgr]);
    await expect(
      t.as(mgr, `insert into public.user_roles (user_id, role_id, granted_by) select $1, id, $2 from public.roles where code = 'auditor'`, [target, mgr]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      t.as(mgr, `insert into public.user_roles (user_id, role_id, granted_by) select $1, id, $2 from public.roles where code = 'super_admin'`, [target, mgr]),
    ).rejects.toThrow(/row-level security/);
  });
  it("the Academy level follows role changes", async () => {
    const u = uid(930);
    await t.createUser(u, "promote@x.ph", ["sales_rep"]);
    const level = async () => (await t.db.query<{ role: string | null }>(`select role from public.profiles where id = $1`, [u])).rows[0].role;
    expect(await level()).toBe("rep");
    await t.as(userOf.super_admin, `insert into public.user_roles (user_id, role_id, granted_by) select $1, id, $2 from public.roles where code = 'sales_head'`, [u, userOf.super_admin]);
    expect(await level()).toBe("manager");
    await t.as(userOf.super_admin, `delete from public.user_roles where user_id = $1 and role_id = (select id from public.roles where code = 'sales_head')`, [u]);
    expect(await level()).toBe("rep");
  });
  it("built-in roles can't be deleted", async () => {
    await expect(t.as(userOf.super_admin, `delete from public.roles where code = 'employee'`)).rejects.toThrow(/Built-in roles/);
  });
});

describe("auditor", () => {
  it("reads everyone's profile and the audit log but changes nothing", async () => {
    const u = userOf.auditor;
    expect((await t.as(u, `select id from public.profiles`)).length).toBeGreaterThan(5);
    expect(await t.as(u, `update public.profiles set full_name = 'x' where id = $1 returning id`, [userOf.sales_rep])).toEqual([]);
    expect(await t.as(u, `update public.locations set name = name returning id`)).toEqual([]);
    expect(await t.as(u, `delete from public.audit_log returning id`)).toEqual([]);
  });
});

describe("organization rules", () => {
  it("blocks reporting-line loops", async () => {
    const [a] = (await t.db.query<{ id: string }>(`insert into public.employees (entity_id, employee_no, full_name) values ($1, 'L1', 'A') returning id`, [entityId])).rows;
    const [b] = (await t.db.query<{ id: string }>(`insert into public.employees (entity_id, employee_no, full_name, supervisor_id) values ($1, 'L2', 'B', $2) returning id`, [entityId, a.id])).rows;
    await expect(t.db.query(`update public.employees set supervisor_id = $1 where id = $2`, [b.id, a.id])).rejects.toThrow(/loop/);
  });
  it("an office can't hold inventory", async () => {
    await expect(
      t.db.query(`insert into public.locations (entity_id, code, name, type, holds_inventory) values ($1, 'OFF2', 'Office 2', 'office', true)`, [entityId]),
    ).rejects.toThrow(/office_holds_no_inventory/);
  });
  it("employees can see their own record even without the directory permission", async () => {
    const u = userOf.customer; // external users have no employee, so use a fresh internal user without org.view
    expect(await t.as(u, `select id from public.employees`)).toEqual([]);
    const emp = (await t.db.query<{ id: string }>(`insert into public.employees (entity_id, employee_no, full_name) values ($1, 'SELF', 'Self') returning id`, [entityId])).rows[0].id;
    const v = uid(940);
    await t.createUser(v, "noperm@x.ph", []);
    await t.db.query(`update public.profiles set employee_id = $1 where id = $2`, [emp, v]);
    expect(await t.as(v, `select id from public.employees`)).toEqual([{ id: emp }]);
  });
});
