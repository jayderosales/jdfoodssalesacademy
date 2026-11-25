-- A roleplay can have only one current score. Prevents two simultaneous grading runs (e.g. the rep taps
-- "End & get feedback" just as the customer ends the chat) from leaving two "current" scores.
-- Keep only the newest current score per session before adding the rule.
update public.roleplay_scores s set is_current = false
where s.is_current and exists (
  select 1 from public.roleplay_scores n
  where n.session_id = s.session_id and n.is_current and n.created_at > s.created_at
);
create unique index roleplay_scores_one_current on public.roleplay_scores (session_id) where is_current;

-- Grading claim: only one grading run per session at a time (a stuck run can be retried after 2 minutes).
alter table public.roleplay_sessions add column grading_started_at timestamptz;
