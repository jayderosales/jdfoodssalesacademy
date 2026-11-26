-- Phase 5a (part 1): chart of accounts, fiscal periods, journal entries (balanced, immutable once posted, locked periods),
-- manual journals with CEO approval, reversals, and the posting engine that turns domain events into journal entries.
-- Owner answers 2026-11-26: VAT-registered; books are in Excel today, so JD Foods OS becomes the book of record;
-- parallel run first (all postings are "test" until the cut-off is set); CEO approves supplier payments.
-- Every account, rate and rule here is a placeholder marked needs_verification until the accountant signs off.

-- ================================================================ permissions
insert into public.permissions (code, module, description, is_restricted) values
  ('accounting.view',             'accounting', 'See the chart of accounts, journals and ledgers', false),
  ('accounting.journals.create',  'accounting', 'Create manual journal entries and reversals', false),
  ('accounting.periods.manage',   'accounting', 'Close, lock and reopen accounting periods; start the books', false),
  ('accounting.coa.manage',       'accounting', 'Edit the chart of accounts and posting accounts', false),
  ('ap.payments.create',          'accounting', 'Prepare supplier payments', false),
  ('ar.manage',                   'accounting', 'Customer statements and receivables follow-up', false),
  ('bank.reconcile',              'accounting', 'Import bank statements and reconcile', false),
  ('finance.reports.view',        'accounting', 'See financial statements and tax reports', false)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, x.perm
from (values
  ('cfo', 'accounting.view'), ('cfo', 'accounting.journals.create'), ('cfo', 'accounting.periods.manage'), ('cfo', 'accounting.coa.manage'),
  ('cfo', 'ap.payments.create'), ('cfo', 'ar.manage'), ('cfo', 'bank.reconcile'), ('cfo', 'finance.reports.view'),
  ('accounting_officer', 'accounting.view'), ('accounting_officer', 'accounting.journals.create'), ('accounting_officer', 'ap.payments.create'),
  ('accounting_officer', 'ar.manage'), ('accounting_officer', 'bank.reconcile'), ('accounting_officer', 'finance.reports.view'),
  ('auditor', 'accounting.view'), ('auditor', 'finance.reports.view')
) as x(role_code, perm)
join public.roles r on r.code = x.role_code
on conflict do nothing;

-- ================================================================ settings and numbering
alter table public.app_settings
  add column books_live_from date, -- null = parallel run: every posting is a test posting
  add column sales_vat_inclusive boolean not null default true; -- shelf/SRP prices include VAT
update public.entities set vat_registered = true where code = 'JDF';

insert into public.number_series (entity_id, doc_type, label, prefix)
select e.id, x.doc_type, x.label, x.prefix
from public.entities e
cross join (values ('journal_entry', 'Journal entry', 'JE'), ('supplier_payment', 'Supplier payment', 'SPAY')) as x(doc_type, label, prefix)
where e.code = 'JDF'
on conflict do nothing;

-- ================================================================ chart of accounts
create type public.gl_account_type as enum ('asset', 'liability', 'equity', 'income', 'expense');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{4,6}$'),
  name text not null check (length(trim(name)) >= 2),
  type public.gl_account_type not null,
  subtype text not null default '', -- cash, bank, receivable, inventory, payable, tax, cost_of_sales, operating…
  parent_id uuid references public.accounts(id),
  is_header boolean not null default false, -- headers group accounts; they can't be posted to
  system_key text unique, -- accounts the posting engine uses (ar, ap, inventory, sales, output_vat…)
  description text not null default '',
  active boolean not null default true,
  needs_verification boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.accounts (type, active);
create index on public.accounts (parent_id);

