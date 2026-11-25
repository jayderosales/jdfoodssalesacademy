/**
 * Academy access rules (from the Sales Academy phases), now resolved through RBAC.
 * Runs the real migrations + seed in PGlite (see harness.ts). `npm test` runs this.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

const ids = {
  owner: "00000000-0000-0000-0000-000000000001",
  manager: "00000000-0000-0000-0000-000000000002",
  rep1: "00000000-0000-0000-0000-000000000003",
  rep2: "00000000-0000-0000-0000-000000000004",
};
let teamA = "";
let teamB = "";

let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let as: Awaited<ReturnType<typeof createTestDb>>["as"];

beforeAll(async () => {
  // seeds must be re-runnable, so they run twice
  ({ db, as } = await createTestDb({ seedTwice: true }));

  // users arrive through auth.users → profile trigger
  const users: [string, string, string][] = [
    [ids.owner, "owner@x.ph", "owner"],
    [ids.manager, "mgr@x.ph", "manager"],
    [ids.rep1, "rep1@x.ph", "rep"],
    [ids.rep2, "rep2@x.ph", "rep"],
  ];
  for (const [id, email, role] of users) {
    await db.query(`insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ role, full_name: email })]);
  }
  teamA = (await db.query<{ id: string }>(`select id from public.teams where name = 'Sales Team A'`)).rows[0].id;
  teamB = (await db.query<{ id: string }>(`insert into public.teams (name) values ('Sales Team B') returning id`)).rows[0].id;
  await db.query(`update public.profiles set team_id = $1 where id in ($2, $3)`, [teamA, ids.rep1, ids.manager]);
  await db.query(`update public.profiles set team_id = $1 where id = $2`, [teamB, ids.rep2]);
  await db.query(`insert into public.team_managers (team_id, manager_id) values ($1, $2)`, [teamA, ids.manager]);
});

describe("schema & seed", () => {
  it("creates profiles from auth users with role from app_metadata", async () => {
    const rows = (await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [ids.owner])).rows;
    expect(rows[0].role).toBe("owner");
  });
  it("seeds levels 0–5 and the 7-criterion rubric", async () => {
    expect((await db.query(`select * from public.levels`)).rows).toHaveLength(6);
    const r = (await db.query<{ n: number }>(`select jsonb_array_length(criteria) n from public.rubrics`)).rows[0];
    expect(r.n).toBe(7);
  });
  it("seeds the onboarding path, products and quizzes once (re-runnable)", async () => {
    const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);
    expect(await count(`select count(*) n from public.modules`)).toBe(6);
    expect(await count(`select count(*) n from public.lessons where published`)).toBe(37);
    expect(await count(`select count(*) n from public.products where not verified`)).toBe(16);
    expect(await count(`select count(*) n from public.quizzes`)).toBe(7);
    expect(await count(`select count(*) n from public.questions where status = 'approved'`)).toBe(50);
    // every objective question has a well-formed answer key
    const bad = await db.query(`
      select id from public.questions
      where (type = 'mcq' and jsonb_array_length(correct) <> 1)
         or (type = 'multi' and jsonb_array_length(correct) < 1)
         or (type = 'tf' and jsonb_typeof(correct) <> 'boolean')
         or (type in ('short', 'scenario') and model_answer is null)`);
    expect(bad.rows).toEqual([]);
  });
  it("seeds 8 roleplay scenarios linked to the rubric and existing products", async () => {
    const rows = (await db.query<{ n: number; rubric: number; bad_products: number }>(`
      select count(*) n,
             count(*) filter (where rubric_id is not null) rubric,
             (select count(*) from public.scenarios s, unnest(s.product_ids) pid where not exists (select 1 from public.products p where p.id = pid)) bad_products
      from public.scenarios`)).rows[0];
    expect(Number(rows.n)).toBe(8);
    expect(Number(rows.rubric)).toBe(8);
    expect(Number(rows.bad_products)).toBe(0);
    const personas = (await db.query<{ ok: boolean }>(`select bool_and(jsonb_array_length(persona->'objections') > 0 and persona ? 'hidden_needs') ok from public.scenarios`)).rows[0];
    expect(personas.ok).toBe(true);
  });
  it("enables RLS on every public table", async () => {
    const rows = (await db.query(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`)).rows;
    expect(rows).toEqual([]);
  });
});

describe("rep", () => {
  it("sees own profile and their manager only", async () => {
    const rows = await as<{ id: string }>(ids.rep1, `select id from public.profiles order by id`);
    expect(rows.map((r) => r.id)).toEqual([ids.manager, ids.rep1]);
  });
  it("can edit own name and consent", async () => {
    await as(ids.rep1, `update public.profiles set full_name = 'Juan', consent_version = 'v1', consent_at = now() where id = $1`, [ids.rep1]);
    expect((await db.query<{ full_name: string }>(`select full_name from public.profiles where id = $1`, [ids.rep1])).rows[0].full_name).toBe("Juan");
  });
  it("cannot promote themself", async () => {
    await expect(as(ids.rep1, `update public.profiles set role = 'owner' where id = $1`, [ids.rep1])).rejects.toThrow(/Roles are managed/);
    await expect(
      as(ids.rep1, `insert into public.user_roles (user_id, role_id, granted_by) select $1, id, $1 from public.roles where code = 'super_admin'`, [ids.rep1]),
    ).rejects.toThrow(/row-level security/);
  });
  it("cannot change own hire date", async () => {
    await expect(as(ids.rep1, `update public.profiles set hire_date = '2020-01-01' where id = $1`, [ids.rep1])).rejects.toThrow(/hire date/);
  });
  it("cannot read question answer keys or full scenario personas", async () => {
    expect(await as(ids.rep1, `select * from public.questions`)).toEqual([]);
    expect(await as(ids.rep1, `select * from public.scenarios`)).toEqual([]);
  });
  it("sees the scenario catalog without hidden persona fields", async () => {
    const rows = await as<Record<string, unknown>>(ids.rep1, `select * from public.scenario_catalog`);
    expect(rows).toHaveLength(8);
    expect(Object.keys(rows[0])).not.toContain("persona");
    expect(JSON.stringify(rows)).not.toContain("hidden_needs");
  });
  it("cannot write roleplay messages, scores or self-reviews directly", async () => {
    const sid = (await db.query<{ id: string }>(
      `insert into public.roleplay_sessions (user_id, scenario_id) values ($1, '15000000-0000-4000-8000-000000000001') returning id`, [ids.rep1])).rows[0].id;
    await expect(as(ids.rep1, `insert into public.roleplay_messages (session_id, seq, role, content) values ($1, 1, 'rep', 'hi')`, [sid])).rejects.toThrow(/row-level security/);
    await expect(
      as(ids.rep1, `insert into public.roleplay_scores (session_id, source, scores, overall) values ($1, 'manager', '{}', 100)`, [sid]),
    ).rejects.toThrow(/row-level security/);
    await expect(as(ids.rep1, `insert into public.roleplay_comments (session_id, author_id, body) values ($1, $2, 'great job me')`, [sid, ids.rep1])).rejects.toThrow(/row-level security/);
    // their manager can comment
    await as(ids.manager, `insert into public.roleplay_comments (session_id, author_id, body) values ($1, $2, 'Ask for the order sooner.')`, [sid, ids.manager]);
    expect(await as(ids.rep1, `select body from public.roleplay_comments where session_id = $1`, [sid])).toHaveLength(1);
    // the owner sees it; a rep on another team does not
    expect(await as(ids.owner, `select id from public.roleplay_sessions where id = $1`, [sid])).toHaveLength(1);
    await db.query(`update public.profiles set status = 'active' where id = $1`, [ids.rep2]);
    expect(await as(ids.rep2, `select id from public.roleplay_sessions where id = $1`, [sid])).toEqual([]);
    expect(await as(ids.rep2, `select id from public.roleplay_comments where session_id = $1`, [sid])).toEqual([]);
  });
  it("cannot read the audit log or change settings", async () => {
    expect(await as(ids.rep1, `select * from public.audit_log`)).toEqual([]);
    await as(ids.rep1, `update public.app_settings set daily_roleplay_limit = 999`);
    expect((await db.query<{ daily_roleplay_limit: number }>(`select daily_roleplay_limit from public.app_settings`)).rows[0].daily_roleplay_limit).toBe(10);
  });
  it("can read published lessons but cannot write progress directly (server records it)", async () => {
    expect((await as(ids.rep1, `select id from public.lessons`)).length).toBe(37);
    await expect(
      as(ids.rep1, `insert into public.lesson_progress (user_id, lesson_id, status) values ($1, '13000000-0000-4000-8000-000000000607', 'completed')`, [ids.rep1]),
    ).rejects.toThrow(/row-level security/);
  });
  it("cannot create quiz attempts or answers directly", async () => {
    await expect(
      as(ids.rep1, `insert into public.quiz_attempts (quiz_id, user_id, score_pct, passed) values ('12000000-0000-4000-8000-000000000007', $1, 100, true)`, [ids.rep1]),
    ).rejects.toThrow(/row-level security/);
  });
  it("cannot enter their own KPIs", async () => {
    await expect(
      as(ids.rep1, `insert into public.field_kpis (user_id, period_month, sales_php, entered_by) values ($1, '2026-11-01', 999999, $1)`, [ids.rep1]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("manager", () => {
  it("sees reps on their team, not other teams", async () => {
    const rows = await as<{ id: string }>(ids.manager, `select id from public.profiles where role = 'rep'`);
    expect(rows.map((r) => r.id)).toEqual([ids.rep1]);
  });
  it("can set a rep's hire date but not their role", async () => {
    await as(ids.manager, `update public.profiles set hire_date = '2026-11-01' where id = $1`, [ids.rep1]);
    await expect(as(ids.manager, `update public.profiles set role = 'manager' where id = $1`, [ids.rep1])).rejects.toThrow(/Roles are managed/);
  });
  it("can enter KPIs for own rep only", async () => {
    await as(ids.manager, `insert into public.field_kpis (user_id, period_month, sales_php, entered_by) values ($1, '2026-11-01', 150000, $2)`, [ids.rep1, ids.manager]);
    await expect(
      as(ids.manager, `insert into public.field_kpis (user_id, period_month, sales_php, entered_by) values ($1, '2026-11-01', 1, $2)`, [ids.rep2, ids.manager]),
    ).rejects.toThrow(/row-level security/);
  });
  it("cannot create teams", async () => {
    await expect(as(ids.manager, `insert into public.teams (name) values ('Rogue')`)).rejects.toThrow(/row-level security/);
  });
});

describe("owner", () => {
  it("sees everyone and can deactivate a rep (audited)", async () => {
    expect(await as(ids.owner, `select id from public.profiles`)).toHaveLength(4);
    await as(ids.owner, `update public.profiles set status = 'inactive', exit_reason = 'Resigned' where id = $1`, [ids.rep2]);
    const audit = (await db.query<{ actor_id: string }>(`select actor_id from public.audit_log where entity = 'profiles' and entity_id = $1 order by id desc limit 1`, [ids.rep2])).rows[0];
    expect(audit.actor_id).toBe(ids.owner);
  });
  it("deactivated users can no longer read anything", async () => {
    expect(await as(ids.rep2, `select * from public.profiles`)).toEqual([]);
    expect(await as(ids.rep2, `select * from public.app_settings`)).toEqual([]);
  });
  it("cannot remove the last active owner", async () => {
    // the owner (Super administrator) can't deactivate themself or lose the role while they're the only one
    await expect(as(ids.owner, `update public.profiles set status = 'inactive' where id = $1`, [ids.owner])).rejects.toThrow(/at least one active Super administrator/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(`select set_config('request.jwt.claim.sub', '${ids.owner}', true)`);
        await tx.query(`delete from public.user_roles where user_id = $1 and role_id = (select id from public.roles where code = 'super_admin')`, [ids.owner]);
      }),
    ).rejects.toThrow(/at least one active Super administrator/);
  });
  it("cannot fake an employee's consent", async () => {
    await expect(as(ids.owner, `update public.profiles set consent_at = now() where id = $1`, [ids.manager])).rejects.toThrow(/consent/);
  });
});

describe("roleplay scores", () => {
  it("allows only one current score per roleplay (blocks double grading)", async () => {
    const sid = (await db.query<{ id: string }>(
      `insert into public.roleplay_sessions (user_id, scenario_id, status) values ($1, '15000000-0000-4000-8000-000000000001', 'ended') returning id`, [ids.rep1])).rows[0].id;
    await db.query(`insert into public.roleplay_scores (session_id, source, scores, overall, is_current) values ($1, 'ai', '{}', 70, true)`, [sid]);
    await expect(
      db.query(`insert into public.roleplay_scores (session_id, source, scores, overall, is_current) values ($1, 'ai', '{}', 75, true)`, [sid]),
    ).rejects.toThrow(/roleplay_scores_one_current|duplicate key/);
    // a manager override (old score made non-current first) still works, and the original is kept
    await db.query(`update public.roleplay_scores set is_current = false where session_id = $1`, [sid]);
    await db.query(`insert into public.roleplay_scores (session_id, source, scores, overall, is_current) values ($1, 'manager', '{}', 80, true)`, [sid]);
    const rows = (await db.query<{ n: number; cur: number }>(`select count(*) n, count(*) filter (where is_current) cur from public.roleplay_scores where session_id = $1`, [sid])).rows[0];
    expect([Number(rows.n), Number(rows.cur)]).toEqual([2, 1]);
  });
});

describe("sign-up links", () => {
  const status = async (id: string) =>
    (await db.query<{ status: string; role: string; team_id: string | null; full_name: string }>(`select status, role, team_id, full_name from public.profiles where id = $1`, [id])).rows[0];
  let token = "";

  it("a manager can create a link for their own team, not another team", async () => {
    const rows = await as<{ token: string }>(ids.manager, `insert into public.signup_links (team_id, created_by, max_uses) values ($1, $2, 1) returning token`, [teamA, ids.manager]);
    token = rows[0].token;
    expect(token).toMatch(/^[0-9a-f]{36}$/);
    await expect(
      as(ids.manager, `insert into public.signup_links (team_id, created_by) values ($1, $2)`, [teamB, ids.manager]),
    ).rejects.toThrow(/row-level security/);
  });

  it("reps cannot see links", async () => {
    expect(await as(ids.rep1, `select * from public.signup_links`)).toEqual([]);
  });

  it("anonymous visitors can check a link without reading the table", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.exec(`set local role anon`);
      return (await tx.query<{ team_name: string; valid: boolean }>(`select * from public.signup_link_info($1)`, [token])).rows;
    });
    expect(rows).toEqual([{ team_name: "Sales Team A", valid: true }]);
  });

  it("signing up with a valid link makes an active rep on that team and uses up the link", async () => {
    const id = "00000000-0000-0000-0000-0000000000a1";
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'new1@x.ph', $2)`, [id, JSON.stringify({ signup_token: token, full_name: "Bea Cruz" })]);
    expect(await status(id)).toEqual({ status: "active", role: "rep", team_id: teamA, full_name: "Bea Cruz" });
    expect((await db.query<{ uses: number }>(`select uses from public.signup_links where token = $1`, [token])).rows[0].uses).toBe(1);
  });

  it("a used-up link no longer grants access (pending instead)", async () => {
    const id = "00000000-0000-0000-0000-0000000000a2";
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'new2@x.ph', $2)`, [id, JSON.stringify({ signup_token: token })]);
    expect((await status(id)).status).toBe("inactive");
  });

  it("signing up without a token, or trying to claim a role, gives a pending rep with no access", async () => {
    const id = "00000000-0000-0000-0000-0000000000a3";
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'sneaky@x.ph', $2)`, [id, JSON.stringify({ role: "owner", team_id: teamB })]);
    expect(await status(id)).toEqual({ status: "inactive", role: null, team_id: null, full_name: "" });
    expect(await as(id, `select * from public.lessons`)).toEqual([]);
  });

  it("users invited by the owner are still created active", async () => {
    const id = "00000000-0000-0000-0000-0000000000a4";
    await db.query(`insert into auth.users (id, email, invited_at) values ($1, 'invited@x.ph', now())`, [id]);
    expect((await status(id)).status).toBe("active");
  });
});

describe("anonymous", () => {
  it("reads nothing", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.exec(`set local role anon`);
      return (await tx.query(`select * from public.profiles`)).rows;
    });
    expect(rows).toEqual([]);
  });
});
