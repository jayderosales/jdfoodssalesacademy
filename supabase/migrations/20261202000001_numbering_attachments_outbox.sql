-- Phase 1b (part 1): document numbering, attachments, domain-event outbox.

-- ================================================================ document numbering
-- Numbers are allocated inside the caller's transaction with a row lock, so a rolled-back document never uses up a
-- number: every series is gapless. Only other database functions call next_document_number (not the API), so a
-- number can't be "burned" by calling it directly.
create table public.number_series (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id),
  doc_type text not null check (doc_type ~ '^[a-z_]+$'),
  label text not null,
  prefix text not null check (prefix ~ '^[A-Z0-9-]{1,10}$'),
  padding int not null default 5 check (padding between 3 and 10),
  year_reset boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, doc_type)
);
create table public.number_counters (
  series_id uuid not null references public.number_series(id) on delete cascade,
  year int not null, -- 0 when the series doesn't reset yearly
  next_value bigint not null default 1 check (next_value > 0),
  primary key (series_id, year)
);
alter table public.number_series enable row level security;
alter table public.number_counters enable row level security;
create trigger touch_number_series before update on public.number_series for each row execute function public.touch_updated_at();

create policy "number_series: read" on public.number_series for select to authenticated using (public.is_active_user());
create policy "number_series: manage" on public.number_series for update to authenticated
  using (public.has_permission('admin.settings.manage')) with check (public.has_permission('admin.settings.manage'));
create policy "number_counters: read" on public.number_counters for select to authenticated using (public.is_active_user());

create or replace function public.format_document_number(p_prefix text, p_year int, p_value bigint, p_padding int)
returns text language sql immutable as $$
  select p_prefix || '-' || case when p_year > 0 then p_year::text || '-' else '' end || lpad(p_value::text, p_padding, '0')
$$;

create or replace function public.next_document_number(p_doc_type text, p_date date default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  s public.number_series;
  y int;
  v bigint;
begin
  select * into s from public.number_series
  where doc_type = p_doc_type and active
  order by created_at limit 1;
  if s.id is null then
    raise exception 'No active number series for %.', p_doc_type;
  end if;
  y := case when s.year_reset then extract(year from coalesce(p_date, public.manila_today()))::int else 0 end;
  insert into public.number_counters (series_id, year) values (s.id, y) on conflict do nothing;
  update public.number_counters set next_value = next_value + 1
  where series_id = s.id and year = y
  returning next_value - 1 into v;
  return public.format_document_number(s.prefix, y, v, s.padding);
end $$;
revoke execute on function public.next_document_number from public, anon, authenticated;

insert into public.number_series (entity_id, doc_type, label, prefix)
select e.id, x.doc_type, x.label, x.prefix
from public.entities e
cross join (values ('approval_request', 'Approval request', 'APR'),
                   ('petty_cash_request', 'Petty cash request', 'PCR')) as x(doc_type, label, prefix)
where e.code = 'JDF'
on conflict do nothing;

-- ================================================================ attachments
-- A file can be attached to a record in any table that registers a "can the current user see this record?" function
-- in attachment_sources. Access to the file follows access to the record.
create table public.attachment_sources (
  record_table text primary key,
  can_view_function text not null, -- public.<fn>(uuid) returns boolean, security definer
  can_attach_function text not null
);
alter table public.attachment_sources enable row level security;
create policy "attachment_sources: read" on public.attachment_sources for select to authenticated using (public.is_active_profile());

create or replace function public.can_access_record(p_table text, p_id uuid, p_for_write boolean default false)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  fn text;
  ok boolean;
begin
  select case when p_for_write then can_attach_function else can_view_function end into fn
  from public.attachment_sources where record_table = p_table;
  if fn is null then return false; end if;
  execute format('select public.%I($1)', fn) into ok using p_id;
  return coalesce(ok, false);
end $$;
revoke execute on function public.can_access_record from public, anon;
grant execute on function public.can_access_record to authenticated, service_role;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  record_table text not null references public.attachment_sources(record_table),
  record_id uuid not null,
  storage_path text not null unique,
  filename text not null check (length(filename) between 1 and 200),
  mime_type text not null default '',
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  description text not null default '',
  uploaded_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.attachments (record_table, record_id);
create index on public.attachments (uploaded_by);
alter table public.attachments enable row level security;

create policy "attachments: read" on public.attachments for select to authenticated
  using (public.can_access_record(record_table, record_id) or public.can_read_all());
create policy "attachments: add" on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_access_record(record_table, record_id, true)
              and storage_path like record_table || '/' || record_id::text || '/%');
