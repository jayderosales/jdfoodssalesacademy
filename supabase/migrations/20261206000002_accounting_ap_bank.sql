-- Phase 5a (part 2): supplier payments (CEO approval, withholding tax), petty cash release, bank reconciliation,
-- and report functions (trial balance, VAT, AR/AP open items).

-- ================================================================ supplier payments
alter table public.suppliers
  add column ewt_rate numeric(5, 2) not null default 0 check (ewt_rate between 0 and 15), -- expanded withholding tax %, e.g. 1 goods / 2 services (needs verification)
  add column opening_balance numeric(18, 2) not null default 0;

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  supplier_id uuid not null references public.suppliers(id),
  pay_date date not null default public.manila_today(),
  account_id uuid not null references public.accounts(id), -- bank / cash account paid from
  method text not null default 'bank_transfer' check (method in ('bank_transfer', 'cheque', 'cash', 'gcash', 'maya', 'other')),
  reference text not null default '',
  gross numeric(18, 2) not null default 0, -- invoices settled
  ewt_amount numeric(18, 2) not null default 0,
  net_paid numeric(18, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'returned', 'cancelled', 'paid')),
  notes text not null default '',
  paid_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.supplier_payments (supplier_id, pay_date desc);
create index on public.supplier_payments (status);

create table public.supplier_payment_lines (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.supplier_payments(id) on delete cascade,
  invoice_id uuid not null references public.supplier_invoices(id),
  amount numeric(18, 2) not null check (amount > 0), -- part of the invoice total settled
  ewt_amount numeric(18, 2) not null default 0 check (ewt_amount >= 0),
  unique (payment_id, invoice_id)
);
create index on public.supplier_payment_lines (invoice_id);

create or replace function public.supplier_payment_line_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sp public.supplier_payments;
  inv public.supplier_invoices;
  committed numeric;
  sup public.suppliers;
begin
  select * into sp from public.supplier_payments where id = coalesce(new.payment_id, old.payment_id);
  if sp.status not in ('draft', 'returned') and coalesce(current_setting('app.ap_engine', true), 'off') <> 'on' then
    raise exception 'Payment lines can only change while the payment is a draft.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  select * into inv from public.supplier_invoices where id = new.invoice_id;
  if inv.supplier_id <> sp.supplier_id then raise exception 'That invoice is for another supplier.'; end if;
  if inv.status not in ('matched', 'approved') then raise exception 'Invoice % isn''t ready to pay (it must be matched or approved).', inv.invoice_no; end if;
  -- don't pay more than what's open, counting other payments in progress
  select coalesce(sum(l.amount), 0) into committed from public.supplier_payment_lines l join public.supplier_payments p on p.id = l.payment_id
  where l.invoice_id = new.invoice_id and l.id <> new.id and p.status in ('draft', 'submitted', 'approved', 'returned');
  if new.amount > inv.total - inv.paid_amount - committed then
    raise exception 'Only ₱% is still open on invoice % (including other payments being prepared).', inv.total - inv.paid_amount - committed, inv.invoice_no;
  end if;
  select * into sup from public.suppliers where id = sp.supplier_id;
  -- EWT on the amount without VAT, at the supplier's rate (needs verification)
  new.ewt_amount := round(new.amount * case when inv.total > 0 then inv.subtotal / inv.total else 1 end * sup.ewt_rate / 100, 2);
  return new;
end $$;
create trigger supplier_payment_line_before_write before insert or update or delete on public.supplier_payment_lines
  for each row execute function public.supplier_payment_line_before_write();

create or replace function public.recalc_supplier_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.payment_id, old.payment_id); g numeric; w numeric;
begin
  select coalesce(sum(amount), 0), coalesce(sum(ewt_amount), 0) into g, w from public.supplier_payment_lines where payment_id = pid;
  perform set_config('app.ap_engine', 'on', true);
  update public.supplier_payments set gross = g, ewt_amount = w, net_paid = g - w where id = pid;
  perform set_config('app.ap_engine', 'off', true);
  return null;
end $$;
create trigger recalc_supplier_payment after insert or update or delete on public.supplier_payment_lines
  for each row execute function public.recalc_supplier_payment();

