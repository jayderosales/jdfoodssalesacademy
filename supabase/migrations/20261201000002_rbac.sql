-- Phase 1a: role-based access control.
-- permissions (catalog, mirrored in src/lib/rbac/permissions.ts) → roles → role_permissions → user_roles (optionally
-- scoped to a location or department). RLS policies call has_permission*/is_* helpers defined here.
--
-- MFA: for internal (staff) users, has_permission() is false unless the session is aal2, so an internal user who has
-- not completed two-factor sign-in reads nothing except their own profile. Controlled by app_settings.require_mfa_internal.
--
-- profiles.role (owner/manager/rep) is kept as a READ-ONLY cache of the user's Academy access level, derived from
-- their permissions (academy.admin → owner, academy.team.manage → manager, academy.learn → rep, none → null).
-- It is maintained by triggers below so existing Academy queries keep working. Never use it for security decisions:
-- policies use has_permission().

-- ---------------------------------------------------------------- settings
alter table public.app_settings
  add column require_mfa_internal boolean not null default true,
  add column idle_timeout_internal_minutes int not null default 30 check (idle_timeout_internal_minutes between 5 and 1440),
  add column idle_timeout_external_minutes int not null default 10080 check (idle_timeout_external_minutes between 5 and 43200);

-- ---------------------------------------------------------------- catalog
create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+(\.[a-z_]+)+$'),
  module text not null,
  description text not null,
  is_restricted boolean not null default false
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+$'),
  name text not null,
  description text not null default '',
  is_internal boolean not null default true, -- staff (MFA applies) vs external portal users
  grants_all boolean not null default false, -- every permission, including ones added later
  is_system boolean not null default false,  -- seeded; can't be deleted or renamed
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade on update cascade,
  primary key (role_id, permission_code)
);
create index on public.role_permissions (permission_code);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  valid_from date,
  valid_to date,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint valid_range check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create unique index user_roles_unique_scope on public.user_roles
  (user_id, role_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'), coalesce(department_id, '00000000-0000-0000-0000-000000000000'));
create index on public.user_roles (role_id);
create index on public.user_roles (location_id);
create index on public.user_roles (department_id);

alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
create trigger touch_roles before update on public.roles for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- raw (session-independent) helpers
-- Used by triggers and by the session helpers below. Not exposed to API users.

create or replace function public.manila_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Manila')::date
$$;

-- Active grants for a user (date range applied). Inactive roles are ignored.
create or replace function public.user_grants(uid uuid)
returns table (role_id uuid, location_id uuid, department_id uuid, grants_all boolean, is_internal boolean)
language sql stable security definer set search_path = public as $$
  select ur.role_id, ur.location_id, ur.department_id, r.grants_all, r.is_internal
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.active
  where ur.user_id = uid
    and (ur.valid_from is null or ur.valid_from <= public.manila_today())
    and (ur.valid_to is null or ur.valid_to >= public.manila_today())
$$;

-- Does `uid` hold `perm`? p_location / p_department: null = "anywhere" (any grant counts); otherwise the grant must be
-- unscoped or scoped to that location/department.
create or replace function public.user_has_permission(uid uuid, perm text, p_location uuid default null, p_department uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_grants(uid) g
    where (g.grants_all or exists (select 1 from public.role_permissions rp where rp.role_id = g.role_id and rp.permission_code = perm))
      and (p_location is null or g.location_id is null or g.location_id = p_location)
      and (p_department is null or g.department_id is null or g.department_id = p_department)
  )
$$;

create or replace function public.user_is_internal(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_grants(uid) g where g.is_internal)
$$;

create or replace function public.academy_role_for(uid uuid) returns public.user_role
language sql stable security definer set search_path = public as $$
  select case
    when public.user_has_permission(uid, 'academy.admin') then 'owner'::public.user_role
    when public.user_has_permission(uid, 'academy.team.manage') then 'manager'::public.user_role
    when public.user_has_permission(uid, 'academy.learn') then 'rep'::public.user_role
  end
$$;

-- ---------------------------------------------------------------- session helpers (used in RLS)

-- The signed-in user's profile is active (no MFA check; used for "read my own profile").
create or replace function public.is_active_profile() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
$$;

create or replace function public.is_internal_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.user_is_internal(auth.uid())
$$;

-- Current session satisfies the MFA policy: external users always; internal users only at aal2 (when required).
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select not public.user_is_internal(auth.uid())
      or not coalesce((select require_mfa_internal from public.app_settings limit 1), true)
      or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
$$;

create or replace function public.has_permission(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_active_profile() and public.mfa_ok()
     and public.user_has_permission(auth.uid(), perm)
$$;

create or replace function public.has_permission_at(perm text, p_location uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_active_profile() and public.mfa_ok()
     and public.user_has_permission(auth.uid(), perm, p_location, null)
$$;

create or replace function public.has_permission_in_dept(perm text, p_department uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_active_profile() and public.mfa_ok()
     and public.user_has_permission(auth.uid(), perm, null, p_department)
$$;

create or replace function public.current_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles where id = auth.uid()
$$;

-- Permissions of the signed-in user, for the app shell (sidebar, buttons). Security is still enforced by RLS.
create or replace function public.my_access()
returns table (permission text, mfa_required boolean, mfa_ok boolean, is_internal boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select public.user_is_internal(auth.uid()) as internal,
           coalesce((select require_mfa_internal from public.app_settings limit 1), true) as req,
           public.mfa_ok() as ok,
           public.is_active_profile() as active
  )
  select p.code, me.internal and me.req, me.ok, me.internal
  from me
  cross join public.permissions p
  where me.active and me.ok and public.user_has_permission(auth.uid(), p.code)
  union all
  -- always one row so the app can read the MFA state even with no permissions
  select null, me.internal and me.req, me.ok, me.internal from me
$$;

-- ---------------------------------------------------------------- Academy helpers re-implemented on RBAC
-- Same names and signatures as before, so the existing Academy policies keep working.

create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select case
    when not (public.is_active_profile() and public.mfa_ok()) then null
    else public.academy_role_for(auth.uid())
  end
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission('academy.admin')
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission('academy.admin') or public.has_permission('academy.team.manage')
$$;

-- Active internal user who passed MFA (external portal users are not "active users" of the staff app).
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_profile() and public.mfa_ok() and public.is_internal_user()
$$;

create or replace function public.can_read_all() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission('readonly.all')
$$;

create or replace function public.manages_user(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission('academy.team.manage') and exists (
    select 1
    from public.profiles p
    join public.team_managers tm on tm.team_id = p.team_id
    where p.id = uid and tm.manager_id = auth.uid()
  )
$$;

create or replace function public.can_view_user(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (uid = auth.uid() and public.is_active_user()) or public.is_owner() or public.manages_user(uid) or public.can_read_all()
$$;

create or replace function public.can_manage_user(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or public.manages_user(uid)
$$;

create or replace function public.manages_team(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission('academy.team.manage')
     and exists (select 1 from public.team_managers where team_id = tid and manager_id = auth.uid())
$$;

-- ---------------------------------------------------------------- function privileges
revoke execute on function public.user_grants, public.user_has_permission, public.user_is_internal,
  public.academy_role_for from public, anon, authenticated;
grant execute on function public.user_grants, public.user_has_permission, public.user_is_internal,
  public.academy_role_for to service_role;

revoke execute on function public.is_active_profile, public.is_internal_user, public.mfa_ok, public.has_permission,
  public.has_permission_at, public.has_permission_in_dept, public.current_employee_id, public.my_access,
  public.can_read_all from public, anon;
grant execute on function public.manila_today, public.is_active_profile, public.is_internal_user, public.mfa_ok,
  public.has_permission, public.has_permission_at, public.has_permission_in_dept, public.current_employee_id,
  public.my_access, public.can_read_all to authenticated, service_role;

-- ---------------------------------------------------------------- profiles.role becomes a synced cache
alter table public.profiles alter column role drop not null, alter column role drop default;

create or replace function public.sync_academy_role(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.academy_role_for(uid);
begin
  perform set_config('app.role_sync', 'on', true);
  update public.profiles set role = r where id = uid and role is distinct from r;
  perform set_config('app.role_sync', 'off', true);
end $$;

create or replace function public.on_user_roles_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.sync_academy_role(old.user_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.sync_academy_role(new.user_id); end if;
  return coalesce(new, old);
end $$;
create trigger sync_role_after_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.on_user_roles_change();

create or replace function public.on_role_permissions_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rid uuid := coalesce(new.role_id, old.role_id);
  uid uuid;
begin
  for uid in select distinct user_id from public.user_roles where role_id = rid loop
    perform public.sync_academy_role(uid);
  end loop;
  return coalesce(new, old);
end $$;
create trigger sync_role_after_role_permissions after insert or delete on public.role_permissions
  for each row execute function public.on_role_permissions_change();

create or replace function public.on_roles_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'Built-in roles can''t be deleted. Deactivate it instead.';
  end if;
  if tg_op = 'UPDATE' and old.is_system and (new.code <> old.code or new.is_internal <> old.is_internal or new.grants_all <> old.grants_all) then
    raise exception 'The code, staff/external type and "all permissions" setting of a built-in role can''t be changed.';
  end if;
  if tg_op = 'UPDATE' and (new.active <> old.active or new.grants_all <> old.grants_all) then
    for uid in select distinct user_id from public.user_roles where role_id = new.id loop
      perform public.sync_academy_role(uid);
    end loop;
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_roles before update or delete on public.roles
  for each row execute function public.on_roles_change();

-- ---------------------------------------------------------------- keep at least one active super administrator
create or replace function public.active_super_admin_count(except_user uuid default null, except_grant uuid default null) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct ur.user_id)::int
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.code = 'super_admin' and r.active
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where (except_user is null or ur.user_id <> except_user)
    and (except_grant is null or ur.id <> except_grant)
    and (ur.valid_to is null or ur.valid_to >= public.manila_today())
$$;
revoke execute on function public.active_super_admin_count from public, anon, authenticated;

create or replace function public.guard_last_super_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if; -- service role / migrations
  if tg_table_name = 'user_roles' then
    if exists (select 1 from public.roles where id = old.role_id and code = 'super_admin')
       and (tg_op = 'DELETE' or new.role_id <> old.role_id or new.valid_to is not null)
       and public.active_super_admin_count(null, old.id) = 0 then
      raise exception 'There must be at least one active Super administrator.';
    end if;
  elsif tg_table_name = 'profiles' then
    if old.status = 'active' and new.status <> 'active'
       and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                   where ur.user_id = old.id and r.code = 'super_admin')
       and public.active_super_admin_count(old.id, null) = 0 then
      raise exception 'There must be at least one active Super administrator.';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_last_super_admin before update or delete on public.user_roles
  for each row execute function public.guard_last_super_admin();
create trigger guard_last_super_admin before update of status on public.profiles
  for each row execute function public.guard_last_super_admin();

-- ---------------------------------------------------------------- profile column protection (replaces the Academy version)
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
begin
  if new.role is distinct from old.role and coalesce(current_setting('app.role_sync', true), 'off') <> 'on' then
    if actor is null then
      return new; -- service role / migrations may still set it, but it is overwritten on the next role change
    end if;
    raise exception 'Roles are managed under Users → Roles, not on the profile.';
  end if;

  if actor is null then
    return new;
  end if;

  if new.employee_id is distinct from old.employee_id and not public.has_permission('admin.users.manage') then
    raise exception 'Only an administrator can link a user to an employee.';
  end if;

  if public.has_permission('admin.users.manage') or public.is_owner() then
    if actor <> old.id and (new.consent_version is distinct from old.consent_version or new.consent_at is distinct from old.consent_at) then
      raise exception 'Only the employee can give consent.';
    end if;
    return new;
  end if;

  if new.team_id is distinct from old.team_id
     or new.status is distinct from old.status
     or new.email is distinct from old.email
     or new.exit_date is distinct from old.exit_date
     or new.exit_reason is distinct from old.exit_reason
     or new.exit_stage_level is distinct from old.exit_stage_level then
    raise exception 'Only an administrator can change team, status or exit details.';
  end if;

  if actor <> old.id then
    if new.consent_version is distinct from old.consent_version
       or new.consent_at is distinct from old.consent_at
       or new.last_active_at is distinct from old.last_active_at then
      raise exception 'Managers can only change a rep''s name and hire date.';
    end if;
  else
    if new.hire_date is distinct from old.hire_date then
      raise exception 'Only your manager or an administrator can change your hire date.';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.sync_academy_role, public.on_user_roles_change, public.on_role_permissions_change,
  public.on_roles_change, public.guard_last_super_admin, public.protect_profile_columns from public, anon, authenticated;

-- ---------------------------------------------------------------- seed: permissions
insert into public.permissions (code, module, description, is_restricted) values
  ('admin.users.view',        'admin',    'See the list of users and their roles', false),
  ('admin.users.manage',      'admin',    'Invite, edit, deactivate users and assign roles', false),
  ('admin.roles.manage',      'admin',    'Create and edit roles and their permissions', false),
  ('admin.settings.manage',   'admin',    'Change company profile, branding and system settings', false),
  ('admin.security.manage',   'admin',    'Change sign-in security settings (MFA, session timeouts) and reset MFA', false),
  ('admin.org.manage',        'admin',    'Manage locations, departments, positions and teams', false),
  ('audit.view',              'audit',    'Search the audit log (non-restricted records)', false),
  ('audit.view_restricted',   'audit',    'See audit entries for restricted records (salaries, formulas, bank details)', true),
  ('readonly.all',            'audit',    'Read every non-restricted record (Auditor)', false),
  ('org.view',                'org',      'See the company directory: locations, departments, positions, employees', false),
  ('employees.manage',        'org',      'Add and edit employee basic profiles and reporting lines', false),
  ('academy.admin',           'academy',  'Academy administrator: content, settings, all reps', false),
  ('academy.team.manage',     'academy',  'Academy manager: coach, review and report on own teams', false),
  ('academy.learn',           'academy',  'Take Academy lessons, quizzes and roleplays', false),
  ('academy.reports.view',    'academy',  'See Academy reports', false),
  ('portal.customer',         'portal',   'Use the customer portal', false),
  ('portal.distributor',      'portal',   'Use the distributor portal', false),
  ('portal.supplier',         'portal',   'Use the supplier portal', false)
on conflict (code) do update set module = excluded.module, description = excluded.description, is_restricted = excluded.is_restricted;

-- ---------------------------------------------------------------- seed: roles
insert into public.roles (code, name, description, is_internal, grants_all, is_system) values
  ('super_admin',        'Super administrator',     'Full system access, including roles and security settings.', true, true, true),
  ('ceo',                'CEO',                     'Full access to every module and approval.', true, true, true),
  ('cfo',                'CFO / Finance head',      'Finance, accounting and treasury.', true, false, true),
  ('coo',                'COO',                     'Operations: inventory, procurement, manufacturing, logistics.', true, false, true),
  ('cmo',                'CMO',                     'Marketing and creatives.', true, false, true),
  ('operations_manager', 'Operations manager',      'Day-to-day operations; approves petty cash.', true, false, true),
  ('sales_head',         'Sales head',              'Leads the sales team; Academy manager for their teams.', true, false, true),
  ('hr_head',            'HR head',                 'People, attendance and payroll.', true, false, true),
  ('accounting_officer', 'Accounting officer',      'Bookkeeping, AR/AP, bank reconciliation.', true, false, true),
  ('sales_rep',          'Sales representative',    'Sells to customers; takes Academy training.', true, false, true),
  ('warehouse',          'Warehouse personnel',     'Receiving, put-away, picking, counting.', true, false, true),
  ('manufacturing',      'Manufacturing personnel', 'Production floor.', true, false, true),
  ('qa',                 'QA personnel',            'Quality inspections and batch release.', true, false, true),
  ('creative',           'Creative personnel',      'Design and content production.', true, false, true),
  ('trainer',            'Trainer',                 'Runs Academy training and coaching.', true, false, true),
  ('employee',           'Employee',                'Self-service only.', true, false, true),
  ('driver',             'Driver',                  'Delivery driver (unused while deliveries are by courier).', true, false, true),
  ('auditor',            'Auditor',                 'Read-only access to everything except restricted data.', true, false, true),
  ('customer',           'Customer',                'Customer portal user.', false, false, true),
  ('distributor',        'Distributor',             'Distributor portal user.', false, false, true),
  ('supplier',           'Supplier',                'Supplier portal user.', false, false, true)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, x.perm
from (values
  ('cfo', 'org.view'), ('coo', 'org.view'), ('cmo', 'org.view'), ('operations_manager', 'org.view'),
  ('hr_head', 'org.view'), ('hr_head', 'employees.manage'), ('hr_head', 'admin.users.view'), ('hr_head', 'academy.reports.view'),
  ('accounting_officer', 'org.view'), ('warehouse', 'org.view'), ('manufacturing', 'org.view'), ('qa', 'org.view'),
  ('creative', 'org.view'), ('employee', 'org.view'), ('driver', 'org.view'),
  ('sales_head', 'org.view'), ('sales_head', 'academy.team.manage'), ('sales_head', 'academy.reports.view'), ('sales_head', 'academy.learn'),
  ('trainer', 'org.view'), ('trainer', 'academy.team.manage'), ('trainer', 'academy.reports.view'),
  ('sales_rep', 'org.view'), ('sales_rep', 'academy.learn'),
  ('auditor', 'readonly.all'), ('auditor', 'audit.view'), ('auditor', 'org.view'), ('auditor', 'admin.users.view'),
  ('auditor', 'academy.reports.view'),
  ('customer', 'portal.customer'), ('distributor', 'portal.distributor'), ('supplier', 'portal.supplier')
) as x(role_code, perm)
join public.roles r on r.code = x.role_code
on conflict do nothing;

-- ---------------------------------------------------------------- migrate existing Academy users
-- owner → Super administrator + CEO; manager → Sales head; rep → Sales representative.
insert into public.user_roles (user_id, role_id)
select p.id, r.id
from public.profiles p
join public.roles r on r.code = any (case p.role
  when 'owner' then array['super_admin', 'ceo']
  when 'manager' then array['sales_head']
  else array['sales_rep'] end)
on conflict do nothing;

-- ---------------------------------------------------------------- new auth user → profile + roles
-- app_metadata.roles: array of role codes (set by the server with the service key).
-- app_metadata.role: legacy Academy value (owner/manager/rep), still accepted.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  link public.signup_links;
  tok text := new.raw_user_meta_data->>'signup_token';
  self_name text := left(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), 120);
  role_codes text[];
begin
  if new.raw_app_meta_data ? 'roles' or new.raw_app_meta_data ? 'role' or new.invited_at is not null then
    if new.raw_app_meta_data ? 'roles' then
      select array_agg(value) into role_codes from jsonb_array_elements_text(new.raw_app_meta_data->'roles');
    else
      role_codes := case coalesce(new.raw_app_meta_data->>'role', 'rep')
        when 'owner' then array['super_admin', 'ceo']
        when 'manager' then array['sales_head']
        else array['sales_rep'] end;
    end if;

    insert into public.profiles (id, email, full_name, team_id, hire_date)
    values (
      new.id,
      coalesce(new.email, ''),
      coalesce(new.raw_app_meta_data->>'full_name', ''),
      nullif(new.raw_app_meta_data->>'team_id', '')::uuid,
      nullif(new.raw_app_meta_data->>'hire_date', '')::date
    );
    insert into public.user_roles (user_id, role_id)
    select new.id, r.id from public.roles r where r.code = any (role_codes)
    on conflict do nothing;
    return new;
  end if;

  if tok is not null then
    select * into link from public.signup_links
    where token = tok and active and expires_at > now() and (max_uses is null or uses < max_uses)
    for update;
  end if;

  if link.id is not null then
    update public.signup_links set uses = uses + 1 where id = link.id;
    insert into public.profiles (id, email, full_name, team_id, hire_date, status)
    values (new.id, coalesce(new.email, ''), self_name, link.team_id, public.manila_today(), 'active');
    insert into public.user_roles (user_id, role_id)
    select new.id, r.id from public.roles r where r.code = 'sales_rep';
  else
    insert into public.profiles (id, email, full_name, status)
    values (new.id, coalesce(new.email, ''), self_name, 'inactive');
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
