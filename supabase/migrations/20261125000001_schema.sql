-- JD Foods Sales Academy — core schema (all phases).
-- The whole schema is created in Phase 1 so later phases add features, not breaking changes.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.user_role as enum ('owner', 'manager', 'rep');
create type public.user_status as enum ('active', 'inactive');
create type public.question_type as enum ('mcq', 'multi', 'tf', 'short', 'scenario');
create type public.content_status as enum ('draft', 'approved', 'archived');
create type public.quiz_kind as enum ('module', 'certification', 'prehire');
create type public.difficulty as enum ('easy', 'medium', 'hard');
create type public.roleplay_language as enum ('en', 'taglish');
create type public.roleplay_status as enum ('active', 'ended', 'graded', 'abandoned');
create type public.score_source as enum ('ai', 'manager');
create type public.progress_status as enum ('not_started', 'in_progress', 'completed');

-- ---------------------------------------------------------------- settings
create table public.app_settings (
  id boolean primary key default true check (id), -- single row
  company_name text not null default 'JD Foods',
  brand_primary text not null default '#c8102e',
  brand_secondary text not null default '#f26b1d',
  brand_accent text not null default '#ffc72c',
  logo_path text,
  -- skill score weights (percent, should sum to 100)
  weight_quiz int not null default 30,
  weight_roleplay int not null default 45,
  weight_kpi int not null default 25,
  daily_roleplay_limit int not null default 10,
  monthly_ai_budget_usd numeric(10,2), -- null = no hard stop
  at_risk_inactive_days int not null default 3,
  at_risk_failed_attempts int not null default 3,
  onboarding_target_days int not null default 30,
  consent_version text not null default 'v1',
  consent_text text not null default '',
  dpo_contact text not null default 'TODO: name and email of JD Foods data protection officer',
  data_retention_years int not null default 3,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- people
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (branch_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'rep',
  team_id uuid references public.teams(id) on delete set null,
  hire_date date,
  status public.user_status not null default 'active',
  exit_date date,
  exit_reason text,
  exit_stage_level int, -- level at time of exit (turnover analytics)
  consent_version text,
  consent_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.profiles (team_id);
create index on public.profiles (role, status);

create table public.team_managers (
  team_id uuid not null references public.teams(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, manager_id)
);
create index on public.team_managers (manager_id);

-- ---------------------------------------------------------------- learning content
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  is_default boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  title text not null,
  description text not null default '',
  sort int not null default 0,
  sequential_unlock boolean not null default true,
  -- which skill-radar axis / level requirement group this module feeds
  category text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.modules (path_id, sort);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null,
  content_json jsonb,
  content_html text not null default '',
  video_url text,
  est_minutes int not null default 5,
  sort int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.lessons (module_id, sort);

create table public.lesson_assets (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('pdf', 'image', 'file')),
  label text not null default '',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  line text not null default '',
  name text not null,
  category text not null default '',
  sizes jsonb not null default '[]',
  price_php numeric(12,2),
  ingredients text not null default 'TODO',
  allergens text not null default 'TODO',
  shelf_life text not null default 'TODO',
  storage text not null default 'TODO',
  use_cases text not null default 'TODO',
  recipes text not null default 'TODO',
  target_customers text not null default 'TODO',
  selling_points text not null default 'TODO',
  competitor_notes text not null default 'TODO',
  faqs jsonb not null default '[]',
  verified boolean not null default false, -- false = placeholder data, admin must verify
  lesson_id uuid references public.lessons(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.path_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  due_date date,
  assigned_at timestamptz not null default now(),
  primary key (user_id, path_id)
);

create table public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  status public.progress_status not null default 'in_progress',
  time_spent_sec int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

-- ---------------------------------------------------------------- quizzes
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references public.modules(id) on delete set null,
  kind public.quiz_kind not null default 'module',
  title text not null,
  pass_pct int not null default 80,
  max_attempts int, -- null = unlimited
  cooldown_hours int not null default 0,
  questions_per_attempt int not null default 10,
  shuffle boolean not null default true,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  type public.question_type not null,
  prompt text not null,
  options jsonb not null default '[]',   -- [{id, text}]
  correct jsonb,                          -- option ids / boolean
  model_answer text,                      -- for short / scenario (AI-graded)
  explanation text not null default '',
  competency_tag text,
  difficulty public.difficulty not null default 'easy',
  status public.content_status not null default 'draft',
  source text not null default 'manual' check (source in ('manual', 'ai')),
  prompt_version text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.questions (quiz_id, status);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade, -- null for pre-hire candidates
  prehire_invite_id uuid,
  question_order jsonb not null default '[]',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score_pct numeric(5,2),
  passed boolean
);
create index on public.quiz_attempts (user_id, quiz_id, started_at desc);

create table public.quiz_answers (
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  response jsonb,
  is_correct boolean,
  points numeric(5,2) not null default 0,
  ai_feedback text,
  primary key (attempt_id, question_id)
);

-- ---------------------------------------------------------------- roleplay
create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1,
  criteria jsonb not null, -- [{key, label, description, weight}]
  created_at timestamptz not null default now()
);

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  persona jsonb not null, -- name, business_type, location, personality, budget, current_supplier, hidden_needs, objections
  product_ids uuid[] not null default '{}',
  goal text not null,
  difficulty public.difficulty not null default 'easy',
  language public.roleplay_language not null default 'taglish',
  max_turns int not null default 16,
  rubric_id uuid references public.rubrics(id) on delete set null,
  is_prehire boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roleplay_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade, -- null for pre-hire candidates
  prehire_invite_id uuid,
  scenario_id uuid not null references public.scenarios(id) on delete restrict,
  status public.roleplay_status not null default 'active',
  turns int not null default 0,
  end_reason text,
  customer_prompt_version text,
  model text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index on public.roleplay_sessions (user_id, started_at desc);

