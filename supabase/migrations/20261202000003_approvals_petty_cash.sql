-- Phase 1b (part 3): approval engine (CLAUDE.md §7.5), delegation, petty cash requests (reference document),
-- saved table views and import jobs.

-- ================================================================ permissions
insert into public.permissions (code, module, description, is_restricted) values
  ('approvals.view_all',     'approvals', 'See every approval request (not only your own or those assigned to you)', false),
  ('admin.approvals.manage', 'admin',     'Edit approval policies (who approves what, by amount)', false),
  ('petty_cash.request',     'finance',   'Create and submit petty cash requests', false),
  ('petty_cash.view_all',    'finance',   'See all petty cash requests', false)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'petty_cash.request' from public.roles r where r.is_internal and not r.grants_all
on conflict do nothing;
insert into public.role_permissions (role_id, permission_code)
select r.id, x.perm
from (values ('cfo', 'petty_cash.view_all'), ('cfo', 'approvals.view_all'), ('accounting_officer', 'petty_cash.view_all'),
             ('operations_manager', 'petty_cash.view_all'), ('auditor', 'approvals.view_all')) as x(role_code, perm)
join public.roles r on r.code = x.role_code
on conflict do nothing;

-- ================================================================ document types that can be approved
create table public.approval_doc_types (
  doc_type text primary key,
  label text not null,
  record_table text not null,
  href_template text not null -- e.g. /finance/petty-cash/{{id}}
);
alter table public.approval_doc_types enable row level security;
create policy "approval_doc_types: read" on public.approval_doc_types for select to authenticated using (public.is_active_user());

-- ================================================================ policies
create table public.approval_policies (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null references public.approval_doc_types(doc_type),
  name text not null,
  min_amount numeric(18, 2), -- null = no lower bound (inclusive)
  max_amount numeric(18, 2), -- null = no upper bound (inclusive)
  priority int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint amount_range check (min_amount is null or max_amount is null or max_amount >= min_amount)
);
create table public.approval_policy_steps (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.approval_policies(id) on delete cascade,
  step_no int not null check (step_no between 1 and 10),
  approver_type text not null check (approver_type in ('role', 'supervisor', 'department_head', 'user')),
  role_id uuid references public.roles(id),
  user_id uuid references public.profiles(id),
  unique (policy_id, step_no),
  constraint approver_target check (
    (approver_type = 'role' and role_id is not null) or (approver_type = 'user' and user_id is not null)
    or approver_type in ('supervisor', 'department_head'))
);
create index on public.approval_policies (doc_type, active);
alter table public.approval_policies enable row level security;
alter table public.approval_policy_steps enable row level security;
create trigger touch_approval_policies before update on public.approval_policies for each row execute function public.touch_updated_at();
create policy "approval_policies: read" on public.approval_policies for select to authenticated using (public.is_active_user());
create policy "approval_policies: manage" on public.approval_policies for all to authenticated
  using (public.has_permission('admin.approvals.manage')) with check (public.has_permission('admin.approvals.manage'));
create policy "approval_policy_steps: read" on public.approval_policy_steps for select to authenticated using (public.is_active_user());
create policy "approval_policy_steps: manage" on public.approval_policy_steps for all to authenticated
  using (public.has_permission('admin.approvals.manage')) with check (public.has_permission('admin.approvals.manage'));

-- ================================================================ requests and steps
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  doc_type text not null references public.approval_doc_types(doc_type),
  record_id uuid not null,
  title text not null,
  amount numeric(18, 2),
  requested_by uuid not null references public.profiles(id),
  policy_id uuid references public.approval_policies(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'returned', 'cancelled')),
  current_step int not null default 1,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on public.approval_requests (doc_type, record_id);
create index on public.approval_requests (requested_by, submitted_at desc);
create index approval_requests_pending_idx on public.approval_requests (status) where status = 'pending';

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.approval_requests(id) on delete cascade,
  step_no int not null,
  label text not null default '',
  approver_ids uuid[] not null,
  status text not null default 'waiting' check (status in ('waiting', 'pending', 'approved', 'rejected', 'returned', 'cancelled')),
  assigned_at timestamptz,
  acted_by uuid references public.profiles(id),
  acted_on_behalf_of uuid references public.profiles(id),
  acted_at timestamptz,
  comment text not null default '',
  unique (request_id, step_no)
);
create index approval_steps_approvers_idx on public.approval_steps using gin (approver_ids);
create index approval_steps_pending_idx on public.approval_steps (assigned_at) where status = 'pending';

