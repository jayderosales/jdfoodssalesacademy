-- Phase 3: AI roleplay.

-- What the rep sees before starting (the persona itself stays hidden), and an optional fixed first
-- line from the customer (e.g. an angry customer calling in). No AI call is needed for that line.
alter table public.scenarios add column briefing text not null default '';
alter table public.scenarios add column customer_opening text;

-- Manager review tracking.
alter table public.roleplay_sessions add column reviewed_at timestamptz;
alter table public.roleplay_sessions add column reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.roleplay_sessions add column last_activity_at timestamptz not null default now();

-- Overall feedback sentence from the grader (manager overrides use `reason`).
alter table public.roleplay_scores add column summary text not null default '';

create index on public.roleplay_sessions (scenario_id);
create index on public.roleplay_sessions (status, reviewed_at);

-- The rep-facing catalog now includes the briefing (still no hidden persona fields).
drop view public.scenario_catalog;
create view public.scenario_catalog
with (security_invoker = false) as
  select s.id, s.title, s.briefing, s.goal, s.difficulty, s.language, s.max_turns, s.product_ids,
         s.persona->>'business_type' as business_type, s.persona->>'location' as location
  from public.scenarios s
  where s.active and not s.is_prehire and public.is_active_user();
revoke all on public.scenario_catalog from anon;
grant select on public.scenario_catalog to authenticated;
