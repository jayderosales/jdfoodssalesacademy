-- Phase 1b (part 2): notification engine, working-hours calendar, escalation ladder, executive risk feed.

-- ================================================================ permissions
insert into public.permissions (code, module, description, is_restricted) values
  ('risk.view', 'admin', 'See the executive risk feed (escalated overdue items)', false)
on conflict (code) do nothing;

-- ================================================================ settings: email switch and working hours
alter table public.app_settings
  add column email_enabled boolean not null default false,
  add column work_days int[] not null default array[1, 2, 3, 4, 5, 6], -- ISO weekday: 1 = Monday … 7 = Sunday
  add column work_start time not null default '08:00',
  add column work_end time not null default '17:00',
  add constraint work_hours_valid check (work_end > work_start and cardinality(work_days) between 1 and 7);

create table public.holidays (
  day date primary key,
  name text not null,
  needs_verification boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.holidays enable row level security;
create policy "holidays: read" on public.holidays for select to authenticated using (public.is_active_user());
create policy "holidays: manage" on public.holidays for all to authenticated
  using (public.has_permission('admin.settings.manage')) with check (public.has_permission('admin.settings.manage'));

-- Starter list (Philippine regular holidays and common special non-working days). Dates that change yearly are
-- proclaimed by the President; verify every year in Settings → Working hours.
insert into public.holidays (day, name) values
  ('2026-12-08', 'Feast of the Immaculate Conception'),
  ('2026-12-24', 'Christmas Eve'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-30', 'Rizal Day'),
  ('2026-12-31', 'Last day of the year'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-03-25', 'Maundy Thursday'),
  ('2027-03-26', 'Good Friday'),
  ('2027-03-27', 'Black Saturday'),
  ('2027-04-09', 'Araw ng Kagitingan'),
  ('2027-05-01', 'Labor Day'),
  ('2027-06-12', 'Independence Day'),
  ('2027-08-21', 'Ninoy Aquino Day'),
  ('2027-08-30', 'National Heroes Day'),
  ('2027-11-01', 'All Saints'' Day'),
  ('2027-11-30', 'Bonifacio Day'),
  ('2027-12-08', 'Feast of the Immaculate Conception'),
  ('2027-12-25', 'Christmas Day'),
  ('2027-12-30', 'Rizal Day'),
  ('2027-12-31', 'Last day of the year')
on conflict do nothing;

-- Add N working hours to a moment (Manila time): skips non-working days, holidays and time outside work_start–work_end.
create or replace function public.add_working_hours(p_start timestamptz, p_hours numeric)
returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  s public.app_settings;
  local_ts timestamp := p_start at time zone 'Asia/Manila';
  remaining interval := make_interval(secs => greatest(p_hours, 0) * 3600);
  day_start timestamp;
  day_end timestamp;
  avail interval;
  guard int := 0;
begin
  select * into s from public.app_settings limit 1;
  loop
    guard := guard + 1;
    if guard > 400 then raise exception 'Working calendar has no working time.'; end if;
    day_start := local_ts::date + s.work_start;
    day_end := local_ts::date + s.work_end;
    if extract(isodow from local_ts)::int = any (s.work_days)
       and not exists (select 1 from public.holidays h where h.day = local_ts::date)
       and local_ts < day_end then
      if local_ts < day_start then local_ts := day_start; end if;
      avail := day_end - local_ts;
      if remaining <= avail then
        return (local_ts + remaining) at time zone 'Asia/Manila';
      end if;
      remaining := remaining - avail;
    end if;
    local_ts := (local_ts::date + 1) + s.work_start;
  end loop;
end $$;
grant execute on function public.add_working_hours to authenticated, service_role;

-- ================================================================ notifications engine
alter table public.notifications
  add column href text not null default '',
  add column priority text not null default 'normal' check (priority in ('normal', 'high')),
  add column event_id bigint references public.domain_events(id) on delete set null,
  add column email_status text not null default 'none' check (email_status in ('none', 'pending', 'sent', 'failed', 'skipped')),
  add column email_error text not null default '';
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_email_pending_idx on public.notifications (created_at) where email_status = 'pending';

create table public.notification_rules (
  event_type text primary key,
  label text not null,
  title_template text not null,
  body_template text not null default '',
  href_template text not null default '',
  in_app boolean not null default true,
  email boolean not null default false,
  mandatory boolean not null default false, -- users can't switch it off
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null references public.notification_rules(event_type) on delete cascade,
  in_app boolean not null default true,
  email boolean not null default true,
  primary key (user_id, event_type)
);
alter table public.notification_rules enable row level security;
alter table public.notification_preferences enable row level security;
create trigger touch_notification_rules before update on public.notification_rules for each row execute function public.touch_updated_at();

create policy "notification_rules: read" on public.notification_rules for select to authenticated using (public.is_active_profile());
create policy "notification_rules: manage" on public.notification_rules for update to authenticated
  using (public.has_permission('admin.settings.manage')) with check (public.has_permission('admin.settings.manage'));
create policy "notification_preferences: own" on public.notification_preferences for all to authenticated
  using (user_id = auth.uid() and public.is_active_profile()) with check (user_id = auth.uid() and public.is_active_profile());

-- {{key}} → payload value
create or replace function public.render_template(p_template text, p_payload jsonb) returns text
language plpgsql immutable as $$
declare
  out text := coalesce(p_template, '');
  k text;
  v text;
begin
  for k, v in select key, coalesce(value #>> '{}', '') from jsonb_each(coalesce(p_payload, '{}')) loop
    out := replace(out, '{{' || k || '}}', v);
  end loop;
  return regexp_replace(out, '\{\{[a-z_]+\}\}', '', 'g');
end $$;

-- Send one notification event to the given users, honouring the rule and each user's preferences.
create or replace function public.notify_users(p_event_type text, p_recipients uuid[], p_payload jsonb, p_event_id bigint default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  r public.notification_rules;
  email_on boolean;
  uid uuid;
  pref public.notification_preferences;
  n int := 0;
begin
  select * into r from public.notification_rules where event_type = p_event_type and active;
  if r.event_type is null then return 0; end if;
  select coalesce((select email_enabled from public.app_settings limit 1), false) into email_on;
  for uid in select distinct x from unnest(coalesce(p_recipients, array[]::uuid[])) x
             join public.profiles p on p.id = x and p.status = 'active' loop
    select * into pref from public.notification_preferences where user_id = uid and event_type = p_event_type;
    if r.in_app and (r.mandatory or coalesce(pref.in_app, true)) then
      insert into public.notifications (user_id, type, payload, href, priority, event_id, email_status)
      values (
        uid, p_event_type,
        jsonb_build_object('title', public.render_template(r.title_template, p_payload),
                           'body', public.render_template(r.body_template, p_payload),
                           'href', public.render_template(r.href_template, p_payload)),
        public.render_template(r.href_template, p_payload), r.priority, p_event_id,
        case when not (r.email and (r.mandatory or coalesce(pref.email, true))) then 'none'
             when email_on then 'pending' else 'skipped' end
      );
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.notify_users from public, anon, authenticated;

-- Users holding a role (active grant, active profile).
create or replace function public.users_with_role(p_role_code text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct ur.user_id), array[]::uuid[])
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.code = p_role_code and r.active
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where (ur.valid_from is null or ur.valid_from <= public.manila_today())
    and (ur.valid_to is null or ur.valid_to >= public.manila_today())
$$;
revoke execute on function public.users_with_role from public, anon, authenticated;

-- The user account of someone's supervisor (via employees.supervisor_id), or null.
create or replace function public.supervisor_user_of(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select sp.id
  from public.profiles me
  join public.employees e on e.id = me.employee_id
  join public.profiles sp on sp.employee_id = e.supervisor_id and sp.status = 'active'
  where me.id = p_user
  limit 1
$$;
revoke execute on function public.supervisor_user_of from public, anon, authenticated;

-- Dispatcher: every event with a "recipients" array in its payload is delivered through its notification rule.
create or replace function public.handle_domain_event(e public.domain_events) returns void
language plpgsql security definer set search_path = public as $$
declare
  recipients uuid[];
begin
  if e.payload ? 'recipients' then
    select coalesce(array_agg(value::uuid), array[]::uuid[]) into recipients from jsonb_array_elements_text(e.payload->'recipients');
    perform public.notify_users(e.type, recipients, e.payload, e.id);
  end if;
end $$;
revoke execute on function public.handle_domain_event from public, anon, authenticated;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.mark_notifications_read from public, anon;
grant execute on function public.mark_notifications_read to authenticated;

-- Live bell: publish notifications to Supabase Realtime (RLS limits each user to their own rows).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ================================================================ escalation
create table public.escalation_rules (
  item_type text not null,
  level int not null check (level between 1 and 5),
  after_working_hours numeric not null check (after_working_hours > 0),
  target text not null check (target in ('supervisor', 'executive')),
  active boolean not null default true,
  primary key (item_type, level)
);
alter table public.escalation_rules enable row level security;
create policy "escalation_rules: read" on public.escalation_rules for select to authenticated using (public.is_active_user());
create policy "escalation_rules: manage" on public.escalation_rules for all to authenticated
  using (public.has_permission('admin.settings.manage')) with check (public.has_permission('admin.settings.manage'));

-- Sources of escalatable items: a view per module with columns
-- (item_id text, owner_ids uuid[], started_at timestamptz, title text, href text). Modules register theirs here.
create table public.escalation_sources (
  item_type text primary key,
  view_name text not null,
  label text not null
);
alter table public.escalation_sources enable row level security;
create policy "escalation_sources: read" on public.escalation_sources for select to authenticated using (public.is_active_user());

create table public.escalations (
  id bigint generated always as identity primary key,
  item_type text not null,
  item_id text not null,
  level int not null,
  target text not null,
  notified uuid[] not null default array[]::uuid[],
  created_at timestamptz not null default now(),
  unique (item_type, item_id, level)
);
alter table public.escalations enable row level security;
create policy "escalations: read" on public.escalations for select to authenticated
  using (public.has_permission('risk.view') or public.has_permission('audit.view') or auth.uid() = any (notified));

create table public.risk_alerts (
  id bigint generated always as identity primary key,
  item_type text not null,
  item_id text not null,
  title text not null,
  href text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (item_type, item_id)
);
create index risk_alerts_open_idx on public.risk_alerts (created_at desc) where resolved_at is null;
alter table public.risk_alerts enable row level security;
create policy "risk_alerts: read" on public.risk_alerts for select to authenticated using (public.has_permission('risk.view'));

insert into public.notification_rules (event_type, label, title_template, body_template, href_template, email, mandatory, priority) values
  ('escalation.supervisor', 'Overdue item escalated to you (supervisor)', 'Overdue: {{title}}',
   '{{owner_names}} hasn''t acted on this for {{hours}} working hours. Please follow up.', '{{href}}', true, true, 'high'),
  ('escalation.executive', 'Overdue item escalated to the executive risk feed', 'Escalated to executives: {{title}}',
   'Still not acted on after {{hours}} working hours.', '{{href}}', true, true, 'high')
on conflict do nothing;

-- Run by pg_cron every 15 minutes. Each (item, level) fires once. Items with no supervisor go straight to executives.
create or replace function public.escalate_overdue(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  src public.escalation_sources;
  rule public.escalation_rules;
  item record;
  targets uuid[];
  sup uuid;
  owner uuid;
  names text;
  fired int := 0;
  effective_target text;
begin
  for src in select * from public.escalation_sources loop
    for item in execute format('select item_id::text, owner_ids, started_at, title, href from public.%I', src.view_name) loop
      for rule in select * from public.escalation_rules where item_type = src.item_type and active order by level loop
        continue when public.add_working_hours(item.started_at, rule.after_working_hours) > p_now;
        continue when exists (select 1 from public.escalations where item_type = src.item_type and item_id = item.item_id and level = rule.level);

        effective_target := rule.target;
        targets := array[]::uuid[];
        if rule.target = 'supervisor' then
          foreach owner in array coalesce(item.owner_ids, array[]::uuid[]) loop
            sup := public.supervisor_user_of(owner);
            if sup is not null and not sup = any (item.owner_ids) then targets := targets || sup; end if;
          end loop;
          if cardinality(targets) = 0 then effective_target := 'executive'; end if;
        end if;
        if effective_target = 'executive' then
          targets := public.users_with_role('ceo');
          insert into public.risk_alerts (item_type, item_id, title, href, reason)
          values (src.item_type, item.item_id, item.title, item.href,
                  format('Not acted on after %s working hours', rule.after_working_hours))
          on conflict (item_type, item_id) do update set resolved_at = null, reason = excluded.reason;
        end if;

        select string_agg(coalesce(nullif(full_name, ''), email), ', ') into names from public.profiles where id = any (item.owner_ids);
        insert into public.escalations (item_type, item_id, level, target, notified)
        values (src.item_type, item.item_id, rule.level, effective_target, targets);
        perform public.emit_event('escalation.' || effective_target, src.item_type, item.item_id,
          jsonb_build_object('recipients', to_jsonb(targets), 'title', item.title, 'href', item.href,
                             'hours', rule.after_working_hours, 'owner_names', coalesce(names, 'The assignee'), 'level', rule.level));
        fired := fired + 1;
      end loop;
    end loop;
  end loop;
  return fired;
end $$;
revoke execute on function public.escalate_overdue from public, anon, authenticated;

-- ================================================================ audit registration
select public.enable_audit('holidays');
select public.enable_audit('notification_rules');
select public.enable_audit('escalation_rules');
insert into public.audit_exempt (table_name, reason) values
  ('notification_preferences', 'Personal notification on/off switches.'),
  ('escalation_sources', 'Configuration, changed only by migrations.'),
  ('escalations', 'The escalation log is itself a record.'),
  ('risk_alerts', 'Generated by the escalation job.')
on conflict do nothing;