create or replace function public.supplier_payment_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare engine boolean := coalesce(current_setting('app.ap_engine', true), 'off') = 'on' or coalesce(current_setting('app.approval_engine', true), 'off') = 'on';
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('supplier_payment');
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'draft';
    if (select subtype from public.accounts where id = new.account_id) not in ('bank', 'cash') then raise exception 'Pay from a bank or cash account.'; end if;
    return new;
  end if;
  new.updated_at := now();
  if new.status is distinct from old.status and not engine and not (old.status in ('draft', 'returned') and new.status = 'cancelled') then
    raise exception 'Use the payment buttons to change its status.';
  end if;
  if not engine and old.status not in ('draft', 'returned') and (new.gross, new.account_id, new.supplier_id) is distinct from (old.gross, old.account_id, old.supplier_id) then
    raise exception 'An approved payment can''t be edited.';
  end if;
  return new;
end $$;
create trigger supplier_payment_before_write before insert or update on public.supplier_payments for each row execute function public.supplier_payment_before_write();
revoke execute on function public.supplier_payment_line_before_write, public.recalc_supplier_payment, public.supplier_payment_before_write from public, anon, authenticated;

create or replace function public.submit_supplier_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare sp public.supplier_payments; sname text;
begin
  if not public.has_permission('ap.payments.create') then raise exception 'You can''t prepare supplier payments.'; end if;
  select * into sp from public.supplier_payments where id = p_id for update;
  if sp.status not in ('draft', 'returned') then raise exception 'This payment was already submitted.'; end if;
  if sp.gross <= 0 then raise exception 'Add the invoices to pay.'; end if;
  select name into sname from public.suppliers where id = sp.supplier_id;
  return public.start_approval('supplier_payment', p_id, sp.net_paid,
    format('Pay %s ₱%s (%s)', sname, to_char(sp.net_paid, 'FM999,999,990.00'), sp.number), auth.uid());
end $$;

-- After CEO approval, finance makes the transfer / writes the cheque, then records it here: posts AP / bank / EWT.
create or replace function public.mark_supplier_payment_paid(p_id uuid, p_reference text, p_pay_date date default null) returns void
language plpgsql security definer set search_path = public as $$
declare sp public.supplier_payments; sname text;
begin
  if not public.has_permission('ap.payments.create') then raise exception 'You can''t record supplier payments.'; end if;
  select * into sp from public.supplier_payments where id = p_id for update;
  if sp.status <> 'approved' then raise exception 'Only approved payments can be marked paid.'; end if;
  if sp.method in ('bank_transfer', 'cheque') and length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'Enter the transfer reference or cheque number.'; end if;
  perform set_config('app.ap_engine', 'on', true);
  update public.supplier_payments set status = 'paid', paid_at = now(), reference = trim(coalesce(p_reference, '')), pay_date = coalesce(p_pay_date, pay_date) where id = p_id;
  update public.supplier_invoices i set paid_amount = paid_amount + l.amount
  from public.supplier_payment_lines l where l.payment_id = p_id and l.invoice_id = i.id;
  perform set_config('app.ap_engine', 'off', true);
  select name into sname from public.suppliers where id = sp.supplier_id;
  perform public.emit_event('supplier_payment.paid', 'supplier_payments', p_id::text, jsonb_build_object('number', sp.number, 'supplier', sname));
end $$;

create or replace function public.cancel_supplier_payment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sp public.supplier_payments;
begin
  if not public.has_permission('ap.payments.create') then raise exception 'You can''t cancel supplier payments.'; end if;
  select * into sp from public.supplier_payments where id = p_id for update;
  if sp.status in ('paid', 'cancelled', 'rejected') then raise exception 'This payment can''t be cancelled.'; end if;
  if sp.status = 'submitted' then
    perform public.cancel_approval((select id from public.approval_requests where doc_type = 'supplier_payment' and record_id = p_id and status = 'pending' limit 1));
  end if;
  perform set_config('app.ap_engine', 'on', true);
  update public.supplier_payments set status = 'cancelled' where id = p_id;
  perform set_config('app.ap_engine', 'off', true);
end $$;

-- ================================================================ petty cash release
alter table public.petty_cash_requests
  add column expense_account_id uuid references public.accounts(id),
  add column released_at timestamptz,
  add column released_by uuid references public.profiles(id);