-- Seed: Philippine-style chart for a food manufacturer/distributor. PLACEHOLDER: accountant to review.
insert into public.accounts (code, name, type, subtype, is_header, system_key) values
  ('1000', 'Assets', 'asset', '', true, null),
  ('1010', 'Cash on hand', 'asset', 'cash', false, 'cash_on_hand'),
  ('1020', 'Petty cash fund', 'asset', 'cash', false, 'petty_cash'),
  ('1030', 'Cash in bank – main account', 'asset', 'bank', false, 'bank_main'),
  ('1040', 'GCash', 'asset', 'bank', false, 'gcash'),
  ('1050', 'Maya', 'asset', 'bank', false, 'maya'),
  ('1060', 'Online payments clearing (PayMongo)', 'asset', 'bank', false, 'paymongo_clearing'),
  ('1100', 'Accounts receivable – trade', 'asset', 'receivable', false, 'ar'),
  ('1150', 'Advances to suppliers', 'asset', 'receivable', false, null),
  ('1200', 'Inventory – finished goods and merchandise', 'asset', 'inventory', false, 'inventory'),
  ('1210', 'Inventory – raw materials and packaging', 'asset', 'inventory', false, 'inventory_raw'),
  ('1290', 'Inventory receipts clearing', 'asset', 'inventory', false, 'inventory_clearing'),
  ('1300', 'Input VAT', 'asset', 'tax', false, 'input_vat'),
  ('1310', 'Creditable withholding tax', 'asset', 'tax', false, 'cwt'),
  ('1400', 'Prepaid expenses', 'asset', 'prepaid', false, null),
  ('1500', 'Property and equipment', 'asset', '', true, null),
  ('1510', 'Equipment', 'asset', 'fixed', false, null),
  ('1590', 'Accumulated depreciation', 'asset', 'fixed', false, null),
  ('2000', 'Liabilities', 'liability', '', true, null),
  ('2010', 'Accounts payable – trade', 'liability', 'payable', false, 'ap'),
  ('2020', 'Goods received not invoiced', 'liability', 'payable', false, 'grni'),
  ('2100', 'Output VAT', 'liability', 'tax', false, 'output_vat'),
  ('2110', 'VAT payable', 'liability', 'tax', false, 'vat_payable'),
  ('2200', 'Expanded withholding tax payable', 'liability', 'tax', false, 'ewt_payable'),
  ('2300', 'Accrued expenses', 'liability', 'accrual', false, null),
  ('2400', 'Customer deposits', 'liability', 'payable', false, 'customer_deposits'),
  ('3000', 'Equity', 'equity', '', true, null),
  ('3010', 'Owner''s capital', 'equity', '', false, null),
  ('3100', 'Retained earnings', 'equity', '', false, 'retained_earnings'),
  ('3900', 'Opening balance equity', 'equity', '', false, 'opening_equity'),
  ('4000', 'Revenue', 'income', '', true, null),
  ('4010', 'Sales – products', 'income', 'sales', false, 'sales'),
  ('4020', 'Sales – services', 'income', 'sales', false, 'sales_services'),
  ('4090', 'Sales returns and allowances', 'income', 'sales', false, 'sales_returns'),
  ('4500', 'Other income', 'income', '', true, null),
  ('4510', 'Inventory gain', 'income', 'other_income', false, 'inventory_gain'),
  ('4520', 'Interest income', 'income', 'other_income', false, null),
  ('5000', 'Cost of sales', 'expense', '', true, null),
  ('5010', 'Cost of goods sold', 'expense', 'cost_of_sales', false, 'cogs'),
  ('5020', 'Purchase price variance', 'expense', 'cost_of_sales', false, 'price_variance'),
  ('5030', 'Freight-in', 'expense', 'cost_of_sales', false, null),
  ('6000', 'Operating expenses', 'expense', '', true, null),
  ('6010', 'Salaries and wages', 'expense', 'operating', false, null),
  ('6020', 'Rent', 'expense', 'operating', false, null),
  ('6030', 'Utilities', 'expense', 'operating', false, null),
  ('6040', 'Courier and delivery', 'expense', 'operating', false, null),
  ('6050', 'Marketing and samples', 'expense', 'operating', false, 'samples_expense'),
  ('6060', 'Supplies', 'expense', 'operating', false, 'supplies_expense'),
  ('6070', 'Inventory losses and write-offs', 'expense', 'operating', false, 'inventory_loss'),
  ('6080', 'Bank and payment fees', 'expense', 'operating', false, null),
  ('6090', 'Repairs and maintenance', 'expense', 'operating', false, null),
  ('6100', 'Transportation', 'expense', 'operating', false, null),
  ('6110', 'Communication', 'expense', 'operating', false, null),
  ('6120', 'Professional fees', 'expense', 'operating', false, null),
  ('6130', 'Taxes and licenses', 'expense', 'operating', false, null),
  ('6190', 'Other purchases and miscellaneous', 'expense', 'operating', false, 'purchase_other'),
  ('9999', 'Suspense', 'asset', 'suspense', false, 'suspense')
on conflict (code) do nothing;
update public.accounts c set parent_id = p.id from public.accounts p
where p.is_header and c.parent_id is null and not c.is_header and left(c.code, 1) = left(p.code, 1)
  and p.code = (select max(h.code) from public.accounts h where h.is_header and h.code <= c.code and left(h.code, 1) = left(c.code, 1));

-- Payment method → cash/bank account.
create table public.payment_method_accounts (
  method text primary key check (method in ('cash', 'bank_transfer', 'gcash', 'maya', 'cheque', 'card', 'paymongo', 'other')),
  account_id uuid not null references public.accounts(id)
);
insert into public.payment_method_accounts (method, account_id)
select x.m, a.id from (values ('cash', 'cash_on_hand'), ('bank_transfer', 'bank_main'), ('cheque', 'bank_main'), ('gcash', 'gcash'),
  ('maya', 'maya'), ('card', 'paymongo_clearing'), ('paymongo', 'paymongo_clearing'), ('other', 'suspense')) as x(m, k)
join public.accounts a on a.system_key = x.k
on conflict do nothing;

create or replace function public.account_by_key(p_key text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare a uuid;
begin
  select id into a from public.accounts where (system_key = p_key or code = p_key) and active and not is_header;
  if a is null then raise exception 'No active posting account for "%" (Accounting → Chart of accounts).', p_key; end if;
  return a;
end $$;
revoke execute on function public.account_by_key from public, anon, authenticated;

-- ================================================================ periods
create table public.fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  period_start date not null unique check (extract(day from period_start) = 1),
  status text not null default 'open' check (status in ('open', 'closed', 'locked')),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.ensure_period(p_date date) returns public.fiscal_periods
language plpgsql security definer set search_path = public as $$
declare p public.fiscal_periods; s date := date_trunc('month', p_date)::date;
begin
  insert into public.fiscal_periods (period_start) values (s) on conflict (period_start) do nothing;
  select * into p from public.fiscal_periods where period_start = s;
  return p;
end $$;
revoke execute on function public.ensure_period from public, anon, authenticated;

-- ================================================================ journals
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  entry_date date not null,
  period_id uuid references public.fiscal_periods(id),
  source text not null default 'manual' check (source in ('manual', 'sale', 'sale_void', 'payment', 'stock', 'revaluation', 'purchase_invoice',
                                                           'purchase_invoice_void', 'supplier_payment', 'petty_cash', 'opening', 'reversal', 'closing')),
  source_table text not null default '',
  source_id text not null default '',
  event_id bigint,
  memo text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'returned', 'cancelled', 'posted')),
  is_test boolean not null default true,
  total numeric(18, 2) not null default 0,
  reversal_of uuid references public.journal_entries(id),
  reversed_by uuid references public.journal_entries(id),
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  posted_by uuid references public.profiles(id)
);
create index on public.journal_entries (entry_date);
create index on public.journal_entries (source, source_table, source_id);
create index on public.journal_entries (status);
-- an automatic posting happens once per source document and kind
create unique index journal_entries_once on public.journal_entries (source, source_table, source_id)
  where source not in ('manual', 'reversal', 'opening', 'closing') and status = 'posted';

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  line_no int not null default 0,
  account_id uuid not null references public.accounts(id),
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  description text not null default '',
  location_id uuid references public.locations(id),
  department_id uuid references public.departments(id),
  channel text not null default '',
  brand_id uuid references public.brands(id),
  customer_id uuid references public.customers(id),
  supplier_id uuid references public.suppliers(id),
  product_id uuid references public.products(id),
  constraint one_side check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index on public.journal_lines (entry_id);
