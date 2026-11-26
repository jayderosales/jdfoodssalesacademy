-- Phase 1b (part 4): scheduled jobs (pg_cron). Skipped where pg_cron isn't available (e.g. the in-memory test database,
-- where tests call the same functions directly).
--   every minute     process_domain_events()  retries events whose immediate handling failed
--   every 15 minutes escalate_overdue()       escalation ladder (working hours)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('jdos-process-events', '* * * * *', 'select public.process_domain_events()');
    perform cron.schedule('jdos-escalate-overdue', '*/15 * * * *', 'select public.escalate_overdue()');
  end if;
end $$;