create table public.approval_delegations (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint not_self check (from_user <> to_user),
  constraint dates check (ends_on >= starts_on)
);
create index on public.approval_delegations (to_user, starts_on, ends_on);
create index on public.approval_delegations (from_user);

alter table public.approval_requests enable row level security;
alter table public.approval_steps enable row level security;
alter table public.approval_delegations enable row level security;

-- Me plus everyone who has delegated their approvals to me today.
create or replace function public.my_approver_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select array[auth.uid()] || coalesce((
    select array_agg(d.from_user) from public.approval_delegations d
    where d.to_user = auth.uid() and public.manila_today() between d.starts_on and d.ends_on
  ), array[]::uuid[])
$$;
-- Delegation check: the delegate must be an active staff account (reveals nothing else about them).
create or replace function public.is_active_staff(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_user and status = 'active') and public.user_is_internal(p_user)
$$;
revoke execute on function public.is_active_staff from public, anon;
grant execute on function public.is_active_staff to authenticated;

revoke execute on function public.my_approver_ids from public, anon;
grant execute on function public.my_approver_ids to authenticated;

create or replace function public.can_see_approval(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and (
    exists (select 1 from public.approval_requests r where r.id = p_request and r.requested_by = auth.uid())
    or exists (select 1 from public.approval_steps s where s.request_id = p_request and s.approver_ids && public.my_approver_ids())
    or public.has_permission('approvals.view_all') or public.can_read_all())
$$;
revoke execute on function public.can_see_approval from public, anon;
grant execute on function public.can_see_approval to authenticated;

create policy "approval_requests: read" on public.approval_requests for select to authenticated using (public.can_see_approval(id));
create policy "approval_steps: read" on public.approval_steps for select to authenticated using (public.can_see_approval(request_id));
-- No insert/update/delete policies: only the engine functions below change requests and steps.

create policy "approval_delegations: read" on public.approval_delegations for select to authenticated
  using ((from_user = auth.uid() or to_user = auth.uid()) and public.is_active_user()
         or public.has_permission('admin.approvals.manage') or public.can_read_all());
create policy "approval_delegations: own create" on public.approval_delegations for insert to authenticated
  with check (from_user = auth.uid() and public.is_active_user()
              and public.is_active_staff(to_user));
create policy "approval_delegations: own delete" on public.approval_delegations for delete to authenticated
  using (from_user = auth.uid() and public.is_active_user());

-- ================================================================ engine
create or replace function public.resolve_approvers(p_step public.approval_policy_steps, p_requester uuid) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare
  ids uuid[] := array[]::uuid[];
  rcode text;
begin
  if p_step.approver_type = 'role' then
    select code into rcode from public.roles where id = p_step.role_id;
    ids := public.users_with_role(rcode);
  elsif p_step.approver_type = 'user' then
    ids := array[p_step.user_id];
  elsif p_step.approver_type = 'supervisor' then
    ids := array_remove(array[public.supervisor_user_of(p_requester)], null);
  elsif p_step.approver_type = 'department_head' then
    select array_remove(array_agg(hp.id), null) into ids
    from public.profiles me
    join public.employees e on e.id = me.employee_id
    join public.departments d on d.id = e.department_id
    join public.profiles hp on hp.employee_id = d.head_employee_id and hp.status = 'active'
    where me.id = p_requester;
  end if;
  -- No self-approval: the requester is never one of their own approvers.
  return array_remove(coalesce(ids, array[]::uuid[]), p_requester);
end $$;
revoke execute on function public.resolve_approvers from public, anon, authenticated;

-- Set the source document's status. Source tables guard their status column so only the engine can do this.
create or replace function public.set_source_status(p_doc_type text, p_record uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  t text;
begin
  select record_table into t from public.approval_doc_types where doc_type = p_doc_type;
  perform set_config('app.approval_engine', 'on', true);
  execute format('update public.%I set status = $1 where id = $2', t) using p_status, p_record;
  perform set_config('app.approval_engine', 'off', true);
end $$;
revoke execute on function public.set_source_status from public, anon, authenticated;

create or replace function public.approval_href(p_doc_type text, p_record uuid) returns text
language sql stable security definer set search_path = public as $$
  select replace(href_template, '{{id}}', p_record::text) from public.approval_doc_types where doc_type = p_doc_type
$$;

-- Internal: called by each document's own submit function after it has checked the caller may submit.
create or replace function public.start_approval(p_doc_type text, p_record uuid, p_amount numeric, p_title text, p_requester uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pol public.approval_policies;
  st public.approval_policy_steps;
  req_id uuid;
  ids uuid[];
  n int := 0;
  first_ids uuid[];
  v_label text;
begin
  if exists (select 1 from public.approval_requests where doc_type = p_doc_type and record_id = p_record and status = 'pending') then
    raise exception 'This document is already waiting for approval.';
  end if;

  select * into pol from public.approval_policies
  where doc_type = p_doc_type and active
    and (min_amount is null or p_amount >= min_amount)
    and (max_amount is null or p_amount <= max_amount)
  order by priority, min_amount desc nulls last
  limit 1;
  if pol.id is null then
    raise exception 'No approval policy covers this amount. Ask an administrator to check Settings → Approval policies.';
  end if;

  insert into public.approval_requests (number, doc_type, record_id, title, amount, requested_by, policy_id)
  values (public.next_document_number('approval_request'), p_doc_type, p_record, p_title, p_amount, p_requester, pol.id)
  returning id into req_id;

  for st in select * from public.approval_policy_steps where policy_id = pol.id order by step_no loop
    n := n + 1;
    ids := public.resolve_approvers(st, p_requester);
    if cardinality(ids) = 0 then
      -- Nobody (else) holds this approval: send it up to the CEO, then to Super administrators.
      ids := array_remove(public.users_with_role('ceo'), p_requester);
      if cardinality(ids) = 0 then ids := array_remove(public.users_with_role('super_admin'), p_requester); end if;
      if cardinality(ids) = 0 then raise exception 'No one other than you can approve this. Ask an administrator to assign an approver.'; end if;
    end if;
    v_label := case st.approver_type
      when 'role' then (select name from public.roles where id = st.role_id)
      when 'supervisor' then 'Supervisor'
      when 'department_head' then 'Department head'
      else (select coalesce(nullif(full_name, ''), email) from public.profiles where id = st.user_id) end;
    insert into public.approval_steps (request_id, step_no, label, approver_ids, status, assigned_at)
    values (req_id, n, coalesce(v_label, ''), ids, case when n = 1 then 'pending' else 'waiting' end, case when n = 1 then now() end);
    if n = 1 then first_ids := ids; end if;
  end loop;
  if n = 0 then raise exception 'The approval policy "%" has no steps.', pol.name; end if;

  perform public.set_source_status(p_doc_type, p_record, 'submitted');
  perform public.emit_event('approval.assigned', 'approval_requests', req_id::text,
    jsonb_build_object('recipients', to_jsonb(public.with_delegates(first_ids)), 'title', p_title,
                       'href', '/approvals/' || req_id, 'requester', (select coalesce(nullif(full_name, ''), email) from public.profiles where id = p_requester)));
  return req_id;
end $$;

-- Approvers plus anyone they've delegated to today.
create or replace function public.with_delegates(p_ids uuid[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), array[]::uuid[]) from (
    select unnest(p_ids) x
    union
    select d.to_user from public.approval_delegations d
    where d.from_user = any (p_ids) and public.manila_today() between d.starts_on and d.ends_on
  ) s
$$;
revoke execute on function public.start_approval, public.with_delegates from public, anon, authenticated;

create or replace function public.act_on_approval(p_step uuid, p_action text, p_comment text default '')
returns text
language plpgsql security definer set search_path = public as $$
declare
  s public.approval_steps;
  r public.approval_requests;
  me uuid := auth.uid();
  on_behalf uuid;
  nxt public.approval_steps;
  v_comment text := trim(coalesce(p_comment, ''));
begin
  if p_action not in ('approve', 'reject', 'return') then raise exception 'Unknown action.'; end if;
  if not public.is_active_user() then raise exception 'Sign in again to continue.'; end if;
  select * into s from public.approval_steps where id = p_step for update;
  if s.id is null then raise exception 'Approval step not found.'; end if;
  select * into r from public.approval_requests where id = s.request_id for update;
  if r.status <> 'pending' or s.status <> 'pending' then raise exception 'This step is no longer waiting for a decision.'; end if;
  if r.requested_by = me then raise exception 'You can''t approve your own request.'; end if;

  if not me = any (s.approver_ids) then
    select d.from_user into on_behalf from public.approval_delegations d
    where d.to_user = me and d.from_user = any (s.approver_ids) and public.manila_today() between d.starts_on and d.ends_on
      and d.from_user <> r.requested_by
    limit 1;
    if on_behalf is null then raise exception 'You''re not an approver for this step.'; end if;
  end if;
  if p_action in ('reject', 'return') and length(v_comment) < 3 then
    raise exception 'Please add a comment explaining why.';
  end if;

  update public.approval_steps
    set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
        acted_by = me, acted_on_behalf_of = on_behalf, acted_at = now(), comment = v_comment
  where id = s.id;

  if p_action = 'approve' then
    select * into nxt from public.approval_steps where request_id = r.id and step_no = s.step_no + 1;
    if nxt.id is not null then
      update public.approval_steps set status = 'pending', assigned_at = now() where id = nxt.id;
      update public.approval_requests set current_step = nxt.step_no where id = r.id;
      perform public.emit_event('approval.assigned', 'approval_requests', r.id::text,
        jsonb_build_object('recipients', to_jsonb(public.with_delegates(nxt.approver_ids)), 'title', r.title,
                           'href', '/approvals/' || r.id, 'requester', (select coalesce(nullif(full_name, ''), email) from public.profiles where id = r.requested_by)));
      return 'next_step';
    end if;
    update public.approval_requests set status = 'approved', decided_at = now() where id = r.id;
    perform public.set_source_status(r.doc_type, r.record_id, 'approved');
  else
    update public.approval_steps set status = 'cancelled' where request_id = r.id and status = 'waiting';
    update public.approval_requests set status = case p_action when 'reject' then 'rejected' else 'returned' end, decided_at = now() where id = r.id;
    perform public.set_source_status(r.doc_type, r.record_id, case p_action when 'reject' then 'rejected' else 'returned' end);
  end if;

  update public.risk_alerts set resolved_at = now() where item_type = 'approval_step' and item_id = s.id::text and resolved_at is null;
  perform public.emit_event('approval.decided', 'approval_requests', r.id::text,
    jsonb_build_object('recipients', jsonb_build_array(r.requested_by), 'title', r.title,
                       'decision', case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned for changes' end,
                       'comment', v_comment, 'href', public.approval_href(r.doc_type, r.record_id),
                       'approver', (select coalesce(nullif(full_name, ''), email) from public.profiles where id = me)));
  return case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end;
end $$;
revoke execute on function public.act_on_approval from public, anon;
grant execute on function public.act_on_approval to authenticated;

create or replace function public.cancel_approval(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.approval_requests;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if r.id is null or r.requested_by <> auth.uid() then raise exception 'Only the person who submitted it can cancel it.'; end if;
  if r.status <> 'pending' then raise exception 'Only pending requests can be cancelled.'; end if;
  update public.approval_requests set status = 'cancelled', decided_at = now() where id = r.id;
  update public.approval_steps set status = 'cancelled' where request_id = r.id and status in ('waiting', 'pending');
  update public.risk_alerts set resolved_at = now()
  where item_type = 'approval_step' and resolved_at is null
    and item_id in (select id::text from public.approval_steps where request_id = r.id);
  perform public.set_source_status(r.doc_type, r.record_id, 'draft');
end $$;
revoke execute on function public.cancel_approval from public, anon;
grant execute on function public.cancel_approval to authenticated;

-- Escalation source: pending approval steps (owners = approvers, clock starts when the step was assigned).
create or replace view public.escalation_approval_steps with (security_invoker = false) as
  select s.id::text as item_id, s.approver_ids as owner_ids, s.assigned_at as started_at,
         r.number || ': ' || r.title as title, '/approvals/' || r.id as href
  from public.approval_steps s join public.approval_requests r on r.id = s.request_id
  where s.status = 'pending' and r.status = 'pending' and s.assigned_at is not null;
revoke all on public.escalation_approval_steps from public, anon, authenticated;

insert into public.escalation_sources (item_type, view_name, label) values ('approval_step', 'escalation_approval_steps', 'Approval waiting for a decision')
on conflict do nothing;
insert into public.escalation_rules (item_type, level, after_working_hours, target) values
  ('approval_step', 1, 24, 'supervisor'),
  ('approval_step', 2, 48, 'executive')
on conflict do nothing;

insert into public.notification_rules (event_type, label, title_template, body_template, href_template, email, mandatory) values
  ('approval.assigned', 'An approval is waiting for you', 'Approval needed: {{title}}', 'Submitted by {{requester}}.', '{{href}}', true, true),
  ('approval.decided', 'Your request was decided', 'Your request was {{decision}}: {{title}}', '{{approver}}: {{comment}}', '{{href}}', true, true)
on conflict do nothing;

-- ================================================================ petty cash requests (reference document)
create table public.petty_cash_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  entity_id uuid not null references public.entities(id),
  requested_by uuid not null default auth.uid() references public.profiles(id),
  department_id uuid references public.departments(id),
  amount numeric(18, 2) not null check (amount > 0 and amount <= 10000000),
  purpose text not null check (length(trim(purpose)) >= 3),
  needed_on date,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'returned', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.petty_cash_requests (requested_by, created_at desc);
create index on public.petty_cash_requests (status);
create index on public.petty_cash_requests (department_id);
alter table public.petty_cash_requests enable row level security;
create trigger touch_petty_cash_requests before update on public.petty_cash_requests for each row execute function public.touch_updated_at();

create or replace function public.petty_cash_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('petty_cash_request');
    new.entity_id := coalesce(new.entity_id, (select id from public.entities where active order by created_at limit 1));
    new.requested_by := coalesce(auth.uid(), new.requested_by);
    new.status := 'draft';
    return new;
  end if;
  if new.number <> old.number or new.requested_by <> old.requested_by or new.entity_id <> old.entity_id then
    raise exception 'Number, requester and company can''t be changed.';
  end if;
  if new.status is distinct from old.status
     and coalesce(current_setting('app.approval_engine', true), 'off') <> 'on'
     and not (old.status in ('draft', 'returned') and new.status = 'cancelled') then
    raise exception 'Status changes go through the approval process.';
  end if;
  if old.status not in ('draft', 'returned') and coalesce(current_setting('app.approval_engine', true), 'off') <> 'on'
     and (new.amount <> old.amount or new.purpose <> old.purpose or new.needed_on is distinct from old.needed_on
          or new.department_id is distinct from old.department_id) then
    raise exception 'A submitted request can''t be edited. Cancel it or ask the approver to return it.';
  end if;
  return new;
end $$;
create trigger petty_cash_before_write before insert or update on public.petty_cash_requests
  for each row execute function public.petty_cash_before_write();
revoke execute on function public.petty_cash_before_write from public, anon, authenticated;

create or replace function public.can_view_petty_cash_request(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (
    select 1 from public.petty_cash_requests p where p.id = p_id and (
      p.requested_by = auth.uid()
      or public.has_permission('petty_cash.view_all')
      or public.can_read_all()
      or exists (select 1 from public.approval_requests r join public.approval_steps s on s.request_id = r.id
                 where r.doc_type = 'petty_cash' and r.record_id = p.id and s.approver_ids && public.my_approver_ids())))
$$;
create or replace function public.can_attach_petty_cash_request(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (
    select 1 from public.petty_cash_requests p where p.id = p_id and p.requested_by = auth.uid() and p.status in ('draft', 'returned', 'submitted'))
$$;
revoke execute on function public.can_view_petty_cash_request, public.can_attach_petty_cash_request from public, anon;
grant execute on function public.can_view_petty_cash_request, public.can_attach_petty_cash_request to authenticated;

-- (requested_by check first: the row a user has just inserted isn't visible yet to the function's own lookup)
create policy "petty_cash: read" on public.petty_cash_requests for select to authenticated
  using ((requested_by = auth.uid() and public.is_active_user()) or public.can_view_petty_cash_request(id));
create policy "petty_cash: create" on public.petty_cash_requests for insert to authenticated
  with check (public.has_permission('petty_cash.request') and requested_by = auth.uid());
create policy "petty_cash: edit own draft" on public.petty_cash_requests for update to authenticated
  using (requested_by = auth.uid() and public.is_active_user() and status in ('draft', 'returned'))
  with check (requested_by = auth.uid());
create policy "petty_cash: delete own draft" on public.petty_cash_requests for delete to authenticated
  using (requested_by = auth.uid() and public.is_active_user() and status = 'draft');

create or replace function public.submit_petty_cash(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.petty_cash_requests;
begin
  select * into p from public.petty_cash_requests where id = p_id for update;
  if p.id is null or p.requested_by <> auth.uid() or not public.is_active_user() then
    raise exception 'Only the person who created this request can submit it.';
  end if;
  if not public.has_permission('petty_cash.request') then raise exception 'You don''t have permission to request petty cash.'; end if;
  if p.status not in ('draft', 'returned') then raise exception 'This request was already submitted.'; end if;
  return public.start_approval('petty_cash', p.id, p.amount,
    format('Petty cash ₱%s: %s', to_char(p.amount, 'FM999,999,990.00'), left(p.purpose, 80)), p.requested_by);
end $$;
revoke execute on function public.submit_petty_cash from public, anon;
grant execute on function public.submit_petty_cash to authenticated;

insert into public.approval_doc_types (doc_type, label, record_table, href_template)
values ('petty_cash', 'Petty cash request', 'petty_cash_requests', '/requests/petty-cash/{{id}}')
on conflict do nothing;
insert into public.attachment_sources (record_table, can_view_function, can_attach_function)
values ('petty_cash_requests', 'can_view_petty_cash_request', 'can_attach_petty_cash_request')
on conflict do nothing;

-- Owner-confirmed policies (2026-11-26): ≤ ₱50,000 → Operations manager; > ₱50,000 → CEO.
-- The tiered template (₱5k / ₱25k / ₱100k) is seeded inactive for when department heads are added.
do $$
declare
  p uuid;
  ops uuid := (select id from public.roles where code = 'operations_manager');
  ceo uuid := (select id from public.roles where code = 'ceo');
  coo uuid := (select id from public.roles where code = 'coo');
  cfo uuid := (select id from public.roles where code = 'cfo');
begin
  if exists (select 1 from public.approval_policies where doc_type = 'petty_cash') then return; end if;
  insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority) values ('petty_cash', 'Petty cash up to ₱50,000', null, 50000, 10) returning id into p;
  insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', ops);
  insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority) values ('petty_cash', 'Petty cash over ₱50,000', 50000.01, null, 10) returning id into p;
  insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', ceo);

  insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority, active) values ('petty_cash', 'Template: up to ₱5,000 (department head)', null, 5000, 50, false) returning id into p;
  insert into public.approval_policy_steps (policy_id, step_no, approver_type) values (p, 1, 'department_head');
  insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority, active) values ('petty_cash', 'Template: ₱5,001–25,000 (operations manager)', 5000.01, 25000, 50, false) returning id into p;
  insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', ops);
  insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority, active) values ('petty_cash', 'Template: ₱25,001–100,000 (finance head + executive)', 25000.01, 100000, 50, false) returning id into p;
  insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', cfo), (p, 2, 'role', coo);
  insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority, active) values ('petty_cash', 'Template: above ₱100,000 (CEO)', 100000.01, null, 50, false) returning id into p;
  insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', ceo);
end $$;

-- ================================================================ saved table views and import jobs
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  table_key text not null,
  name text not null check (length(name) between 1 and 60),
  query text not null default '', -- URL query string (filters, sort, columns)
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, table_key, name)
);
alter table public.saved_views enable row level security;
create policy "saved_views: read" on public.saved_views for select to authenticated
  using ((user_id = auth.uid() or shared) and public.is_active_user());
