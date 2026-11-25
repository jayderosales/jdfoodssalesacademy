-- Self sign-up links: owners/managers share a link; people who use it become active reps on that team.
-- Anyone who signs up WITHOUT a valid link gets an inactive (pending approval) account with no access.

create table public.signup_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses int check (max_uses is null or max_uses > 0), -- null = unlimited
  uses int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.signup_links (team_id);
alter table public.signup_links enable row level security;

create or replace function public.manages_team(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() and exists (select 1 from public.team_managers where team_id = tid and manager_id = auth.uid())
$$;
revoke execute on function public.manages_team from public, anon;
grant execute on function public.manages_team to authenticated, service_role;

create policy "signup_links: staff read" on public.signup_links for select to authenticated
  using (public.is_owner() or public.manages_team(team_id));
create policy "signup_links: staff create" on public.signup_links for insert to authenticated
  with check ((public.is_owner() or public.manages_team(team_id)) and created_by = auth.uid());
create policy "signup_links: staff update" on public.signup_links for update to authenticated
  using (public.is_owner() or public.manages_team(team_id)) with check (public.is_owner() or public.manages_team(team_id));

create trigger audit_signup_links after insert or update or delete on public.signup_links
  for each row execute function public.write_audit();

-- Public check for the join page (no table access for anonymous visitors).
create or replace function public.signup_link_info(p_token text)
returns table (team_name text, valid boolean)
language sql stable security definer set search_path = public as $$
  select t.name,
         (l.active and l.expires_at > now() and (l.max_uses is null or l.uses < l.max_uses))
  from public.signup_links l
  join public.teams t on t.id = l.team_id
  where l.token = p_token
$$;
revoke execute on function public.signup_link_info from public;
grant execute on function public.signup_link_info to anon, authenticated, service_role;

-- New auth user → profile.
--  * Created by an admin (role in app_metadata, or invited): as before.
--  * Self sign-up with a valid link token: active rep on the link's team; the link's use count goes up.
--  * Self sign-up without a valid token: inactive, waiting for approval.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  link public.signup_links;
  tok text := new.raw_user_meta_data->>'signup_token';
  self_name text := left(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), 120);
begin
  if new.raw_app_meta_data ? 'role' or new.invited_at is not null then
    insert into public.profiles (id, email, full_name, role, team_id, hire_date)
    values (
      new.id,
      coalesce(new.email, ''),
      coalesce(new.raw_app_meta_data->>'full_name', ''),
      coalesce((new.raw_app_meta_data->>'role')::public.user_role, 'rep'),
      nullif(new.raw_app_meta_data->>'team_id', '')::uuid,
      nullif(new.raw_app_meta_data->>'hire_date', '')::date
    );
    return new;
  end if;

  if tok is not null then
    select * into link from public.signup_links
    where token = tok and active and expires_at > now() and (max_uses is null or uses < max_uses)
    for update;
  end if;

  if link.id is not null then
    update public.signup_links set uses = uses + 1 where id = link.id;
    insert into public.profiles (id, email, full_name, role, team_id, hire_date, status)
    values (new.id, coalesce(new.email, ''), self_name, 'rep', link.team_id, (now() at time zone 'Asia/Manila')::date, 'active');
  else
    insert into public.profiles (id, email, full_name, role, status)
    values (new.id, coalesce(new.email, ''), self_name, 'rep', 'inactive');
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
