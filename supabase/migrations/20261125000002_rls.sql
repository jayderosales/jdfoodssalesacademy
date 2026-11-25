-- Row Level Security. The UI only hides things; these policies decide what anyone can read or write.
-- Server code that must write grading results, AI usage, etc. uses the service-role key (bypasses RLS)
-- only after checking permissions itself.

-- ---------------------------------------------------------------- helpers
create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'owner', false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('owner', 'manager'), false)
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_role() is not null
$$;

-- true if the current user manages the team that `uid` belongs to
create or replace function public.manages_user(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles p
    join public.team_managers tm on tm.team_id = p.team_id
    join public.profiles me on me.id = tm.manager_id
    where p.id = uid and tm.manager_id = auth.uid() and me.status = 'active' and me.role in ('manager', 'owner')
  )
$$;

-- owner, the user themself, or their manager
create or replace function public.can_view_user(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (uid = auth.uid() and public.is_active_user()) or public.is_owner() or public.manages_user(uid)
$$;

create or replace function public.can_manage_user(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or public.manages_user(uid)
$$;

revoke execute on function public.app_role, public.is_owner, public.is_staff, public.is_active_user,
  public.manages_user, public.can_view_user, public.can_manage_user from public, anon;
grant execute on function public.app_role, public.is_owner, public.is_staff, public.is_active_user,
  public.manages_user, public.can_view_user, public.can_manage_user to authenticated, service_role;

-- ---------------------------------------------------------------- enable RLS everywhere
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- settings & org
create policy "settings: read" on public.app_settings for select to authenticated using (public.is_active_user());
create policy "settings: owner update" on public.app_settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "branches: read" on public.branches for select to authenticated using (public.is_active_user());
create policy "branches: owner write" on public.branches for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "teams: read" on public.teams for select to authenticated using (public.is_active_user());
create policy "teams: owner write" on public.teams for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "team_managers: read" on public.team_managers for select to authenticated using (public.is_active_user());
create policy "team_managers: owner write" on public.team_managers for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------- profiles
-- Reps may also see the managers of their own team (for "your manager" display).
-- (security definer helper avoids the policy querying profiles recursively)
create or replace function public.is_my_manager(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_managers tm
    join public.profiles me on me.id = auth.uid() and me.status = 'active'
    where tm.manager_id = uid and tm.team_id = me.team_id
  )
$$;
revoke execute on function public.is_my_manager from public, anon;
grant execute on function public.is_my_manager to authenticated, service_role;

create policy "profiles: read" on public.profiles for select to authenticated using (
  public.can_view_user(id) or public.is_my_manager(id)
);
-- Allowed rows: own row, owner, or a manager for their reps. Which COLUMNS may change is enforced by the trigger below.
-- Inactive users are blocked by can_view_user (it requires an active account).
create policy "profiles: update" on public.profiles for update to authenticated
  using (public.can_view_user(id)) with check (public.can_view_user(id));
-- No insert policy (rows come from the auth trigger) and no delete policy (people are deactivated, never deleted).

create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    return new; -- service role / migrations
  end if;

  if public.is_owner() then
    -- keep at least one active owner
    if old.role = 'owner' and (new.role <> 'owner' or new.status <> 'active')
       and (select count(*) from public.profiles where role = 'owner' and status = 'active' and id <> old.id) = 0 then
      raise exception 'There must be at least one active owner.';
    end if;
    if actor <> old.id and (new.consent_version is distinct from old.consent_version or new.consent_at is distinct from old.consent_at) then
      raise exception 'Only the employee can give consent.';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.team_id is distinct from old.team_id
     or new.status is distinct from old.status
     or new.email is distinct from old.email
     or new.exit_date is distinct from old.exit_date
     or new.exit_reason is distinct from old.exit_reason
     or new.exit_stage_level is distinct from old.exit_stage_level then
    raise exception 'Only the owner can change role, team, status or exit details.';
  end if;

  if actor <> old.id then
    -- a manager editing one of their reps: name and hire date only
    if new.consent_version is distinct from old.consent_version
       or new.consent_at is distinct from old.consent_at
       or new.last_active_at is distinct from old.last_active_at then
      raise exception 'Managers can only change a rep''s name and hire date.';
    end if;
  else
    -- editing yourself: name, consent, last active. Not hire date.
    if new.hire_date is distinct from old.hire_date then
      raise exception 'Only your manager or the owner can change your hire date.';
    end if;
  end if;
  return new;
end $$;

create trigger protect_profile_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------- learning content (read: published or staff; write: owner)
create policy "paths: read" on public.learning_paths for select to authenticated using (public.is_active_user() and (published or public.is_staff()));
create policy "paths: owner write" on public.learning_paths for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "modules: read" on public.modules for select to authenticated using (public.is_active_user());
create policy "modules: owner write" on public.modules for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "lessons: read" on public.lessons for select to authenticated using (public.is_active_user() and (published or public.is_staff()));
create policy "lessons: owner write" on public.lessons for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "lesson_assets: read" on public.lesson_assets for select to authenticated using (public.is_active_user());
create policy "lesson_assets: owner write" on public.lesson_assets for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "products: read" on public.products for select to authenticated using (public.is_active_user());
create policy "products: owner write" on public.products for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "levels: read" on public.levels for select to authenticated using (public.is_active_user());
create policy "levels: owner write" on public.levels for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "badges: read" on public.badges for select to authenticated using (public.is_active_user());
create policy "badges: owner write" on public.badges for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "rubrics: read" on public.rubrics for select to authenticated using (public.is_active_user());
create policy "rubrics: owner write" on public.rubrics for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "kpi_targets: read" on public.kpi_targets for select to authenticated using (public.is_active_user());
create policy "kpi_targets: owner write" on public.kpi_targets for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------- assignments & progress
create policy "assignments: read" on public.path_assignments for select to authenticated using (public.can_view_user(user_id));
create policy "assignments: manage" on public.path_assignments for all to authenticated
  using (public.can_manage_user(user_id)) with check (public.can_manage_user(user_id));

create policy "progress: read" on public.lesson_progress for select to authenticated using (public.can_view_user(user_id));
create policy "progress: own insert" on public.lesson_progress for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());
create policy "progress: own update" on public.lesson_progress for update to authenticated
  using (user_id = auth.uid() and public.is_active_user()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- quizzes
-- Questions (with answer keys) are staff-only. Reps receive questions from the server without answers.
create policy "quizzes: read" on public.quizzes for select to authenticated using (public.is_active_user() and (published or public.is_staff()));
create policy "quizzes: owner write" on public.quizzes for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "questions: staff read" on public.questions for select to authenticated using (public.is_staff());
create policy "questions: owner write" on public.questions for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- attempts and answers are written only by the server (grading)
create policy "attempts: read" on public.quiz_attempts for select to authenticated using (user_id is not null and public.can_view_user(user_id));
create policy "answers: read" on public.quiz_answers for select to authenticated using (
  exists (select 1 from public.quiz_attempts a where a.id = attempt_id and a.user_id is not null and public.can_view_user(a.user_id))
);

-- ---------------------------------------------------------------- roleplay
-- Personas include hidden needs, so the full scenario is staff-only; reps use the catalog view.
create policy "scenarios: staff read" on public.scenarios for select to authenticated using (public.is_staff());
create policy "scenarios: owner write" on public.scenarios for all to authenticated using (public.is_owner()) with check (public.is_owner());

create view public.scenario_catalog
with (security_invoker = false) as
  select s.id, s.title, s.goal, s.difficulty, s.language, s.max_turns, s.product_ids,
         s.persona->>'business_type' as business_type, s.persona->>'location' as location
  from public.scenarios s
  where s.active and not s.is_prehire and public.is_active_user();
revoke all on public.scenario_catalog from anon;
grant select on public.scenario_catalog to authenticated;

create policy "sessions: read" on public.roleplay_sessions for select to authenticated using (user_id is not null and public.can_view_user(user_id));
create policy "messages: read" on public.roleplay_messages for select to authenticated using (
  exists (select 1 from public.roleplay_sessions s where s.id = session_id and s.user_id is not null and public.can_view_user(s.user_id))
);
create policy "scores: read" on public.roleplay_scores for select to authenticated using (
  exists (select 1 from public.roleplay_sessions s where s.id = session_id and s.user_id is not null and public.can_view_user(s.user_id))
);
create policy "comments: read" on public.roleplay_comments for select to authenticated using (
  exists (select 1 from public.roleplay_sessions s where s.id = session_id and s.user_id is not null and public.can_view_user(s.user_id))
);
create policy "comments: staff insert" on public.roleplay_comments for insert to authenticated with check (
  author_id = auth.uid()
  and exists (select 1 from public.roleplay_sessions s where s.id = session_id and public.can_manage_user(s.user_id))
);

-- ---------------------------------------------------------------- assessment
create policy "level_history: read" on public.level_history for select to authenticated using (public.can_view_user(user_id));
create policy "signoffs: read" on public.level_signoffs for select to authenticated using (public.can_view_user(user_id));
create policy "signoffs: manager insert" on public.level_signoffs for insert to authenticated
  with check (manager_id = auth.uid() and user_id <> auth.uid() and public.can_manage_user(user_id));
create policy "snapshots: read" on public.skill_snapshots for select to authenticated using (public.can_view_user(user_id));
create policy "user_badges: read" on public.user_badges for select to authenticated using (public.can_view_user(user_id));

create policy "kpis: read" on public.field_kpis for select to authenticated using (public.can_view_user(user_id));
create policy "kpis: manage" on public.field_kpis for all to authenticated
  using (public.can_manage_user(user_id) and user_id <> auth.uid())
  with check (public.can_manage_user(user_id) and user_id <> auth.uid() and entered_by = auth.uid());

-- ---------------------------------------------------------------- system
create policy "notifications: own read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications: own mark read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ai_usage: read" on public.ai_usage for select to authenticated using (public.is_owner() or user_id = auth.uid());

create policy "audit: owner read" on public.audit_log for select to authenticated using (public.is_owner());

create policy "prehire: staff read" on public.prehire_invites for select to authenticated using (public.is_staff());
create policy "prehire: staff insert" on public.prehire_invites for insert to authenticated with check (public.is_staff() and created_by = auth.uid());
create policy "prehire: owner or creator update" on public.prehire_invites for update to authenticated
  using (public.is_owner() or created_by = auth.uid()) with check (public.is_owner() or created_by = auth.uid());

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public) values ('content', 'content', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('branding', 'branding', true) on conflict do nothing;

create policy "content: read" on storage.objects for select to authenticated using (bucket_id = 'content' and public.is_active_user());
create policy "content: owner insert" on storage.objects for insert to authenticated with check (bucket_id in ('content', 'branding') and public.is_owner());
create policy "content: owner update" on storage.objects for update to authenticated using (bucket_id in ('content', 'branding') and public.is_owner());
create policy "content: owner delete" on storage.objects for delete to authenticated using (bucket_id in ('content', 'branding') and public.is_owner());