create index on public.journal_lines (account_id);
create index on public.journal_lines (customer_id) where customer_id is not null;
create index on public.journal_lines (supplier_id) where supplier_id is not null;

-- Lines can't be posted to header accounts, and can only change while the entry is a draft.
create or replace function public.journal_line_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text; hdr boolean;
begin
  select status into st from public.journal_entries where id = coalesce(new.entry_id, old.entry_id);
  if st = 'posted' and coalesce(current_setting('app.books_reset', true), 'off') <> 'on' then
    raise exception 'Posted journal entries can''t be changed. Reverse the entry instead.';
  end if;
  if st not in ('draft', 'returned') and coalesce(current_setting('app.posting_engine', true), 'off') <> 'on'
     and coalesce(current_setting('app.books_reset', true), 'off') <> 'on' then
    raise exception 'Journal lines can only be changed while the entry is a draft.';
  end if;
  if tg_op <> 'DELETE' then
    select is_header into hdr from public.accounts where id = new.account_id;
    if hdr then raise exception 'Choose a posting account, not a heading.'; end if;
    return new;
  end if;
  return old;
end $$;
create trigger journal_line_guard before insert or update or delete on public.journal_lines for each row execute function public.journal_line_guard();

create or replace function public.journal_entry_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  engine boolean := coalesce(current_setting('app.posting_engine', true), 'off') = 'on';
  appr boolean := coalesce(current_setting('app.approval_engine', true), 'off') = 'on';
  d numeric; c numeric; per public.fiscal_periods;
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' and coalesce(current_setting('app.books_reset', true), 'off') <> 'on' then
      raise exception 'Posted journal entries can''t be deleted. Reverse the entry instead.';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('journal_entry', new.entry_date);
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.is_test := (select books_live_from is null from public.app_settings limit 1);
    if not engine then new.status := 'draft'; new.source := 'manual'; end if;
    return new;
  end if;
  if old.status = 'posted' then
    if (new.status, new.entry_date, new.total, new.memo) is distinct from (old.status, old.entry_date, old.total, old.memo)
       and coalesce(current_setting('app.books_reset', true), 'off') <> 'on' then
      raise exception 'Posted journal entries can''t be changed. Reverse the entry instead.';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status and not engine and not appr and not (old.status in ('draft', 'returned') and new.status = 'cancelled') then
    raise exception 'Use the journal buttons to change its status.';
  end if;
  -- the approval engine approves a manual journal → post it now
  if appr and new.status = 'approved' then new.status := 'posted'; end if;
  if new.status = 'posted' then
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into d, c from public.journal_lines where entry_id = new.id;
    if d <> c then raise exception 'Journal % doesn''t balance: debits ₱% vs credits ₱%.', new.number, d, c; end if;
    if d = 0 then raise exception 'Journal % has no amounts.', new.number; end if;
    per := public.ensure_period(new.entry_date);
    if per.status = 'locked' then raise exception 'The period % is locked. Post in an open period.', to_char(per.period_start, 'Mon YYYY'); end if;
    if per.status = 'closed' and not public.has_permission('accounting.periods.manage') then
      raise exception 'The period % is closed. Ask the finance head to reopen it.', to_char(per.period_start, 'Mon YYYY');
    end if;
    if (select books_live_from from public.app_settings limit 1) > new.entry_date and new.source <> 'opening' then
      raise exception 'The books start on %; entries can''t be dated earlier.', (select books_live_from from public.app_settings limit 1);
    end if;
    new.period_id := per.id;
    new.total := d;
    new.posted_at := now();
    new.posted_by := coalesce(auth.uid(), new.posted_by);
  end if;
  return new;
end $$;
create trigger journal_entry_guard before insert or update or delete on public.journal_entries for each row execute function public.journal_entry_guard();

-- Safety net: at commit, every posted entry balances.
create or replace function public.journal_balance_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare eid uuid := coalesce(new.entry_id, old.entry_id); d numeric; c numeric; st text;
begin
  select status into st from public.journal_entries where id = eid;
  if st = 'posted' then
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into d, c from public.journal_lines where entry_id = eid;
    if d <> c then raise exception 'Journal entry doesn''t balance (₱% vs ₱%).', d, c; end if;
  end if;
  return null;
end $$;
create constraint trigger journal_balance_check after insert or update or delete on public.journal_lines
  deferrable initially deferred for each row execute function public.journal_balance_check();
revoke execute on function public.journal_line_guard, public.journal_entry_guard, public.journal_balance_check from public, anon, authenticated;

