-- Phase 1a: generic audit trail.
--  * write_audit() now stores a field-level diff and a restricted flag, and skips noise columns.
--  * public.audit_tables lists every audited table (and whether it holds restricted data); public.audit_exempt lists
--    tables deliberately NOT audited, with the reason. A DB test fails if a public table is in neither.
--  * enable_audit('table', restricted) attaches the trigger; every future migration calls it for new tables.
--  * audit_log is append-only (updates/deletes blocked, even for the service role, unless a retention purge sets
--    app.audit_purge = 'on').
--  * restricted_access_log + log_restricted_access(): record who READ restricted data (used from Phases 5/8/9).

alter table public.audit_log
  add column diff jsonb,
  add column is_restricted boolean not null default false;
create index on public.audit_log (actor_id, at desc);

create table public.audit_tables (
  table_name text primary key,
  is_restricted boolean not null default false,
  ignore_columns text[] not null default array['updated_at', 'updated_by']
);
create table public.audit_exempt (
  table_name text primary key,
  reason text not null
);
alter table public.audit_tables enable row level security;
alter table public.audit_exempt enable row level security;
create policy "audit_tables: read" on public.audit_tables for select to authenticated using (public.has_permission('audit.view'));
create policy "audit_exempt: read" on public.audit_exempt for select to authenticated using (public.has_permission('audit.view'));

create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cfg public.audit_tables;
  b jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  a jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  ignored text[];
  d jsonb := '{}'::jsonb;
  k text;
  rec_id text;
begin
  select * into cfg from public.audit_tables where table_name = tg_table_name;
  ignored := coalesce(cfg.ignore_columns, array['updated_at', 'updated_by']);

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(a) loop
      if not (k = any (ignored)) and (b->k) is distinct from (a->k) then
        d := d || jsonb_build_object(k, jsonb_build_array(b->k, a->k));
      end if;
    end loop;
    if d = '{}'::jsonb then
      return new; -- only ignored columns changed
    end if;
  end if;

  rec_id := coalesce(a->>'id', b->>'id',
                     concat_ws(':', coalesce(a, b)->>'team_id', coalesce(a, b)->>'manager_id', coalesce(a, b)->>'level',
                               coalesce(a, b)->>'role_id', coalesce(a, b)->>'permission_code', coalesce(a, b)->>'user_id'));

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after, diff, is_restricted)
  values (auth.uid(), lower(tg_op), tg_table_name, rec_id, b, a, case when tg_op = 'UPDATE' then d end, coalesce(cfg.is_restricted, false));

  return coalesce(new, old);
end $$;
revoke execute on function public.write_audit() from public, anon, authenticated;

create or replace function public.enable_audit(p_table text, p_restricted boolean default false, p_ignore text[] default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_tables (table_name, is_restricted, ignore_columns)
  values (p_table, p_restricted, coalesce(p_ignore, array['updated_at', 'updated_by']))
  on conflict (table_name) do update set is_restricted = excluded.is_restricted, ignore_columns = excluded.ignore_columns;
  execute format('drop trigger if exists audit_%1$s on public.%1$I', p_table);
  execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.write_audit()', p_table);
end $$;
revoke execute on function public.enable_audit from public, anon, authenticated;

-- Existing audited Academy tables (re-attached so they're registered) + new Phase 1a tables.
select public.enable_audit(t) from unnest(array[
  'app_settings', 'teams', 'team_managers', 'learning_paths', 'modules', 'lessons', 'lesson_assets', 'products',
  'quizzes', 'questions', 'scenarios', 'rubrics', 'levels', 'badges', 'kpi_targets', 'field_kpis', 'level_signoffs',
  'roleplay_scores', 'path_assignments', 'prehire_invites', 'signup_links',
  'entities', 'locations', 'departments', 'positions', 'employees',
  'permissions', 'roles', 'role_permissions', 'user_roles'
]) as t;
-- profiles: activity timestamps are noise
select public.enable_audit('profiles', false, array['updated_at', 'updated_by', 'last_active_at']);

insert into public.audit_exempt (table_name, reason) values
  ('audit_log', 'The audit log itself.'),
  ('audit_tables', 'Audit configuration, changed only by migrations.'),
  ('audit_exempt', 'Audit configuration, changed only by migrations.'),
  ('restricted_access_log', 'Append-only access log.'),
  ('login_events', 'Append-only sign-in log.'),
  ('user_devices', 'Sign-in device list, maintained by the server.'),
  ('ai_usage', 'Append-only AI cost log.'),
  ('notifications', 'High-volume messages to users.'),
  ('lesson_progress', 'High-volume learning activity, written by the server.'),
  ('quiz_attempts', 'Learning activity, written by the server.'),
  ('quiz_answers', 'Learning activity, written by the server.'),
  ('roleplay_sessions', 'Learning activity, written by the server.'),
  ('roleplay_messages', 'High-volume chat transcript, written by the server.'),
  ('roleplay_comments', 'Coaching comments; author and time are stored on the row.'),
  ('skill_snapshots', 'Computed daily snapshots.'),
  ('level_history', 'Computed level changes; the sign-off is audited.'),
  ('user_badges', 'Computed awards.')
on conflict (table_name) do nothing;

-- ---------------------------------------------------------------- append-only
create or replace function public.audit_log_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.audit_purge', true), 'off') = 'on' and tg_op = 'DELETE' then
    return old; -- data-retention purge (scheduled job)
  end if;
  raise exception 'The audit log can''t be changed or deleted.';
end $$;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
revoke execute on function public.audit_log_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------- who can read which audit rows
drop policy "audit: read" on public.audit_log;
create policy "audit: read" on public.audit_log for select to authenticated using (
  public.has_permission('audit.view') and (not is_restricted or public.has_permission('audit.view_restricted'))
);

-- ---------------------------------------------------------------- restricted data reads
create table public.restricted_access_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  at timestamptz not null default now(),
  table_name text not null,
  record_id text not null,
  purpose text not null default ''
);
create index on public.restricted_access_log (at desc);
create index on public.restricted_access_log (table_name, record_id);
alter table public.restricted_access_log enable row level security;
create policy "restricted_access_log: read" on public.restricted_access_log for select to authenticated
  using (public.has_permission('audit.view_restricted'));

create or replace function public.log_restricted_access(p_table text, p_record text, p_purpose text default '')
returns void
language sql security definer set search_path = public as $$
  insert into public.restricted_access_log (user_id, table_name, record_id, purpose)
  values (auth.uid(), p_table, p_record, left(coalesce(p_purpose, ''), 200))
$$;
revoke execute on function public.log_restricted_access from public, anon;
grant execute on function public.log_restricted_access to authenticated, service_role;

create trigger restricted_access_log_immutable before update or delete on public.restricted_access_log
  for each row execute function public.audit_log_immutable();