create table public.roleplay_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.roleplay_sessions(id) on delete cascade,
  seq int not null,
  role text not null check (role in ('rep', 'customer')),
  content text not null,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create table public.roleplay_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.roleplay_sessions(id) on delete cascade,
  source public.score_source not null,
  scores jsonb not null,          -- {opening: 1-5, discovery: ..., ...}
  overall numeric(5,2) not null,  -- 0-100
  goal_achieved boolean not null default false,
  strengths jsonb not null default '[]',
  improvements jsonb not null default '[]',
  factual_errors jsonb not null default '[]',
  grader_prompt_version text,
  model text,
  reason text,                    -- manager override reason
  is_current boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.roleplay_scores (session_id) where is_current;

create table public.roleplay_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.roleplay_sessions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- assessment
create table public.levels (
  level int primary key check (level between 0 and 9),
  name text not null,
  description text not null default '',
  requirements jsonb not null default '{}',
  requires_signoff boolean not null default false
);

create table public.level_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level int not null references public.levels(level),
  via text not null default 'auto',
  achieved_at timestamptz not null default now()
);
create index on public.level_history (user_id, achieved_at desc);

create table public.level_signoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level int not null references public.levels(level),
  manager_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, level)
);

create table public.skill_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  computed_at timestamptz not null default now(),
  skill_score numeric(5,2) not null,
  components jsonb not null default '{}',
  radar jsonb not null default '{}',
  current_level int not null default 0,
  at_risk boolean not null default false,
  at_risk_reasons jsonb not null default '[]'
);
create index on public.skill_snapshots (user_id, computed_at desc);

create table public.kpi_targets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade, -- null = company default
  metric text not null check (metric in ('visits', 'new_accounts', 'sales_php', 'reorder_rate', 'collection_rate')),
  monthly_target numeric(14,2) not null,
  unique nulls not distinct (team_id, metric)
);

create table public.field_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  visits int,
  new_accounts int,
  sales_php numeric(14,2),
  reorder_rate numeric(5,2),
  collection_rate numeric(5,2),
  source text not null default 'manual' check (source in ('manual', 'csv')),
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_month)
);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  icon text not null default 'award'
);

create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- ---------------------------------------------------------------- system
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  feature text not null, -- roleplay_customer | roleplay_grade | quiz_grade | quiz_generate
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index on public.ai_usage (created_at);
create index on public.ai_usage (user_id, created_at);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index on public.audit_log (at desc);
create index on public.audit_log (entity, entity_id);

create table public.prehire_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  candidate_name text not null,
  candidate_email text,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  consent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.quiz_attempts
  add constraint quiz_attempts_prehire_fk foreign key (prehire_invite_id) references public.prehire_invites(id) on delete cascade;
alter table public.roleplay_sessions
  add constraint roleplay_sessions_prehire_fk foreign key (prehire_invite_id) references public.prehire_invites(id) on delete cascade;

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['app_settings','profiles','learning_paths','modules','lessons','products',
                           'quizzes','questions','scenarios','field_kpis']
  loop
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- new auth user -> profile
-- Role comes from app_metadata (set only by the server with the service key), never user_metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