create or replace function public.release_petty_cash(p_id uuid, p_expense_account uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pc public.petty_cash_requests;
begin
  if not public.has_permission('accounting.journals.create') then raise exception 'Only accounting can release petty cash.'; end if;
  select * into pc from public.petty_cash_requests where id = p_id for update;
  if pc.status <> 'approved' then raise exception 'Only approved petty cash requests can be released.'; end if;
  if pc.released_at is not null then raise exception 'Already released.'; end if;
  if (select type from public.accounts where id = p_expense_account) <> 'expense' then raise exception 'Choose an expense account.'; end if;
  update public.petty_cash_requests set expense_account_id = p_expense_account, released_at = now(), released_by = auth.uid() where id = p_id;
  perform public.emit_event('petty_cash.released', 'petty_cash_requests', p_id::text, jsonb_build_object('number', pc.number, 'amount', pc.amount));
end $$;

-- ================================================================ posting rules for part 2 (extends post_event)
create or replace function public.post_event_part2(p_event bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e public.domain_events;
  sp public.supplier_payments;
  pc public.petty_cash_requests;
begin
  select * into e from public.domain_events where id = p_event;
  if e.type = 'supplier_payment.paid' then
    select * into sp from public.supplier_payments where id = e.aggregate_id::uuid;
    return public.post_journal(sp.pay_date, 'supplier_payment', 'supplier_payments', sp.id::text, 'Supplier payment ' || sp.number || ' ' || coalesce(e.payload->>'supplier', ''),
      jsonb_build_array(
        jsonb_build_object('account', 'ap', 'debit', sp.gross, 'supplier_id', sp.supplier_id, 'description', sp.number),
        jsonb_build_object('account', (select code from public.accounts where id = sp.account_id), 'credit', sp.net_paid, 'supplier_id', sp.supplier_id, 'description', sp.reference),
        jsonb_build_object('account', 'ewt_payable', 'credit', sp.ewt_amount, 'supplier_id', sp.supplier_id)), e.id);
  elsif e.type = 'petty_cash.released' then
    select * into pc from public.petty_cash_requests where id = e.aggregate_id::uuid;
    return public.post_journal((pc.released_at at time zone 'Asia/Manila')::date, 'petty_cash', 'petty_cash_requests', pc.id::text, 'Petty cash ' || pc.number || ': ' || left(pc.purpose, 80),
      jsonb_build_array(
        jsonb_build_object('account', (select code from public.accounts where id = pc.expense_account_id), 'debit', pc.amount, 'department_id', pc.department_id),
        jsonb_build_object('account', 'petty_cash', 'credit', pc.amount)), e.id);
  end if;
  return null;
end $$;
revoke execute on function public.post_event_part2 from public, anon, authenticated;

-- route the new event types (post_event handles the rest)
create or replace function public.post_event_safe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.type in ('supplier_payment.paid', 'petty_cash.released') then perform public.post_event_part2(new.id);
    else perform public.post_event(new.id); end if;
  exception when others then
    perform set_config('app.posting_engine', 'off', true);
    insert into public.unposted_events (event_id, event_type, error) values (new.id, new.type, sqlerrm)
    on conflict (event_id) do update set error = excluded.error, attempts = public.unposted_events.attempts + 1, last_attempt_at = now();
  end;
  return null;
end $$;
revoke execute on function public.post_event_safe from public, anon, authenticated;

create or replace function public.retry_unposted(p_event bigint default null) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if auth.uid() is not null and not public.has_permission('accounting.journals.create') then raise exception 'You can''t retry postings.'; end if;
  for r in select u.event_id, u.event_type from public.unposted_events u where u.resolved_at is null and (p_event is null or u.event_id = p_event) loop
    begin
      if r.event_type in ('supplier_payment.paid', 'petty_cash.released') then perform public.post_event_part2(r.event_id);
      else perform public.post_event(r.event_id); end if;
      update public.unposted_events set resolved_at = now() where event_id = r.event_id;
      n := n + 1;
    exception when others then
      perform set_config('app.posting_engine', 'off', true);
      update public.unposted_events set error = sqlerrm, attempts = attempts + 1, last_attempt_at = now() where event_id = r.event_id;
    end;
  end loop;
  return n;
end $$;

-- ================================================================ bank reconciliation
create table public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  txn_date date not null,
  description text not null default '',
  reference text not null default '',
  amount numeric(18, 2) not null check (amount <> 0), -- money in positive, money out negative
  journal_line_id uuid unique references public.journal_lines(id),
  matched_by uuid references public.profiles(id),
  matched_at timestamptz,
  import_batch uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (account_id, txn_date, amount, reference, description)
);
create index on public.bank_statement_lines (account_id, txn_date);

-- Auto-match: same amount on the same account within ±3 days, one-to-one, closest date first.
create or replace function public.bank_auto_match(p_account uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s record; jl uuid; n int := 0;
begin
  if not public.has_permission('bank.reconcile') then raise exception 'You can''t reconcile bank accounts.'; end if;
  for s in select * from public.bank_statement_lines where account_id = p_account and journal_line_id is null order by txn_date loop
    select l.id into jl
    from public.journal_lines l join public.journal_entries j on j.id = l.entry_id
    where l.account_id = p_account and j.status = 'posted' and (l.debit - l.credit) = s.amount
      and j.entry_date between s.txn_date - 3 and s.txn_date + 3
      and not exists (select 1 from public.bank_statement_lines b where b.journal_line_id = l.id)
    order by abs(j.entry_date - s.txn_date), j.entry_date limit 1;
    if jl is not null then
      update public.bank_statement_lines set journal_line_id = jl, matched_by = auth.uid(), matched_at = now() where id = s.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.bank_match(p_statement_line uuid, p_journal_line uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.bank_statement_lines; l public.journal_lines;
begin
  if not public.has_permission('bank.reconcile') then raise exception 'You can''t reconcile bank accounts.'; end if;
  select * into s from public.bank_statement_lines where id = p_statement_line for update;
  if p_journal_line is null then
    update public.bank_statement_lines set journal_line_id = null, matched_by = null, matched_at = null where id = p_statement_line;
    return;
  end if;
  select * into l from public.journal_lines where id = p_journal_line;
  if l.account_id <> s.account_id then raise exception 'That ledger line is on another account.'; end if;
  if (l.debit - l.credit) <> s.amount then raise exception 'Amounts differ (statement ₱%, ledger ₱%).', s.amount, l.debit - l.credit; end if;
  update public.bank_statement_lines set journal_line_id = p_journal_line, matched_by = auth.uid(), matched_at = now() where id = p_statement_line;
end $$;

-- ================================================================ reports
-- Trial balance for a date range: opening (before p_from), movement, closing. Test postings included unless p_official.
create or replace function public.trial_balance(p_from date, p_to date, p_official boolean default false)
returns table (account_id uuid, code text, name text, type public.gl_account_type, subtype text, opening numeric, debit numeric, credit numeric, closing numeric)
language sql stable security invoker set search_path = public as $$
  with l as (
    select jl.account_id, j.entry_date, jl.debit, jl.credit
    from public.journal_lines jl join public.journal_entries j on j.id = jl.entry_id
    where j.status = 'posted' and (not p_official or not j.is_test) and j.entry_date <= p_to
  )
  select a.id, a.code, a.name, a.type, a.subtype,
         coalesce(sum(l.debit - l.credit) filter (where l.entry_date < p_from), 0),
         coalesce(sum(l.debit) filter (where l.entry_date >= p_from), 0),
         coalesce(sum(l.credit) filter (where l.entry_date >= p_from), 0),
         coalesce(sum(l.debit - l.credit), 0)
  from public.accounts a left join l on l.account_id = a.id
  where not a.is_header
  group by a.id, a.code, a.name, a.type, a.subtype
  having coalesce(sum(abs(l.debit) + abs(l.credit)), 0) > 0 or a.active
  order by a.code
$$;
grant execute on function public.trial_balance to authenticated;

-- Monthly VAT summary from the ledger (output VAT on sales, input VAT on purchases).
create or replace view public.vat_summary with (security_invoker = true) as
  select date_trunc('month', j.entry_date)::date as month,
         sum(case when a.system_key = 'output_vat' then jl.credit - jl.debit else 0 end) as output_vat,
         sum(case when a.system_key = 'input_vat' then jl.debit - jl.credit else 0 end) as input_vat,
         bool_or(j.is_test) as includes_test
  from public.journal_lines jl join public.journal_entries j on j.id = jl.entry_id join public.accounts a on a.id = jl.account_id
  where j.status = 'posted' and a.system_key in ('output_vat', 'input_vat')
  group by 1;
grant select on public.vat_summary to authenticated;

-- Withholding tax withheld from suppliers (BIR 2307 data).
create or replace view public.ewt_withheld with (security_invoker = true) as
  select sp.id as payment_id, sp.number, sp.pay_date, s.name as supplier, s.tin, s.ewt_rate, sp.gross, sp.ewt_amount, sp.net_paid
  from public.supplier_payments sp join public.suppliers s on s.id = sp.supplier_id
  where sp.status = 'paid' and sp.ewt_amount > 0;
grant select on public.ewt_withheld to authenticated;

-- ================================================================ RLS
alter table public.supplier_payments enable row level security;
alter table public.supplier_payment_lines enable row level security;
alter table public.bank_statement_lines enable row level security;

create or replace function public.can_view_supplier_payment(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.supplier_payments p where p.id = p_id and (
    public.has_permission('accounting.view') or public.has_permission('ap.payments.create') or public.can_read_all()
    or exists (select 1 from public.approval_requests r join public.approval_steps s on s.request_id = r.id
               where r.doc_type = 'supplier_payment' and r.record_id = p.id and s.approver_ids && public.my_approver_ids())))
$$;
revoke execute on function public.can_view_supplier_payment from public, anon;
grant execute on function public.can_view_supplier_payment to authenticated;

create policy "supplier_payments: read" on public.supplier_payments for select to authenticated
  using (created_by = auth.uid() or public.can_view_supplier_payment(id));
create policy "supplier_payments: draft" on public.supplier_payments for all to authenticated
  using (status in ('draft', 'returned') and public.has_permission('ap.payments.create'))
  with check (status in ('draft', 'returned', 'cancelled') and public.has_permission('ap.payments.create'));
create policy "supplier_payment_lines: read" on public.supplier_payment_lines for select to authenticated using (public.can_view_supplier_payment(payment_id));
create policy "supplier_payment_lines: draft" on public.supplier_payment_lines for all to authenticated
  using (public.has_permission('ap.payments.create') and exists (select 1 from public.supplier_payments p where p.id = payment_id and p.status in ('draft', 'returned')))
  with check (public.has_permission('ap.payments.create') and exists (select 1 from public.supplier_payments p where p.id = payment_id and p.status in ('draft', 'returned')));
create policy "bank_statement_lines: read" on public.bank_statement_lines for select to authenticated
  using (public.has_permission('bank.reconcile') or public.has_permission('accounting.view') or public.can_read_all());
create policy "bank_statement_lines: import" on public.bank_statement_lines for insert to authenticated
  with check (public.has_permission('bank.reconcile') and journal_line_id is null);
create policy "bank_statement_lines: delete unmatched" on public.bank_statement_lines for delete to authenticated
  using (public.has_permission('bank.reconcile') and journal_line_id is null);

revoke execute on function public.submit_supplier_payment, public.mark_supplier_payment_paid, public.cancel_supplier_payment, public.release_petty_cash,
  public.bank_auto_match, public.bank_match from public, anon;
grant execute on function public.submit_supplier_payment, public.mark_supplier_payment_paid, public.cancel_supplier_payment, public.release_petty_cash,
  public.bank_auto_match, public.bank_match to authenticated;

-- ================================================================ approvals, attachments, audit
insert into public.approval_doc_types (doc_type, label, record_table, href_template) values
  ('supplier_payment', 'Supplier payment', 'supplier_payments', '/accounting/payables/{{id}}')
on conflict do nothing;
do $$
declare p uuid;
begin
  if not exists (select 1 from public.approval_policies where doc_type = 'supplier_payment') then
    insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority) values ('supplier_payment', 'Supplier payments: CEO', null, null, 10) returning id into p;
    insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', (select id from public.roles where code = 'ceo'));
  end if;
end $$;
insert into public.attachment_sources (record_table, can_view_function, can_attach_function) values
  ('supplier_payments', 'can_view_supplier_payment', 'can_view_supplier_payment')
on conflict do nothing;

select public.enable_audit('supplier_payments', false, array['updated_at']);
select public.enable_audit('supplier_payment_lines');
select public.enable_audit('bank_statement_lines');