create policy "attachments: remove own" on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() and public.can_access_record(record_table, record_id, true));

-- Storage bucket (private). Size and type limits are also enforced by Storage where the columns exist.
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict do nothing;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 20971520,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf','text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']
      where id = 'attachments'$q$;
  end if;
end $$;

-- Path: {record_table}/{record_id}/{uuid}-{filename}
create policy "attachments bucket: read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and exists (select 1 from public.attachments a where a.storage_path = name));
create policy "attachments bucket: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments'
              and public.can_access_record(split_part(name, '/', 1), nullif(split_part(name, '/', 2), '')::uuid, true));
create policy "attachments bucket: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and owner_id = auth.uid()::text);

-- ================================================================ domain events outbox
-- Business functions call emit_event() in the same transaction as the change. An AFTER INSERT trigger tries to handle
-- the event right away (in a sub-transaction, so a handler bug never blocks the business change); anything that fails
-- is retried by process_domain_events() (pg_cron every minute) with back-off, and parked as 'dead' after 8 tries.
create table public.domain_events (
  id bigint generated always as identity primary key,
  type text not null,
  aggregate_table text not null default '',
  aggregate_id text not null default '',
  payload jsonb not null default '{}',
  actor_id uuid default auth.uid(),
  status text not null default 'pending' check (status in ('pending', 'done', 'dead')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text not null default '',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index domain_events_pending_idx on public.domain_events (next_attempt_at) where status = 'pending';
create index on public.domain_events (aggregate_table, aggregate_id);
create index on public.domain_events (type, created_at desc);
alter table public.domain_events enable row level security;
create policy "domain_events: admin read" on public.domain_events for select to authenticated
  using (public.has_permission('admin.settings.manage') or public.has_permission('audit.view'));

create or replace function public.emit_event(p_type text, p_table text, p_id text, p_payload jsonb default '{}')
returns bigint
language sql security definer set search_path = public as $$
  insert into public.domain_events (type, aggregate_table, aggregate_id, payload)
  values (p_type, coalesce(p_table, ''), coalesce(p_id, ''), coalesce(p_payload, '{}'))
  returning id
$$;
revoke execute on function public.emit_event from public, anon, authenticated;

-- Placeholder; replaced in the notifications migration with the real dispatcher.
create or replace function public.handle_domain_event(e public.domain_events) returns void
language plpgsql security definer set search_path = public as $$
begin
  null;
end $$;

create or replace function public.try_handle_event(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  e public.domain_events;
begin
  select * into e from public.domain_events where id = p_id and status = 'pending' for update skip locked;
  if e.id is null then return; end if;
  begin
    perform public.handle_domain_event(e);
    update public.domain_events set status = 'done', processed_at = now(), attempts = attempts + 1, last_error = '' where id = p_id;
  exception when others then
    update public.domain_events
      set attempts = attempts + 1,
          last_error = left(sqlerrm, 500),
          status = case when attempts + 1 >= 8 then 'dead' else 'pending' end,
          next_attempt_at = now() + make_interval(mins => least(60, power(2, attempts + 1)::int))
    where id = p_id;
  end;
end $$;

create or replace function public.on_domain_event_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.try_handle_event(new.id);
  return null;
end $$;
create trigger handle_domain_event_now after insert on public.domain_events
  for each row execute function public.on_domain_event_insert();

create or replace function public.process_domain_events(p_limit int default 200) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.domain_events where status = 'pending' and next_attempt_at <= now() order by id limit p_limit loop
    perform public.try_handle_event(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Admin "Retry" on a dead event.
create or replace function public.retry_domain_event(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('admin.settings.manage') then
    raise exception 'You don''t have permission to retry events.';
  end if;
  update public.domain_events set status = 'pending', attempts = 0, next_attempt_at = now() where id = p_id and status = 'dead';
  perform public.try_handle_event(p_id);
end $$;

revoke execute on function public.handle_domain_event, public.try_handle_event, public.on_domain_event_insert,
  public.process_domain_events from public, anon, authenticated;
revoke execute on function public.retry_domain_event from public, anon;
grant execute on function public.retry_domain_event to authenticated;

-- ================================================================ audit registration
select public.enable_audit('number_series');
select public.enable_audit('attachments');
insert into public.audit_exempt (table_name, reason) values
  ('number_counters', 'Counter values; every document stores its own number.'),
  ('attachment_sources', 'Configuration, changed only by migrations.'),
  ('domain_events', 'The event log is itself a record of changes.')
on conflict do nothing;
