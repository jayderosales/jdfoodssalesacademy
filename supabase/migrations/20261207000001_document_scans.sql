-- Photo encoding: staff photograph a paper document, the AI reads it into a draft, a person checks and saves.
-- AI proposes, humans approve (CLAUDE.md §5.12): a scan never posts, approves or moves stock by itself.
-- Kinds: delivery_receipt (supplier delivery slip → receipt against PO / stock receipt draft), stock_transfer (goods sent
-- between sites → transfer draft), doc_transmittal (documents sent to accounting → transmittal log), supplier_bill
-- (→ supplier invoice draft), expense_receipt (→ petty cash liquidation or a draft journal), payment_slip (→ pending payment).

-- ================================================================ permissions and numbering
insert into public.permissions (code, module, description, is_restricted) values
  ('transmittals.receive', 'accounting', 'Receive documents transmitted to accounting and tick them off', false)
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_code)
select r.id, x.perm from (values ('cfo', 'transmittals.receive'), ('accounting_officer', 'transmittals.receive')) as x(role_code, perm)
join public.roles r on r.code = x.role_code
on conflict do nothing;

insert into public.number_series (entity_id, doc_type, label, prefix)
select e.id, 'doc_transmittal', 'Document transmittal', 'TRN' from public.entities e where e.code = 'JDF'
on conflict do nothing;

-- ================================================================ scans
create table public.document_scans (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('delivery_receipt', 'stock_transfer', 'doc_transmittal', 'supplier_bill', 'expense_receipt', 'payment_slip')),
  status text not null default 'reading' check (status in ('reading', 'ready', 'failed', 'done', 'discarded')),
  filename text not null default '',
  extracted jsonb not null default '{}',
  ai_notes text not null default '',
  error text not null default '',
  model text not null default '',
  record_table text not null default '',
  record_id uuid,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.document_scans (created_by, created_at desc);
create index on public.document_scans (kind, status);
create index on public.document_scans (record_table, record_id);

-- Which permission lets someone other than the uploader see a scan of this kind.
create or replace function public.scan_kind_permission(p_kind text) returns text
language sql immutable set search_path = public as $$
  select case p_kind
    when 'delivery_receipt' then 'inventory.receive'
    when 'stock_transfer' then 'inventory.transfer'
    when 'doc_transmittal' then 'transmittals.receive'
    when 'supplier_bill' then 'procurement.invoices.manage'
    when 'expense_receipt' then 'accounting.journals.create'
    when 'payment_slip' then 'sales.payments.confirm'
  end
$$;

create or replace function public.document_scan_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'reading';
    return new;
  end if;
  if new.kind <> old.kind or new.created_by <> old.created_by then raise exception 'A scan''s type and owner can''t change.'; end if;
  if old.status in ('done', 'discarded') and new.status <> old.status then raise exception 'This scan is already closed.'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger document_scan_before_write before insert or update on public.document_scans for each row execute function public.document_scan_before_write();