-- Internal: create and post an automatic journal. p_lines: [{"account": "ar"|code, "debit": 1, "credit": 0, "description",
-- "location_id", "channel", "brand_id", "customer_id", "supplier_id", "product_id"}]. Zero lines are dropped; returns null if nothing to post.
create or replace function public.post_journal(p_date date, p_source text, p_source_table text, p_source_id text, p_memo text,
                                               p_lines jsonb, p_event_id bigint default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
  l jsonb;
  n int := 0;
  dsum numeric := 0; csum numeric := 0;
  dv numeric; cv numeric;
begin
  for l in select value from jsonb_array_elements(p_lines) loop
    dv := round(coalesce((l->>'debit')::numeric, 0), 2); cv := round(coalesce((l->>'credit')::numeric, 0), 2);
    if dv < 0 then cv := cv - dv; dv := 0; end if;
    if cv < 0 then dv := dv - cv; cv := 0; end if;
    dsum := dsum + dv; csum := csum + cv;
  end loop;
  if dsum = 0 and csum = 0 then return null; end if;
  if dsum <> csum then raise exception 'Posting for % % doesn''t balance (₱% vs ₱%).', p_source, p_source_id, dsum, csum; end if;
  perform set_config('app.posting_engine', 'on', true);
  insert into public.journal_entries (number, entry_date, source, source_table, source_id, event_id, memo, status)
  values ('', p_date, p_source, coalesce(p_source_table, ''), coalesce(p_source_id, ''), p_event_id, left(coalesce(p_memo, ''), 300), 'draft')
  returning id into eid;
  for l in select value from jsonb_array_elements(p_lines) loop
    dv := round(coalesce((l->>'debit')::numeric, 0), 2); cv := round(coalesce((l->>'credit')::numeric, 0), 2);
    if dv < 0 then cv := cv - dv; dv := 0; end if;
    if cv < 0 then dv := dv - cv; cv := 0; end if;
    if dv = 0 and cv = 0 then continue; end if;
    n := n + 1;
    insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, description, location_id, channel, brand_id, customer_id, supplier_id, product_id)
    values (eid, n, public.account_by_key(l->>'account'), dv, cv, coalesce(l->>'description', ''), nullif(l->>'location_id', '')::uuid,
            coalesce(l->>'channel', ''), nullif(l->>'brand_id', '')::uuid, nullif(l->>'customer_id', '')::uuid,
            nullif(l->>'supplier_id', '')::uuid, nullif(l->>'product_id', '')::uuid);
  end loop;
  update public.journal_entries set status = 'posted' where id = eid;
  perform set_config('app.posting_engine', 'off', true);
  return eid;
end $$;
revoke execute on function public.post_journal from public, anon, authenticated;

