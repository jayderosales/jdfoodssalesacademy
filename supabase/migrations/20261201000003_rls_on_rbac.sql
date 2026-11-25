-- Phase 1a: RLS for the organization and RBAC tables, and platform-level policies moved from "owner" to permissions.
-- Academy content/learning policies are unchanged: they call is_owner()/is_staff()/can_view_user(), which now
-- resolve through has_permission() (see 20261201000002_rbac.sql).

-- ---------------------------------------------------------------- organization
create policy "entities: read" on public.entities for select to authenticated
  using (public.has_permission('org.view') or public.can_read_all());
create policy "entities: manage" on public.entities for all to authenticated
  using (public.has_permission('admin.settings.manage')) with check (public.has_permission('admin.settings.manage'));

create policy "locations: read" on public.locations for select to authenticated
  using (public.has_permission('org.view') or public.can_read_all());
create policy "locations: manage" on public.locations for all to authenticated
  using (public.has_permission('admin.org.manage')) with check (public.has_permission('admin.org.manage'));

create policy "departments: read" on public.departments for select to authenticated
  using (public.has_permission('org.view') or public.can_read_all());
create policy "departments: manage" on public.departments for all to authenticated
  using (public.has_permission('admin.org.manage')) with check (public.has_permission('admin.org.manage'));

create policy "positions: read" on public.positions for select to authenticated
  using (public.has_permission('org.view') or public.can_read_all());
create policy "positions: manage" on public.positions for all to authenticated
  using (public.has_permission('admin.org.manage')) with check (public.has_permission('admin.org.manage'));

create policy "employees: read" on public.employees for select to authenticated
  using (public.has_permission('org.view') or public.can_read_all() or (id = public.current_employee_id() and public.is_active_profile()));
create policy "employees: manage" on public.employees for all to authenticated
  using (public.has_permission('employees.manage')) with check (public.has_permission('employees.manage'));

-- Academy teams: org admins (or Academy admins, as before) manage them.
drop policy "teams: owner write" on public.teams;
create policy "teams: manage" on public.teams for all to authenticated
  using (public.has_permission('admin.org.manage') or public.is_owner())
  with check (public.has_permission('admin.org.manage') or public.is_owner());
drop policy "team_managers: owner write" on public.team_managers;
create policy "team_managers: manage" on public.team_managers for all to authenticated
  using (public.has_permission('admin.org.manage') or public.is_owner())
  with check (public.has_permission('admin.org.manage') or public.is_owner());

-- ---------------------------------------------------------------- RBAC catalog
create policy "permissions: read" on public.permissions for select to authenticated using (public.is_active_profile());

create policy "roles: read" on public.roles for select to authenticated using (public.is_active_profile());
create policy "roles: manage" on public.roles for all to authenticated
  using (public.has_permission('admin.roles.manage')) with check (public.has_permission('admin.roles.manage'));

create policy "role_permissions: read" on public.role_permissions for select to authenticated
  using (public.has_permission('admin.users.view') or public.has_permission('admin.roles.manage') or public.can_read_all());
create policy "role_permissions: manage" on public.role_permissions for all to authenticated
  using (public.has_permission('admin.roles.manage')) with check (public.has_permission('admin.roles.manage'));

-- A user manager may grant a role only if they hold every permission in it (or can manage roles), and never to themself.
create or replace function public.can_grant_role(p_role uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and p_user <> auth.uid()
     and public.has_permission('admin.users.manage')
     and (
       public.has_permission('admin.roles.manage')
       or (
         not (select grants_all from public.roles where id = p_role)
         and not exists (
           select 1 from public.role_permissions rp
           where rp.role_id = p_role and not public.user_has_permission(auth.uid(), rp.permission_code)
         )
       )
     )
$$;
revoke execute on function public.can_grant_role from public, anon;
grant execute on function public.can_grant_role to authenticated, service_role;

create policy "user_roles: read" on public.user_roles for select to authenticated
  using ((user_id = auth.uid() and public.is_active_profile()) or public.has_permission('admin.users.view') or public.can_read_all());
create policy "user_roles: grant" on public.user_roles for insert to authenticated
  with check (public.can_grant_role(role_id, user_id) and granted_by = auth.uid());
create policy "user_roles: change" on public.user_roles for update to authenticated
  using (public.can_grant_role(role_id, user_id)) with check (public.can_grant_role(role_id, user_id));
create policy "user_roles: revoke" on public.user_roles for delete to authenticated
  using (public.can_grant_role(role_id, user_id));

-- ---------------------------------------------------------------- platform policies moved to permissions
drop policy "settings: read" on public.app_settings;
create policy "settings: read" on public.app_settings for select to authenticated using (public.is_active_profile());
drop policy "settings: owner update" on public.app_settings;
create policy "settings: update" on public.app_settings for update to authenticated
  using (public.has_permission('admin.settings.manage') or public.is_owner())
  with check (public.has_permission('admin.settings.manage') or public.is_owner());

drop policy "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated using (
  (id = auth.uid() and public.is_active_profile())
  or public.can_view_user(id)
  or public.is_my_manager(id)
  or public.has_permission('admin.users.view')
);
drop policy "profiles: update" on public.profiles;
create policy "profiles: update" on public.profiles for update to authenticated
  using ((id = auth.uid() and public.is_active_user()) or public.can_manage_user(id) or public.has_permission('admin.users.manage'))
  with check ((id = auth.uid() and public.is_active_user()) or public.can_manage_user(id) or public.has_permission('admin.users.manage'));

drop policy "audit: owner read" on public.audit_log;
create policy "audit: read" on public.audit_log for select to authenticated using (public.has_permission('audit.view'));
