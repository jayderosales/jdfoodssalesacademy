/**
 * Shared DB test harness: runs the real migrations + seeds in an in-memory Postgres (PGlite) with small stand-ins
 * for Supabase's auth/storage schemas. No Docker or Supabase project needed.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = path.resolve(__dirname, "..");

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions;
  create extension pgcrypto schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb not null default '{}', raw_user_meta_data jsonb not null default '{}', invited_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
`;

const GRANTS = `
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
`;

export const SEEDS = ["seed.sql", "seed_content_1_lessons.sql", "seed_content_2_products.sql", "seed_content_3_quizzes.sql", "seed_content_4_scenarios.sql"];

export type Aal = "aal1" | "aal2";

export async function createTestDb(opts: { seedTwice?: boolean } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  const dir = path.join(root, "migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(path.join(dir, f), "utf8"));
  for (let i = 0; i < (opts.seedTwice ? 2 : 1); i++) {
    for (const f of SEEDS) await db.exec(readFileSync(path.join(root, f), "utf8"));
  }
  await db.exec(GRANTS);

  /** Run SQL as a signed-in user (role `authenticated`). Sessions are MFA-verified (aal2) unless `aal` says otherwise. */
  async function as<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = [], aal: Aal = "aal2") {
    return db.transaction(async (tx) => {
      const claims = JSON.stringify({ sub: uid, aal, role: "authenticated" });
      await tx.exec(
        `set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true); select set_config('request.jwt.claims', '${claims}', true);`,
      );
      return (await tx.query<T>(sql, params)).rows;
    });
  }

  /** Run SQL as an anonymous visitor. */
  async function asAnon<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
      await tx.exec(`set local role anon;`);
      return (await tx.query<T>(sql, params)).rows;
    });
  }

  /** Create a user through auth.users (fires the profile trigger) with the given role codes. */
  async function createUser(id: string, email: string, roles: string[], extra: Record<string, unknown> = {}) {
    await db.query(`insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)`, [
      id,
      email,
      JSON.stringify({ roles, full_name: email, ...extra }),
    ]);
  }

  return { db, as, asAnon, createUser };
}
