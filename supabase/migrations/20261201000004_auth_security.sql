-- Phase 1a: sign-in security and external self-registration.
--  * profiles.account_type: staff vs customer/distributor/supplier.
--  * External self-registration → inactive "pending" profile → an admin approves (assigns the portal role, activates).
--  * login_events (history incl. failed attempts) and user_devices (new-device alerts). Written by the server with
--    the service key only (failed attempts have no session); readable by the user (own) and security admins/auditors.

create type public.account_type as enum ('staff', 'customer', 'distributor', 'supplier');

alter table public.profiles
  add column account_type public.account_type not null default 'staff',
  add column company_name text not null default '',
  add column phone text not null default '',
  add column registration_note text not null default '',
  add column approved_at timestamptz,
  add column approved_by uuid references public.profiles(id) on delete set null;
create index on public.profiles (account_type, status);

-- Existing active users count as approved.
update public.profiles set approved_at = created_at where status = 'active' and approved_at is null;

create table public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  email text not null default '',
  at timestamptz not null default now(),
  ip text not null default '',
  user_agent text not null default '',
  device_id text not null default '',
  method text not null check (method in ('password', 'magic_link', 'invite', 'mfa', 'signout', 'idle_timeout')),
  success boolean not null,
  reason text not null default ''
);
create index on public.login_events (user_id, at desc);
create index on public.login_events (at desc);
alter table public.login_events enable row level security;

create table public.user_devices (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  label text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_ip text not null default '',
  primary key (user_id, device_id)
);
alter table public.user_devices enable row level security;

create policy "login_events: read" on public.login_events for select to authenticated using (
  (user_id = auth.uid() and public.is_active_profile())
  or public.has_permission('admin.security.manage') or public.has_permission('audit.view')
);
create policy "user_devices: read" on public.user_devices for select to authenticated using (
  (user_id = auth.uid() and public.is_active_profile())
  or public.has_permission('admin.security.manage') or public.has_permission('audit.view')
);
-- A user can forget one of their own devices (they'll get an alert next time it signs in).
create policy "user_devices: own delete" on public.user_devices for delete to authenticated using (user_id = auth.uid() and public.is_active_profile());

-- Admins approving registrations change account_type / approval fields; protect them from everyone else.
create or replace function public.protect_registration_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_permission('admin.users.manage') then
    return new;
  end if;
  if new.account_type is distinct from old.account_type
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by then
    raise exception 'Only an administrator can approve registrations or change the account type.';
  end if;
  return new;
end $$;
create trigger protect_registration_columns before update on public.profiles
  for each row execute function public.protect_registration_columns();
revoke execute on function public.protect_registration_columns() from public, anon, authenticated;

-- New auth user → profile (+ roles). Adds external self-registration to the Phase 1a RBAC version.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  link public.signup_links;
  tok text := new.raw_user_meta_data->>'signup_token';
  self_name text := left(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), 120);
  self_company text := left(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), 160);
  self_phone text := left(trim(coalesce(new.raw_user_meta_data->>'phone', '')), 40);
  self_note text := left(trim(coalesce(new.raw_user_meta_data->>'note', '')), 1000);
  requested text := new.raw_user_meta_data->>'account_type';
  role_codes text[];
begin
  -- Created by an administrator (server sets app_metadata) or invited.
  if new.raw_app_meta_data ? 'roles' or new.raw_app_meta_data ? 'role' or new.invited_at is not null then
    if new.raw_app_meta_data ? 'roles' then
      select array_agg(value) into role_codes from jsonb_array_elements_text(new.raw_app_meta_data->'roles');
    else
      role_codes := case coalesce(new.raw_app_meta_data->>'role', 'rep')
        when 'owner' then array['super_admin', 'ceo']
        when 'manager' then array['sales_head']
        else array['sales_rep'] end;
    end if;

    insert into public.profiles (id, email, full_name, team_id, hire_date, account_type, approved_at)
    values (
      new.id,
      coalesce(new.email, ''),
      coalesce(new.raw_app_meta_data->>'full_name', ''),
      nullif(new.raw_app_meta_data->>'team_id', '')::uuid,
      nullif(new.raw_app_meta_data->>'hire_date', '')::date,
      coalesce(nullif(new.raw_app_meta_data->>'account_type', '')::public.account_type, 'staff'),
      now()
    );
    insert into public.user_roles (user_id, role_id)
    select new.id, r.id from public.roles r where r.code = any (coalesce(role_codes, array[]::text[]))
    on conflict do nothing;
    return new;
  end if;

  -- External self-registration (customer / distributor / supplier): pending until approved. No roles yet.
  if requested in ('customer', 'distributor', 'supplier') then
    insert into public.profiles (id, email, full_name, status, account_type, company_name, phone, registration_note)
    values (new.id, coalesce(new.email, ''), self_name, 'inactive', requested::public.account_type, self_company, self_phone, self_note);
    return new;
  end if;

  -- Staff sign-up link (Academy): active Sales representative on the link's team.
  if tok is not null then
    select * into link from public.signup_links
    where token = tok and active and expires_at > now() and (max_uses is null or uses < max_uses)
    for update;
  end if;

  if link.id is not null then
    update public.signup_links set uses = uses + 1 where id = link.id;
    insert into public.profiles (id, email, full_name, team_id, hire_date, status, approved_at)
    values (new.id, coalesce(new.email, ''), self_name, link.team_id, public.manila_today(), 'active', now());
    insert into public.user_roles (user_id, role_id)
    select new.id, r.id from public.roles r where r.code = 'sales_rep';
  else
    -- Staff sign-up without a valid link: pending, no access.
    insert into public.profiles (id, email, full_name, status)
    values (new.id, coalesce(new.email, ''), self_name, 'inactive');
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Approve a pending registration: activate, set the portal role. Linking to a customer/distributor/supplier record
-- comes in Phases 3/4/7.
create or replace function public.approve_registration(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  role_code text;
begin
  if not public.has_permission('admin.users.manage') then
    raise exception 'You don''t have permission to approve registrations.';
  end if;
  select * into p from public.profiles where id = p_user for update;
  if p.id is null then raise exception 'User not found.'; end if;
  if p.status = 'active' then raise exception 'This account is already active.'; end if;
  if p.approved_at is not null then raise exception 'This account was approved before and later deactivated. Reactivate it instead.'; end if;

  role_code := case p.account_type when 'staff' then 'sales_rep' else p.account_type::text end;
  update public.profiles set status = 'active', approved_at = now(), approved_by = auth.uid() where id = p_user;
  insert into public.user_roles (user_id, role_id, granted_by)
  select p_user, r.id, auth.uid() from public.roles r where r.code = role_code
  on conflict do nothing;
end $$;
revoke execute on function public.approve_registration from public, anon;
grant execute on function public.approve_registration to authenticated, service_role;