create policy "saved_views: own write" on public.saved_views for all to authenticated
  using (user_id = auth.uid() and public.is_active_user()) with check (user_id = auth.uid() and public.is_active_user());

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  template text not null,
  filename text not null,
  status text not null check (status in ('committed', 'failed')),
  total_rows int not null default 0,
  created_count int not null default 0,
  updated_count int not null default 0,
  error text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.import_jobs enable row level security;
create policy "import_jobs: read" on public.import_jobs for select to authenticated
  using (created_by = auth.uid() or public.has_permission('audit.view'));
create policy "import_jobs: own insert" on public.import_jobs for insert to authenticated
  with check (created_by = auth.uid() and public.is_active_user());

-- All-or-nothing importers (security invoker: RLS decides who may import). Rows: JSON array of objects.
create or replace function public.import_employees(p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  ent uuid := (select id from public.entities where active order by created_at limit 1);
  r jsonb;
  created int := 0;
  updated int := 0;
  existed boolean;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    existed := exists (select 1 from public.employees where entity_id = ent and employee_no = r->>'employee_no');
    insert into public.employees (entity_id, employee_no, full_name, work_email, phone, position_id, department_id, location_id, hire_date, status)
    values (ent, r->>'employee_no', r->>'full_name', nullif(lower(r->>'work_email'), ''), nullif(r->>'phone', ''),
            (select id from public.positions where lower(title) = lower(r->>'position') limit 1),
            (select id from public.departments where lower(name) = lower(r->>'department') or upper(code) = upper(r->>'department') limit 1),
            (select id from public.locations where lower(name) = lower(r->>'location') or upper(code) = upper(r->>'location') limit 1),
            nullif(r->>'hire_date', '')::date, coalesce(nullif(r->>'status', ''), 'active')::public.employee_status)
    on conflict (entity_id, employee_no) do update set
      full_name = excluded.full_name, work_email = excluded.work_email, phone = excluded.phone,
      position_id = coalesce(excluded.position_id, employees.position_id),
      department_id = coalesce(excluded.department_id, employees.department_id),
      location_id = coalesce(excluded.location_id, employees.location_id),
      hire_date = coalesce(excluded.hire_date, employees.hire_date), status = excluded.status;
    if existed then updated := updated + 1; else created := created + 1; end if;
  end loop;
  -- second pass: supervisors by employee number (they may appear later in the file)
  for r in select value from jsonb_array_elements(p_rows) where coalesce(value->>'supervisor_no', '') <> '' loop
    update public.employees set supervisor_id = (select id from public.employees where entity_id = ent and employee_no = r->>'supervisor_no')
    where entity_id = ent and employee_no = r->>'employee_no';
  end loop;
  return jsonb_build_object('created', created, 'updated', updated);
end $$;

create or replace function public.import_locations(p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  ent uuid := (select id from public.entities where active order by created_at limit 1);
  r jsonb;
  created int := 0;
  updated int := 0;
  existed boolean;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    existed := exists (select 1 from public.locations where entity_id = ent and code = upper(r->>'code'));
    insert into public.locations (entity_id, code, name, type, holds_inventory, is_pickup_point, address, city)
    values (ent, upper(r->>'code'), r->>'name', (r->>'type')::public.location_type, coalesce((r->>'holds_inventory')::boolean, false),
            coalesce((r->>'is_pickup_point')::boolean, false), coalesce(r->>'address', ''), coalesce(r->>'city', ''))
    on conflict (entity_id, code) do update set name = excluded.name, type = excluded.type, holds_inventory = excluded.holds_inventory,
      is_pickup_point = excluded.is_pickup_point, address = excluded.address, city = excluded.city;
    if existed then updated := updated + 1; else created := created + 1; end if;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated);
end $$;
grant execute on function public.import_employees, public.import_locations to authenticated;

-- ================================================================ audit registration
select public.enable_audit(t) from unnest(array['approval_policies', 'approval_policy_steps', 'approval_requests', 'approval_steps',
  'approval_delegations', 'petty_cash_requests']) as t;
insert into public.audit_exempt (table_name, reason) values
  ('approval_doc_types', 'Configuration, changed only by migrations.'),
  ('saved_views', 'Personal table layouts.'),
  ('import_jobs', 'The import log is itself a record; imported rows are audited individually.')
on conflict do nothing;

-- Display names for people shown on approvals, history and attachments (names only; staff callers only).
create or replace function public.people_names(p_ids uuid[]) returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email)
  from public.profiles p
  where p.id = any (p_ids) and public.is_active_user()
$$;
revoke execute on function public.people_names from public, anon;
grant execute on function public.people_names to authenticated;

-- Active staff a person can delegate approvals to (names only).
create or replace function public.delegation_candidates() returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email)
  from public.profiles p
  where public.is_active_user() and p.status = 'active' and p.id <> auth.uid() and public.user_is_internal(p.id)
  order by 2
$$;
revoke execute on function public.delegation_candidates from public, anon;
grant execute on function public.delegation_candidates to authenticated;