-- Reverse a posted entry (any source): mirror lines on a new date; both entries stay in the ledger.
-- Internal (posting engine, no permission check): mirror a posted entry.
create or replace function public.reverse_journal_internal(p_entry uuid, p_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  je public.journal_entries;
  rid uuid;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Please give a reason.'; end if;
  select * into je from public.journal_entries where id = p_entry for update;
  if je.status <> 'posted' then raise exception 'Only posted entries can be reversed.'; end if;
  if je.reversed_by is not null then raise exception 'This entry was already reversed.'; end if;
  perform set_config('app.posting_engine', 'on', true);
  insert into public.journal_entries (number, entry_date, source, source_table, source_id, memo, status, reversal_of)
  values ('', coalesce(p_date, public.manila_today()), 'reversal', je.source_table, je.source_id, 'Reversal of ' || je.number || ': ' || trim(p_reason), 'draft', je.id)
  returning id into rid;
  insert into public.journal_lines (entry_id, line_no, account_id, debit, credit, description, location_id, department_id, channel, brand_id, customer_id, supplier_id, product_id)
  select rid, line_no, account_id, credit, debit, description, location_id, department_id, channel, brand_id, customer_id, supplier_id, product_id
  from public.journal_lines where entry_id = je.id;
  update public.journal_entries set status = 'posted' where id = rid;
  update public.journal_entries set reversed_by = rid where id = je.id;
  perform set_config('app.posting_engine', 'off', true);
  return rid;
end $$;

revoke execute on function public.reverse_journal_internal from public, anon, authenticated;

create or replace function public.reverse_journal(p_entry uuid, p_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('accounting.journals.create') then raise exception 'You can''t reverse journal entries.'; end if;
  return public.reverse_journal_internal(p_entry, p_date, p_reason);
end $$;

-- Manual journals: draft → CEO approval → posted automatically on approval.
create or replace function public.submit_journal(p_entry uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare je public.journal_entries; d numeric; c numeric;
begin
  select * into je from public.journal_entries where id = p_entry for update;
  if je.id is null or not public.has_permission('accounting.journals.create') then raise exception 'You can''t submit journal entries.'; end if;
  if je.status not in ('draft', 'returned') then raise exception 'This entry was already submitted.'; end if;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into d, c from public.journal_lines where entry_id = p_entry;
  if d = 0 then raise exception 'Add the debit and credit lines.'; end if;
  if d <> c then raise exception 'Debits (₱%) and credits (₱%) must be equal.', d, c; end if;
  if (public.ensure_period(je.entry_date)).status = 'locked' then raise exception 'That period is locked.'; end if;
  return public.start_approval('journal_entry', p_entry, d, format('Journal %s: ₱%s, %s', je.number, to_char(d, 'FM999,999,990.00'), left(je.memo, 80)), auth.uid());
end $$;

-- ================================================================ posting engine
create table public.unposted_events (
  event_id bigint primary key references public.domain_events(id) on delete cascade,
  event_type text not null,
  error text not null,
  attempts int not null default 1,
  last_attempt_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Which event types the engine handles. Each has a rule in post_event() and a unit test.
create or replace function public.post_event(p_event bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e public.domain_events;
  rate numeric := coalesce((select vat_rate from public.app_settings limit 1), 12);
  incl boolean := coalesce((select sales_vat_inclusive from public.app_settings limit 1), true);
  jid uuid;
  lines jsonb := '[]';
  o public.sales_orders;
  m public.stock_movements;
  mc public.stock_movement_costs;
  v numeric;
  rcpt public.stock_receipts;
  p public.payments;
  inv public.supplier_invoices;
  po public.purchase_orders;
  sup public.suppliers;
  net_total numeric; vat numeric; grni numeric; pv numeric;
  r record;
  d date;
  kind text;
  other text;
begin
  select * into e from public.domain_events where id = p_event;
  case e.type
  -- ---------------------------------------------------------------- stock movements (value at moving average cost)
  when 'stock.moved' then
    select * into m from public.stock_movements where id = e.aggregate_id::bigint;
    select * into mc from public.stock_movement_costs where movement_id = m.id;
    v := abs(coalesce(mc.value, 0));
    if v = 0 or m.movement_type in ('transfer_in', 'transfer_out') then return null; end if;
    d := (m.created_at at time zone 'Asia/Manila')::date;
    kind := (select case when item_type in ('raw_material', 'packaging') then 'inventory_raw' else 'inventory' end from public.products where id = m.product_id);
    other := case m.movement_type
      when 'sale_dispatch' then 'cogs'
      when 'return_in' then 'cogs'
      when 'damage' then 'inventory_loss'
      when 'disposal' then 'inventory_loss'
      when 'sample' then 'samples_expense'
      when 'internal_use' then 'supplies_expense'
      when 'adjustment' then case when m.qty > 0 then 'inventory_gain' else 'inventory_loss' end
      when 'count_variance' then case when m.qty > 0 then 'inventory_gain' else 'inventory_loss' end
      when 'receipt' then case
        when m.doc_table = 'opening_stock' then 'opening_equity'
        when m.doc_table = 'stock_receipts' and (select po_id from public.stock_receipts where id = m.doc_id) is not null then 'grni'
        else 'inventory_clearing' end
      else 'inventory_clearing' end; -- production in/out until the manufacturing phase
    lines := jsonb_build_array(
      jsonb_build_object('account', kind, 'debit', case when m.qty > 0 then v else 0 end, 'credit', case when m.qty < 0 then v else 0 end,
                         'description', m.movement_type || ' ' || m.doc_number, 'location_id', m.location_id, 'product_id', m.product_id),
      jsonb_build_object('account', other, 'debit', case when m.qty < 0 then v else 0 end, 'credit', case when m.qty > 0 then v else 0 end,
                         'description', m.movement_type || ' ' || m.doc_number, 'location_id', m.location_id, 'product_id', m.product_id));
    return public.post_journal(d, 'stock', 'stock_movements', m.id::text, initcap(replace(m.movement_type::text, '_', ' ')) || ' ' || m.doc_number, lines, e.id);

  when 'stock.revalued' then
    v := coalesce((e.payload->>'value_change')::numeric, 0);
    if v = 0 then return null; end if;
    lines := jsonb_build_array(
      jsonb_build_object('account', 'inventory', 'debit', greatest(v, 0), 'credit', greatest(-v, 0), 'product_id', e.aggregate_id),
      jsonb_build_object('account', case when v > 0 then 'inventory_gain' else 'inventory_loss' end, 'debit', greatest(-v, 0), 'credit', greatest(v, 0), 'product_id', e.aggregate_id));
    return public.post_journal((e.created_at at time zone 'Asia/Manila')::date, 'revaluation', 'domain_events', e.id::text, 'Cost revaluation', lines, e.id);

  -- ---------------------------------------------------------------- sale released: AR / revenue by brand / output VAT
  when 'sales.order_ready' then
    select * into o from public.sales_orders where id = e.aggregate_id::uuid;
    if o.total <= 0 then return null; end if;
    net_total := 0;
    for r in
      select coalesce(pr.brand_id::text, '') brand, case when pr.item_type = 'service' then 'sales_services' else 'sales' end acct, sum(l.line_total) amt
      from public.sales_order_lines l join public.products pr on pr.id = l.product_id where l.order_id = o.id group by 1, 2
    loop
      v := case when incl then round(r.amt * 100 / (100 + rate), 2) else r.amt end;
      net_total := net_total + v;
      lines := lines || jsonb_build_object('account', r.acct, 'credit', v, 'brand_id', r.brand, 'channel', o.channel, 'location_id', o.location_id, 'customer_id', o.customer_id);
    end loop;
    vat := case when incl then o.total - net_total else round(net_total * rate / 100, 2) end;
    lines := lines
      || jsonb_build_object('account', 'output_vat', 'credit', vat, 'channel', o.channel, 'customer_id', o.customer_id)
      || jsonb_build_object('account', 'ar', 'debit', net_total + vat, 'customer_id', o.customer_id, 'channel', o.channel, 'location_id', o.location_id, 'description', o.number);
    return public.post_journal(coalesce((o.ready_at at time zone 'Asia/Manila')::date, public.manila_today()), 'sale', 'sales_orders', o.id::text, 'Sale ' || o.number, lines, e.id);

  when 'sales.invoice_voided' then -- a return voids the billing invoice: reverse the sale posting
    select id into jid from public.journal_entries where source = 'sale' and source_table = 'sales_orders' and source_id = e.payload->>'order_id' and status = 'posted' and reversed_by is null;
    if jid is null then return null; end if;
    return public.reverse_journal_internal(jid, public.manila_today(), 'Sales return / void ' || coalesce(e.payload->>'number', ''));

  -- ---------------------------------------------------------------- customer payment confirmed: cash/bank / AR
  when 'payment.confirmed' then
    select * into p from public.payments where id = e.aggregate_id::uuid;
    lines := jsonb_build_array(
      jsonb_build_object('account', (select a.code from public.payment_method_accounts pm join public.accounts a on a.id = pm.account_id where pm.method = p.method),
                         'debit', p.amount, 'customer_id', p.customer_id, 'description', p.number || ' ' || p.reference),
      jsonb_build_object('account', 'ar', 'credit', p.amount, 'customer_id', p.customer_id, 'description', p.number));
    return public.post_journal(p.paid_on, 'payment', 'payments', p.id::text, 'Customer payment ' || p.number, lines, e.id);

  -- ---------------------------------------------------------------- supplier invoice ready to pay: GRNI + variance + input VAT / AP
  when 'purchase.invoice_ready' then
    select * into inv from public.supplier_invoices where id = e.aggregate_id::uuid;
    select * into po from public.purchase_orders where id = inv.po_id;
    select * into sup from public.suppliers where id = inv.supplier_id;
    grni := 0;
    for r in
      select il.*, pl.net_amount pl_net, pl.qty pl_qty, pr.item_type
      from public.supplier_invoice_lines il
      left join public.purchase_order_lines pl on pl.id = il.po_line_id
      left join public.products pr on pr.id = coalesce(il.product_id, pl.product_id)
      where il.invoice_id = inv.id
    loop
      if r.po_line_id is not null then
        v := round(r.qty * r.pl_net / nullif(r.pl_qty, 0), 2); -- received value at PO cost (net of VAT)
        grni := grni + v;
        lines := lines || jsonb_build_object('account', 'grni', 'debit', v, 'supplier_id', inv.supplier_id, 'product_id', r.product_id);
      else
        v := case when coalesce(po.vat_inclusive, true) and (sup.vat_registered) then round(r.amount * 100 / (100 + rate), 2) else r.amount end;
        grni := grni + v;
        lines := lines || jsonb_build_object('account', coalesce((select code from public.accounts where id = r.expense_account_id), 'purchase_other'), 'debit', v,
                                             'supplier_id', inv.supplier_id, 'description', r.description);
      end if;
    end loop;
    pv := inv.subtotal - grni; -- price variance (net)
    lines := lines
      || jsonb_build_object('account', 'price_variance', 'debit', greatest(pv, 0), 'credit', greatest(-pv, 0), 'supplier_id', inv.supplier_id)
      || jsonb_build_object('account', 'input_vat', 'debit', inv.vat_amount, 'supplier_id', inv.supplier_id)
      || jsonb_build_object('account', 'ap', 'credit', inv.total, 'supplier_id', inv.supplier_id, 'description', inv.invoice_no);
    return public.post_journal(inv.invoice_date, 'purchase_invoice', 'supplier_invoices', inv.id::text, 'Supplier invoice ' || inv.invoice_no || ' ' || sup.name, lines, e.id);

  when 'purchase.invoice_voided' then
    select id into jid from public.journal_entries where source = 'purchase_invoice' and source_table = 'supplier_invoices' and source_id = e.aggregate_id and status = 'posted' and reversed_by is null;
    if jid is null then return null; end if;
    return public.reverse_journal_internal(jid, public.manila_today(), 'Supplier invoice voided');

  else
    return null; -- not an accounting event (or handled in part 2: supplier payments, petty cash)
  end case;
end $$;
revoke execute on function public.post_event from public, anon, authenticated;

-- Runs for every new event in the same transaction; a failure never blocks the business action: it goes to the
-- unposted queue with the reason, to be fixed (e.g. missing account) and retried.
create or replace function public.post_event_safe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.post_event(new.id);
  exception when others then
    perform set_config('app.posting_engine', 'off', true);
    insert into public.unposted_events (event_id, event_type, error) values (new.id, new.type, sqlerrm)
    on conflict (event_id) do update set error = excluded.error, attempts = public.unposted_events.attempts + 1, last_attempt_at = now();
  end;
  return null;
end $$;
create trigger post_accounting_event after insert on public.domain_events for each row
  when (new.type in ('stock.moved', 'stock.revalued', 'sales.order_ready', 'sales.invoice_voided', 'payment.confirmed',
                     'purchase.invoice_ready', 'purchase.invoice_voided', 'supplier_payment.paid', 'petty_cash.released'))
  execute function public.post_event_safe();
revoke execute on function public.post_event_safe from public, anon, authenticated;

create or replace function public.retry_unposted(p_event bigint default null) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if auth.uid() is not null and not public.has_permission('accounting.journals.create') then raise exception 'You can''t retry postings.'; end if;
  for r in select event_id from public.unposted_events where resolved_at is null and (p_event is null or event_id = p_event) loop
    begin
      perform public.post_event(r.event_id);
      update public.unposted_events set resolved_at = now() where event_id = r.event_id;
      n := n + 1;
    exception when others then
      perform set_config('app.posting_engine', 'off', true);
      update public.unposted_events set error = sqlerrm, attempts = attempts + 1, last_attempt_at = now() where event_id = r.event_id;
    end;
  end loop;
  return n;
end $$;

-- Events the engine needs that earlier phases didn't emit.
create or replace function public.billing_invoice_void_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'void' and old.status <> 'void' then
    perform public.emit_event('sales.invoice_voided', 'billing_invoices', new.id::text, jsonb_build_object('order_id', new.order_id, 'number', new.number));
  end if;
  return null;
end $$;
create trigger billing_invoice_void_event after update of status on public.billing_invoices for each row execute function public.billing_invoice_void_event();

alter table public.supplier_invoice_lines add column expense_account_id uuid references public.accounts(id);
alter table public.supplier_invoices add column paid_amount numeric(18, 2) not null default 0;

create or replace function public.supplier_invoice_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('matched', 'approved') and old.status not in ('matched', 'approved') then
    perform public.emit_event('purchase.invoice_ready', 'supplier_invoices', new.id::text, jsonb_build_object('total', new.total));
  elsif new.status = 'void' and old.status in ('matched', 'approved') then
    perform public.emit_event('purchase.invoice_voided', 'supplier_invoices', new.id::text, '{}');
  end if;
  return null;
end $$;
create trigger supplier_invoice_events after update of status on public.supplier_invoices for each row execute function public.supplier_invoice_events();
revoke execute on function public.billing_invoice_void_event, public.supplier_invoice_events from public, anon, authenticated;

-- PayMongo payments are confirmed by the provider: emit the same event as a finance confirmation.
create or replace function public.record_online_payment(p_order_number text, p_amount numeric, p_provider_id text, p_method text default 'paymongo')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o public.sales_orders;
  pid uuid;
begin
  select id into pid from public.payments where provider_id = p_provider_id;
  if pid is not null then return pid; end if;
  select * into o from public.sales_orders where number = p_order_number;
  if o.id is null then raise exception 'Unknown order %.', p_order_number; end if;
  insert into public.payments (number, customer_id, order_id, method, amount, reference, from_customer, provider_id, status, confirmed_at)
  values ('', o.customer_id, o.id, 'paymongo', p_amount, p_provider_id, true, p_provider_id, 'confirmed', now())
  returning id into pid;
  perform public.apply_payment_to_order(o.id);
  perform public.emit_event('payment.confirmed', 'payments', pid::text, jsonb_build_object('amount', p_amount, 'order_id', o.id, 'customer_id', o.customer_id, 'method', 'paymongo'));
  return pid;
end $$;
revoke execute on function public.record_online_payment from public, anon, authenticated;

-- Non-PO supplier bills: VAT comes from the supplier when there's no PO.
create or replace function public.match_supplier_invoice(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  inv public.supplier_invoices;
  po public.purchase_orders;
  sup public.suppliers;
  l record;
  tol numeric := coalesce((select invoice_price_tolerance_pct from public.app_settings limit 1), 1);
  st text;
  issues text[] := array[]::text[];
  a numeric; sx record; rate numeric; incl boolean;
begin
  if not public.has_permission('procurement.invoices.manage') then raise exception 'You can''t match supplier invoices.'; end if;
  select * into inv from public.supplier_invoices where id = p_id for update;
  if inv.status not in ('draft', 'variance', 'returned') then raise exception 'This invoice was already matched or approved.'; end if;
  if not exists (select 1 from public.supplier_invoice_lines where invoice_id = p_id) then raise exception 'Add the invoice lines first.'; end if;
  select * into po from public.purchase_orders where id = inv.po_id;
  select * into sup from public.suppliers where id = inv.supplier_id;
  rate := coalesce(po.vat_rate, case when sup.vat_registered then coalesce((select vat_rate from public.app_settings limit 1), 12) else 0 end);
  incl := coalesce(po.vat_inclusive, true);
  perform set_config('app.proc_engine', 'on', true);
  for l in
    select il.*, pl.unit_price po_price, pl.received_qty, pl.invoiced_qty, p.sku
    from public.supplier_invoice_lines il
    left join public.purchase_order_lines pl on pl.id = il.po_line_id
    left join public.products p on p.id = coalesce(il.product_id, pl.product_id)
    where il.invoice_id = p_id
  loop
    st := case
      when l.po_line_id is null then 'not_on_po'
      when l.qty > l.received_qty - l.invoiced_qty then 'qty'
      when abs(l.unit_price - l.po_price) > l.po_price * tol / 100 then 'price'
      else 'ok' end;
    update public.supplier_invoice_lines set match_status = st where id = l.id;
    if st = 'qty' then issues := issues || format('%s: billed %s but only %s received and not yet billed', l.sku, trim_scale(l.qty), trim_scale(l.received_qty - l.invoiced_qty)); end if;
    if st = 'price' then issues := issues || format('%s: billed ₱%s vs PO ₱%s', l.sku, trim_scale(l.unit_price), trim_scale(l.po_price)); end if;
    if st = 'not_on_po' then issues := issues || format('"%s" is not on a PO', coalesce(nullif(l.description, ''), l.sku, 'line')); end if;
  end loop;
  select coalesce(sum(amount), 0) into a from public.supplier_invoice_lines where invoice_id = p_id;
  select * into sx from public.vat_split(a, rate, incl);
  update public.supplier_invoices set
    subtotal = case when incl then sx.net else a end,
    vat_amount = sx.vat,
    total = case when incl then a else a + sx.vat end,
    status = case when cardinality(issues) = 0 then 'matched' else 'variance' end,
    match_note = array_to_string(issues, '; ')
  where id = p_id;
  if cardinality(issues) = 0 then
    update public.purchase_order_lines pl set invoiced_qty = invoiced_qty + il.qty
    from public.supplier_invoice_lines il where il.invoice_id = p_id and il.po_line_id = pl.id;
  end if;
  perform set_config('app.proc_engine', 'off', true);
  return case when cardinality(issues) = 0 then 'matched' else 'variance' end;
end $$;

-- A non-PO bill (rent, utilities…) entered straight from the Supplier invoices page.
alter table public.supplier_invoices alter column po_id drop not null;

-- ================================================================ period close and go-live
create or replace function public.close_period(p_month date, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare per public.fiscal_periods; s date := date_trunc('month', p_month)::date; pending int;
begin
  if not public.has_permission('accounting.periods.manage') then raise exception 'Only the finance head can close periods.'; end if;
  if p_status not in ('open', 'closed', 'locked') then raise exception 'Unknown status.'; end if;
  per := public.ensure_period(s);
  if per.status = 'locked' then raise exception 'A locked period can''t be changed.'; end if;
  if p_status <> 'open' then
    select count(*) into pending from public.unposted_events u join public.domain_events e on e.id = u.event_id
    where u.resolved_at is null and e.created_at < (s + interval '1 month');
    if pending > 0 then raise exception '% event(s) up to this month haven''t posted. Fix them first (Accounting → Unposted).', pending; end if;
    if exists (select 1 from public.journal_entries where status in ('draft', 'submitted', 'returned') and entry_date >= s and entry_date < s + interval '1 month') then
      raise exception 'Some manual journals in this month are still drafts or waiting for approval.';
    end if;
  end if;
  update public.fiscal_periods set status = p_status, closed_by = auth.uid(), closed_at = now() where id = per.id;
end $$;

-- Go-live: wipe the parallel-run (test) postings and start the official books on the cut-off date.
create or replace function public.start_books(p_cutoff date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (public.has_permission('accounting.periods.manage') and public.has_permission('accounting.coa.manage')) then
    raise exception 'Only the finance head can start the books.';
  end if;
  if (select books_live_from from public.app_settings limit 1) is not null then raise exception 'The books already started.'; end if;
  if extract(day from p_cutoff) <> 1 then raise exception 'Start the books on the first day of a month.'; end if;
  perform set_config('app.books_reset', 'on', true);
  update public.journal_entries set reversed_by = null where is_test;
  -- bank lines matched to test postings become unmatched (the statement lines themselves are kept)
  if to_regclass('public.bank_statement_lines') is not null then
    execute 'update public.bank_statement_lines s set journal_line_id = null, matched_by = null, matched_at = null
             from public.journal_lines l join public.journal_entries j on j.id = l.entry_id where s.journal_line_id = l.id and j.is_test';
  end if;
  delete from public.journal_entries where is_test;
  get diagnostics n = row_count;
  update public.unposted_events set resolved_at = now() where resolved_at is null;
  update public.app_settings set books_live_from = p_cutoff;
  perform set_config('app.books_reset', 'off', true);
  return n;
end $$;

-- Opening balances (trial balance on the day before the cut-off). p_lines: [{"account": "1030", "debit": 1000, "credit": 0, "customer_id"?, "supplier_id"?}]
create or replace function public.import_opening_balances(p_date date, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('accounting.periods.manage') then raise exception 'Only the finance head can load opening balances.'; end if;
  return public.post_journal(p_date, 'opening', 'opening', p_date::text, 'Opening balances as of ' || p_date, p_lines);
end $$;

-- ================================================================ RLS
alter table public.accounts enable row level security;
alter table public.payment_method_accounts enable row level security;
alter table public.fiscal_periods enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.unposted_events enable row level security;

create policy "accounts: read" on public.accounts for select to authenticated
  using (public.has_permission('accounting.view') or public.has_permission('finance.reports.view') or public.has_permission('procurement.invoices.manage') or public.can_read_all());
create policy "accounts: manage" on public.accounts for all to authenticated
  using (public.has_permission('accounting.coa.manage')) with check (public.has_permission('accounting.coa.manage'));
create policy "payment_method_accounts: read" on public.payment_method_accounts for select to authenticated using (public.has_permission('accounting.view'));
create policy "payment_method_accounts: manage" on public.payment_method_accounts for all to authenticated
  using (public.has_permission('accounting.coa.manage')) with check (public.has_permission('accounting.coa.manage'));
create policy "fiscal_periods: read" on public.fiscal_periods for select to authenticated using (public.has_permission('accounting.view') or public.can_read_all());

create or replace function public.can_view_journal(p_entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.journal_entries j where j.id = p_entry and (
    public.has_permission('accounting.view') or public.can_read_all() or j.created_by = auth.uid()
    or exists (select 1 from public.approval_requests r join public.approval_steps s on s.request_id = r.id
               where r.doc_type = 'journal_entry' and r.record_id = j.id and s.approver_ids && public.my_approver_ids())))
$$;
revoke execute on function public.can_view_journal from public, anon;
grant execute on function public.can_view_journal to authenticated;

create policy "journal_entries: read" on public.journal_entries for select to authenticated
  using (created_by = auth.uid() or public.can_view_journal(id));
create policy "journal_entries: manual draft" on public.journal_entries for all to authenticated
  using (status in ('draft', 'returned') and source = 'manual' and created_by = auth.uid() and public.has_permission('accounting.journals.create'))
  with check (status in ('draft', 'returned', 'cancelled') and source = 'manual' and public.has_permission('accounting.journals.create'));
create policy "journal_lines: read" on public.journal_lines for select to authenticated using (public.can_view_journal(entry_id));
create policy "journal_lines: manual draft" on public.journal_lines for all to authenticated
  using (exists (select 1 from public.journal_entries j where j.id = entry_id and j.status in ('draft', 'returned') and j.created_by = auth.uid() and j.source = 'manual'))
  with check (exists (select 1 from public.journal_entries j where j.id = entry_id and j.status in ('draft', 'returned') and j.created_by = auth.uid() and j.source = 'manual'));
create policy "unposted_events: read" on public.unposted_events for select to authenticated using (public.has_permission('accounting.view'));

revoke execute on function public.reverse_journal, public.submit_journal, public.retry_unposted, public.close_period, public.start_books,
  public.import_opening_balances from public, anon;
grant execute on function public.reverse_journal, public.submit_journal, public.retry_unposted, public.close_period, public.start_books,
  public.import_opening_balances to authenticated;

create trigger touch_accounts before update on public.accounts for each row execute function public.touch_updated_at();

-- Accounts the posting engine uses can be renamed but not repurposed; accounts with postings can't become headings.
create or replace function public.account_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Accounts can''t be deleted. Make it inactive instead.'; end if;
  if old.system_key is not null and (new.active is distinct from true or new.is_header or new.type <> old.type or new.code <> old.code or new.system_key is distinct from old.system_key) then
    raise exception 'Account % is used by automatic postings. It can be renamed, but its code, type and status can''t change.', old.code;
  end if;
  if new.is_header and not old.is_header and exists (select 1 from public.journal_lines where account_id = old.id) then
    raise exception 'Account % has entries, so it can''t become a heading.', old.code;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger account_guard before update or delete on public.accounts for each row execute function public.account_guard();

-- ================================================================ approvals, audit
insert into public.approval_doc_types (doc_type, label, record_table, href_template) values
  ('journal_entry', 'Manual journal entry', 'journal_entries', '/accounting/journals/{{id}}')
on conflict do nothing;
do $$
declare p uuid;
begin
  if not exists (select 1 from public.approval_policies where doc_type = 'journal_entry') then
    insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority) values ('journal_entry', 'Manual journals: CEO', null, null, 10) returning id into p;
    insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', (select id from public.roles where code = 'ceo'));
  end if;
end $$;

select public.enable_audit('accounts', false, array['updated_at']);
select public.enable_audit('payment_method_accounts');
select public.enable_audit('fiscal_periods');
select public.enable_audit('journal_entries', false, array['posted_at']);
insert into public.audit_exempt (table_name, reason) values
  ('journal_lines', 'Lines are immutable once posted; drafts are audited through their entry.'),
  ('unposted_events', 'Technical retry queue for the posting engine.')
on conflict do nothing;