create or replace function public.can_view_document_scan(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (select 1 from public.document_scans s where s.id = p_id and (
    s.created_by = auth.uid() or public.can_read_all() or public.has_permission(public.scan_kind_permission(s.kind))))
$$;
create or replace function public.can_attach_document_scan(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (select 1 from public.document_scans s where s.id = p_id and s.created_by = auth.uid() and s.status in ('reading', 'ready', 'failed'))
$$;
revoke execute on function public.can_view_document_scan, public.can_attach_document_scan, public.document_scan_before_write from public, anon;
grant execute on function public.can_view_document_scan, public.can_attach_document_scan to authenticated;
insert into public.attachment_sources (record_table, can_view_function, can_attach_function)
values ('document_scans', 'can_view_document_scan', 'can_attach_document_scan')
on conflict do nothing;

alter table public.document_scans enable row level security;
create policy "document_scans: read" on public.document_scans for select to authenticated using (created_by = auth.uid() or public.can_view_document_scan(id));
create policy "document_scans: add" on public.document_scans for insert to authenticated with check (created_by = auth.uid() and public.is_active_user());
create policy "document_scans: update own" on public.document_scans for update to authenticated
  using (created_by = auth.uid() or public.has_permission(public.scan_kind_permission(kind)))
  with check (created_by = auth.uid() or public.has_permission(public.scan_kind_permission(kind)));

-- ================================================================ document transmittals (documents sent to accounting)
create table public.document_transmittals (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  sent_on date not null default public.manila_today(),
  from_name text not null check (length(trim(from_name)) >= 2), -- person / branch / department sending
  to_name text not null default 'Accounting',
  notes text not null default '',
  status text not null default 'open' check (status in ('open', 'partial', 'received')),
  scan_id uuid references public.document_scans(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.document_transmittals (status, sent_on desc);
create index on public.document_transmittals (created_by);

create table public.document_transmittal_lines (
  id uuid primary key default gen_random_uuid(),
  transmittal_id uuid not null references public.document_transmittals(id) on delete cascade,
  line_no int not null default 0,
  doc_type text not null default '', -- invoice, OR, delivery receipt, cheque, deposit slip, collection report…
  doc_no text not null default '',
  party text not null default '', -- customer / supplier on the document
  doc_date date,
  amount numeric(18, 2) check (amount is null or amount >= 0),
  received boolean not null default false,
  received_by uuid references public.profiles(id),
  received_at timestamptz,
  note text not null default '',
  constraint has_content check (length(trim(doc_type || doc_no || party)) > 0)
);
create index on public.document_transmittal_lines (transmittal_id);

create or replace function public.transmittal_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('doc_transmittal', new.sent_on);
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'open';
    return new;
  end if;
  if new.status is distinct from old.status and coalesce(current_setting('app.transmittal_engine', true), 'off') <> 'on' then
    raise exception 'Tick off received documents to change the status.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger transmittal_before_write before insert or update on public.document_transmittals for each row execute function public.transmittal_before_write();

-- Lines can be edited by the sender until accounting starts receiving; received flags change only through the RPC.
create or replace function public.transmittal_line_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if coalesce(current_setting('app.transmittal_engine', true), 'off') = 'on' then return coalesce(new, old); end if;
  select status into st from public.document_transmittals where id = coalesce(new.transmittal_id, old.transmittal_id);
  if st <> 'open' or (tg_op <> 'INSERT' and old.received) then raise exception 'Accounting has started receiving this transmittal; it can''t be edited.'; end if;
  if tg_op <> 'DELETE' and (new.received or new.received_by is not null) then raise exception 'Use "Mark received" to receive documents.'; end if;
  return coalesce(new, old);
end $$;
create trigger transmittal_line_guard before insert or update or delete on public.document_transmittal_lines for each row execute function public.transmittal_line_guard();

create or replace function public.receive_transmittal(p_id uuid, p_lines uuid[], p_note text default '') returns text
language plpgsql security definer set search_path = public as $$
declare t public.document_transmittals; total int; got int; st text;
begin
  if not public.has_permission('transmittals.receive') then raise exception 'Only accounting can receive transmittals.'; end if;
  select * into t from public.document_transmittals where id = p_id for update;
  if t.id is null then raise exception 'Transmittal not found.'; end if;
  if t.created_by = auth.uid() then raise exception 'Someone other than the sender must receive the documents.'; end if;
  perform set_config('app.transmittal_engine', 'on', true);
  update public.document_transmittal_lines set received = true, received_by = auth.uid(), received_at = now(),
    note = case when coalesce(trim(p_note), '') <> '' then left(trim(p_note), 300) else note end
  where transmittal_id = p_id and id = any(p_lines) and not received;
  select count(*), count(*) filter (where received) into total, got from public.document_transmittal_lines where transmittal_id = p_id;
  st := case when got = 0 then 'open' when got < total then 'partial' else 'received' end;
  update public.document_transmittals set status = st where id = p_id;
  perform set_config('app.transmittal_engine', 'off', true);
  if st = 'received' then
    perform public.emit_event('transmittal.received', 'document_transmittals', p_id::text, jsonb_build_object('number', t.number));
  end if;
  return st;
end $$;
revoke execute on function public.transmittal_before_write, public.transmittal_line_guard from public, anon, authenticated;
revoke execute on function public.receive_transmittal from public, anon;
grant execute on function public.receive_transmittal to authenticated;

create or replace function public.can_view_transmittal(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (select 1 from public.document_transmittals t where t.id = p_id and (
    t.created_by = auth.uid() or public.has_permission('transmittals.receive') or public.can_read_all()))
$$;
create or replace function public.can_attach_transmittal(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (select 1 from public.document_transmittals t where t.id = p_id and (
    t.created_by = auth.uid() or public.has_permission('transmittals.receive')))
$$;
revoke execute on function public.can_view_transmittal, public.can_attach_transmittal from public, anon;
grant execute on function public.can_view_transmittal, public.can_attach_transmittal to authenticated;
insert into public.attachment_sources (record_table, can_view_function, can_attach_function)
values ('document_transmittals', 'can_view_transmittal', 'can_attach_transmittal')
on conflict do nothing;

alter table public.document_transmittals enable row level security;
alter table public.document_transmittal_lines enable row level security;
create policy "transmittals: read" on public.document_transmittals for select to authenticated using (created_by = auth.uid() or public.can_view_transmittal(id));
create policy "transmittals: add" on public.document_transmittals for insert to authenticated with check (created_by = auth.uid() and public.is_active_user());
create policy "transmittals: edit own open" on public.document_transmittals for update to authenticated
  using (created_by = auth.uid() and status = 'open') with check (created_by = auth.uid());
create policy "transmittal lines: read" on public.document_transmittal_lines for select to authenticated using (public.can_view_transmittal(transmittal_id));
create policy "transmittal lines: edit own open" on public.document_transmittal_lines for all to authenticated
  using (exists (select 1 from public.document_transmittals t where t.id = transmittal_id and t.created_by = auth.uid() and t.status = 'open'))
  with check (exists (select 1 from public.document_transmittals t where t.id = transmittal_id and t.created_by = auth.uid() and t.status = 'open'));

-- ================================================================ expense receipts
-- An official receipt for a small expense. Either it liquidates a released petty cash request (already posted at release),
-- or it was paid from a company cash/bank account and becomes a draft manual journal for the CEO.
create table public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_date date not null,
  vendor_name text not null check (length(trim(vendor_name)) >= 2),
  vendor_tin text not null default '',
  receipt_no text not null default '',
  amount numeric(18, 2) not null check (amount > 0),
  vat_amount numeric(18, 2) not null default 0 check (vat_amount >= 0),
  expense_account_id uuid not null references public.accounts(id),
  description text not null default '',
  petty_cash_request_id uuid references public.petty_cash_requests(id),
  journal_entry_id uuid references public.journal_entries(id),
  scan_id uuid references public.document_scans(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint vat_within_amount check (vat_amount <= amount)
);
create index on public.expense_receipts (petty_cash_request_id);
create index on public.expense_receipts (journal_entry_id);
create index on public.expense_receipts (created_by, created_at desc);
-- the same official receipt can't be claimed twice
create unique index expense_receipts_once on public.expense_receipts (lower(trim(vendor_name)), upper(trim(receipt_no))) where trim(receipt_no) <> '';

create or replace function public.record_expense_receipt(p_date date, p_vendor text, p_tin text, p_receipt_no text, p_amount numeric, p_vat numeric,
  p_expense_account uuid, p_description text, p_petty_cash uuid, p_paid_from uuid, p_scan uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pc public.petty_cash_requests;
  acc public.accounts;
  rid uuid;
  jid uuid;
  vat numeric := round(coalesce(p_vat, 0), 2);
  amt numeric := round(coalesce(p_amount, 0), 2);
  liquidated numeric;
begin
  if (p_petty_cash is null) = (p_paid_from is null) then raise exception 'Choose either the petty cash request or the account it was paid from.'; end if;
  if amt <= 0 then raise exception 'Enter the receipt amount.'; end if;
  if vat < 0 or vat > amt then raise exception 'VAT must be between zero and the amount.'; end if;
  select * into acc from public.accounts where id = p_expense_account;
  if acc.id is null or acc.type <> 'expense' or acc.is_header or not acc.active then raise exception 'Choose an active expense account.'; end if;
  if exists (select 1 from public.expense_receipts where trim(coalesce(p_receipt_no, '')) <> ''
             and lower(trim(vendor_name)) = lower(trim(p_vendor)) and upper(trim(receipt_no)) = upper(trim(p_receipt_no))) then
    raise exception 'Receipt % from % was already recorded.', p_receipt_no, p_vendor;
  end if;
  if p_petty_cash is not null then
    select * into pc from public.petty_cash_requests where id = p_petty_cash for update;
    if pc.id is null then raise exception 'Petty cash request not found.'; end if;
    if pc.requested_by <> auth.uid() and not public.has_permission('accounting.journals.create') then raise exception 'Only the requester or accounting can liquidate this petty cash.'; end if;
    if pc.released_at is null then raise exception 'This petty cash hasn''t been released yet.'; end if;
    select coalesce(sum(amount), 0) into liquidated from public.expense_receipts where petty_cash_request_id = p_petty_cash;
    if liquidated + amt > pc.amount then raise exception 'Receipts would total ₱% but only ₱% was released.', liquidated + amt, pc.amount; end if;
  else
    if not public.has_permission('accounting.journals.create') then raise exception 'Only accounting can record company-paid expenses.'; end if;
    if (select subtype from public.accounts where id = p_paid_from) not in ('cash', 'bank') then raise exception 'Choose the cash or bank account it was paid from.'; end if;
    -- a draft manual journal (expense + input VAT / cash); it goes to the CEO like any manual entry
    insert into public.journal_entries (number, entry_date, memo) values ('', p_date, left('Expense: ' || p_vendor || coalesce(' OR ' || nullif(trim(p_receipt_no), ''), '') || coalesce(' · ' || nullif(trim(p_description), ''), ''), 300))
    returning id into jid;
    insert into public.journal_lines (entry_id, line_no, account_id, debit, description) values (jid, 1, p_expense_account, amt - vat, left(coalesce(p_description, ''), 200));
    if vat > 0 then
      insert into public.journal_lines (entry_id, line_no, account_id, debit, description) values (jid, 2, public.account_by_key('input_vat'), vat, 'VAT ' || coalesce(p_tin, ''));
    end if;
    insert into public.journal_lines (entry_id, line_no, account_id, credit, description) values (jid, 3, p_paid_from, amt, p_vendor);
  end if;
  insert into public.expense_receipts (receipt_date, vendor_name, vendor_tin, receipt_no, amount, vat_amount, expense_account_id, description, petty_cash_request_id, journal_entry_id, scan_id)
  values (p_date, trim(p_vendor), trim(coalesce(p_tin, '')), trim(coalesce(p_receipt_no, '')), amt, vat, p_expense_account, trim(coalesce(p_description, '')), p_petty_cash, jid, p_scan)
  returning id into rid;
  return rid;
end $$;
revoke execute on function public.record_expense_receipt from public, anon;
grant execute on function public.record_expense_receipt to authenticated;

-- Staff liquidating petty cash pick what an expense was for, so the names of active expense accounts are visible to
-- everyone signed in (no balances: journal lines stay restricted).
create policy "accounts: expense names" on public.accounts for select to authenticated
  using (type = 'expense' and active and not is_header and public.is_active_user());

alter table public.expense_receipts enable row level security;
create policy "expense_receipts: read" on public.expense_receipts for select to authenticated using (
  created_by = auth.uid() or public.has_permission('accounting.view') or public.can_read_all()
  or (petty_cash_request_id is not null and public.can_view_petty_cash_request(petty_cash_request_id)));
-- writes only through record_expense_receipt (no insert/update/delete policies)

-- ================================================================ audit
select public.enable_audit('document_transmittals', false, array['updated_at']);
select public.enable_audit('document_transmittal_lines');
select public.enable_audit('expense_receipts');
insert into public.audit_exempt (table_name, reason) values
  ('document_scans', 'Working drafts of AI-read photos; the record created from a scan is audited.')
on conflict do nothing;
