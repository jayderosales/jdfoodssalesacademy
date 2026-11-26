-- Phase 4: procurement. Suppliers, supplier prices, purchase requests, purchase orders (CEO approval), receiving
-- against a PO through the stock ledger, supplier invoices with 3-way match, supplier performance.
-- Owner answers 2026-11-26: built in-house, CEO approves every PO, local suppliers only (pesos, no landed cost),
-- requests first then POs. See docs/plans/phase-04.md.

-- ================================================================ permissions
insert into public.permissions (code, module, description, is_restricted) values
  ('procurement.view',             'procurement', 'See suppliers, purchase orders and supplier invoices', false),
  ('procurement.request',          'procurement', 'Ask for items to be bought (purchase requests)', false),
  ('procurement.suppliers.manage', 'procurement', 'Add, edit, accredit and block suppliers and their prices', false),
  ('procurement.po.create',        'procurement', 'Create and submit purchase orders', false),
  ('procurement.invoices.manage',  'procurement', 'Record supplier invoices and match them to POs and receipts', false),
  ('procurement.view_bank',        'procurement', 'See supplier bank details', true)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, x.perm
from (values
  ('operations_manager', 'procurement.view'), ('operations_manager', 'procurement.suppliers.manage'), ('operations_manager', 'procurement.po.create'),
  ('coo', 'procurement.view'), ('coo', 'procurement.suppliers.manage'), ('coo', 'procurement.po.create'),
  ('cfo', 'procurement.view'), ('cfo', 'procurement.invoices.manage'), ('cfo', 'procurement.view_bank'),
  ('accounting_officer', 'procurement.view'), ('accounting_officer', 'procurement.invoices.manage'), ('accounting_officer', 'procurement.view_bank'),
  ('warehouse', 'procurement.view'), ('manufacturing', 'procurement.view'), ('qa', 'procurement.view'), ('auditor', 'procurement.view')
) as x(role_code, perm)
join public.roles r on r.code = x.role_code
on conflict do nothing;
-- every staff role can ask for things to be bought
insert into public.role_permissions (role_id, permission_code)
select r.id, 'procurement.request' from public.roles r where r.is_internal and not r.grants_all and r.code not in ('auditor', 'driver')
on conflict do nothing;

-- ================================================================ settings and numbering
alter table public.app_settings
  add column vat_rate numeric(5, 2) not null default 12 check (vat_rate between 0 and 50),
  add column vat_rate_needs_verification boolean not null default true,
  add column po_over_receipt_pct numeric(5, 2) not null default 5 check (po_over_receipt_pct between 0 and 50),
  add column invoice_price_tolerance_pct numeric(5, 2) not null default 1 check (invoice_price_tolerance_pct between 0 and 20);

insert into public.number_series (entity_id, doc_type, label, prefix)
select e.id, x.doc_type, x.label, x.prefix
from public.entities e
cross join (values ('supplier', 'Supplier', 'SUP'), ('purchase_request', 'Purchase request', 'PR'),
                   ('purchase_order', 'Purchase order', 'PO'), ('supplier_invoice', 'Supplier invoice', 'SINV')) as x(doc_type, label, prefix)
where e.code = 'JDF'
on conflict do nothing;

-- ================================================================ suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(trim(name)) >= 2),
  tin text not null default '',
  vat_registered boolean not null default true,
  payment_terms_days int not null default 30 check (payment_terms_days between 0 and 180),
  address text not null default '',
  mobile text not null default '',
  email text not null default '',
  category text not null default '' , -- raw materials, packaging, merchandise, services…
  status text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  status_note text not null default '',
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index suppliers_name_idx on public.suppliers (lower(name));
create index on public.suppliers (status);

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  role text not null default '',
  mobile text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
create index on public.supplier_contacts (supplier_id);

-- Restricted: bank details live apart so only finance can read them.
create table public.supplier_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  bank text not null,
  account_name text not null,
  account_no text not null,
  created_at timestamptz not null default now()
);
create index on public.supplier_bank_accounts (supplier_id);

create table public.supplier_products (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit_code text not null references public.units(code),
  supplier_code text not null default '',
  price numeric(18, 4) not null check (price >= 0), -- per supplier unit, as quoted (VAT-inclusive if the supplier is VAT-registered)
  moq numeric(18, 4) not null default 1 check (moq > 0),
  lead_time_days int check (lead_time_days is null or lead_time_days between 0 and 365),
  last_price numeric(18, 4),
  last_po_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (supplier_id, product_id, unit_code)
);
create index on public.supplier_products (product_id);

create or replace function public.supplier_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.code, '') = '' then new.code := public.next_document_number('supplier'); end if;
    new.status := 'pending';
  else
    new.updated_at := now();
    if new.status is distinct from old.status and new.status = 'blocked' and length(trim(new.status_note)) < 3 then
      raise exception 'Say why the supplier is blocked.';
    end if;
  end if;
  return new;
end $$;
create trigger supplier_before_write before insert or update on public.suppliers for each row execute function public.supplier_before_write();
revoke execute on function public.supplier_before_write from public, anon, authenticated;

-- ================================================================ purchase requests (no approval; the PO is approved)
create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  requested_by uuid not null default auth.uid() references public.profiles(id),
  location_id uuid not null references public.locations(id), -- where it's needed
  needed_by date,
  reason text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'ordered', 'declined', 'cancelled')),
  decline_reason text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.purchase_requests (status, created_at);
create index on public.purchase_requests (requested_by);

create table public.purchase_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  product_id uuid not null references public.products(id),
  unit_code text not null references public.units(code),
  qty numeric(18, 4) not null check (qty > 0),
  notes text not null default '',
  po_line_id uuid -- set when ordered
);
create index on public.purchase_request_lines (request_id);

create or replace function public.purchase_request_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('purchase_request');
    new.requested_by := coalesce(auth.uid(), new.requested_by);
    new.status := 'draft';
    return new;
  end if;
  new.updated_at := now();
  if new.status is distinct from old.status and coalesce(current_setting('app.proc_engine', true), 'off') <> 'on'
     and not (old.status = 'draft' and new.status = 'cancelled') then
    raise exception 'Use the request buttons to change its status.';
  end if;
  return new;
end $$;
create trigger purchase_request_before_write before insert or update on public.purchase_requests
  for each row execute function public.purchase_request_before_write();
revoke execute on function public.purchase_request_before_write from public, anon, authenticated;

create or replace function public.submit_purchase_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.purchase_requests;
begin
  select * into r from public.purchase_requests where id = p_id for update;
  if r.id is null or r.requested_by <> auth.uid() then raise exception 'Only the person who made this request can submit it.'; end if;
  if r.status <> 'draft' then raise exception 'This request was already submitted.'; end if;
  if not exists (select 1 from public.purchase_request_lines where request_id = p_id) then raise exception 'Add at least one item.'; end if;
  perform set_config('app.proc_engine', 'on', true);
  update public.purchase_requests set status = 'submitted', submitted_at = now() where id = p_id;
  perform set_config('app.proc_engine', 'off', true);
  perform public.emit_event('purchase.request_submitted', 'purchase_requests', p_id::text,
    jsonb_build_object('recipients', to_jsonb(public.users_with_role('operations_manager')), 'number', r.number, 'href', '/procurement/requests/' || p_id));
end $$;

create or replace function public.decline_purchase_request(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.purchase_requests;
begin
  if not public.has_permission('procurement.po.create') then raise exception 'Only the buyer can decline requests.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Please give a reason.'; end if;
  select * into r from public.purchase_requests where id = p_id for update;
  if r.status <> 'submitted' then raise exception 'Only submitted requests can be declined.'; end if;
  perform set_config('app.proc_engine', 'on', true);
  update public.purchase_requests set status = 'declined', decline_reason = trim(p_reason) where id = p_id;
  perform set_config('app.proc_engine', 'off', true);
  perform public.emit_event('purchase.request_declined', 'purchase_requests', p_id::text,
    jsonb_build_object('recipients', to_jsonb(array[r.requested_by]), 'number', r.number, 'reason', trim(p_reason), 'href', '/procurement/requests/' || p_id));
end $$;

-- ================================================================ purchase orders
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  supplier_id uuid not null references public.suppliers(id),
  location_id uuid not null references public.locations(id), -- deliver to
  order_date date not null default public.manila_today(),
  expected_date date,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'returned', 'cancelled',
                                                          'sent', 'partly_received', 'received', 'closed')),
  vat_inclusive boolean not null default true, -- prices as quoted include VAT
  vat_rate numeric(5, 2) not null default 12,
  subtotal numeric(18, 2) not null default 0, -- net of VAT
  vat_amount numeric(18, 2) not null default 0,
  total numeric(18, 2) not null default 0,
  payment_terms_days int not null default 30,
  notes text not null default '',
  revision int not null default 0,
  sent_at timestamptz,
  closed_reason text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.purchase_orders (supplier_id, created_at desc);
create index on public.purchase_orders (status, expected_date);
create index on public.purchase_orders (location_id);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  unit_code text not null references public.units(code),
  qty numeric(18, 4) not null check (qty > 0),
  unit_price numeric(18, 4) not null check (unit_price >= 0), -- per unit as quoted
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  amount numeric(18, 2) not null default 0, -- qty × price × (1 − discount), as quoted
  net_amount numeric(18, 2) not null default 0, -- amount without VAT
  received_qty numeric(18, 4) not null default 0, -- in the PO unit
  invoiced_qty numeric(18, 4) not null default 0,
  request_line_id uuid references public.purchase_request_lines(id) on delete set null,
  notes text not null default ''
);
create index on public.purchase_order_lines (po_id);
create index on public.purchase_order_lines (product_id);
alter table public.purchase_request_lines add constraint purchase_request_lines_po_line_fk foreign key (po_line_id) references public.purchase_order_lines(id) on delete set null;

-- VAT maths in one place: amount as quoted → net and VAT.
create or replace function public.vat_split(p_amount numeric, p_rate numeric, p_inclusive boolean, out net numeric, out vat numeric)
language sql immutable set search_path = public as $$
  select case when p_inclusive then round(p_amount * 100 / (100 + p_rate), 2) else round(p_amount, 2) end,
         case when p_inclusive then round(p_amount, 2) - round(p_amount * 100 / (100 + p_rate), 2) else round(p_amount * p_rate / 100, 2) end
$$;

create or replace function public.po_line_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  po public.purchase_orders;
  s record;
begin
  select * into po from public.purchase_orders where id = coalesce(new.po_id, old.po_id);
  if tg_op = 'UPDATE' and coalesce(current_setting('app.proc_engine', true), 'off') = 'on'
     and (new.qty, new.unit_price, new.discount_pct, new.product_id, new.unit_code) is not distinct from (old.qty, old.unit_price, old.discount_pct, old.product_id, old.unit_code) then
    return new; -- received/invoiced quantities updated by the engine
  end if;
  if po.status not in ('draft', 'returned') then raise exception 'PO lines can only be changed while the PO is a draft or returned for changes.'; end if;
  perform public.to_base_qty(new.product_id, new.unit_code, new.qty); -- validates the unit for this product
  new.amount := round(new.qty * new.unit_price * (1 - new.discount_pct / 100), 2);
  select * into s from public.vat_split(new.amount, po.vat_rate, po.vat_inclusive);
  new.net_amount := s.net;
  return new;
end $$;
create trigger po_line_before_write before insert or update on public.purchase_order_lines for each row execute function public.po_line_before_write();

create or replace function public.recalc_po(p_po uuid) returns void
language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders; a numeric; n numeric;
begin
  select * into po from public.purchase_orders where id = p_po;
  select coalesce(sum(amount), 0), coalesce(sum(net_amount), 0) into a, n from public.purchase_order_lines where po_id = p_po;
  perform set_config('app.proc_engine', 'on', true);
  update public.purchase_orders set subtotal = n,
    vat_amount = case when vat_inclusive then a - n else round(n * vat_rate / 100, 2) end,
    total = case when vat_inclusive then a else n + round(n * vat_rate / 100, 2) end
  where id = p_po;
  perform set_config('app.proc_engine', 'off', true);
end $$;

create or replace function public.po_line_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_po(coalesce(new.po_id, old.po_id));
  return null;
end $$;
create trigger po_line_after_write after insert or update or delete on public.purchase_order_lines for each row execute function public.po_line_after_write();

create or replace function public.po_line_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select status from public.purchase_orders where id = old.po_id) not in ('draft', 'returned') then
    raise exception 'PO lines can only be removed while the PO is a draft.';
  end if;
  return old;
end $$;
create trigger po_line_before_delete before delete on public.purchase_order_lines for each row execute function public.po_line_before_delete();

create or replace function public.purchase_order_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sup public.suppliers;
  engine boolean := coalesce(current_setting('app.proc_engine', true), 'off') = 'on'
                 or coalesce(current_setting('app.approval_engine', true), 'off') = 'on';
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('purchase_order');
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'draft';
    select * into sup from public.suppliers where id = new.supplier_id;
    new.vat_rate := case when sup.vat_registered then coalesce((select vat_rate from public.app_settings limit 1), 12) else 0 end;
    new.payment_terms_days := sup.payment_terms_days;
    return new;
  end if;
  new.updated_at := now();
  if new.status is distinct from old.status and not engine and not (old.status in ('draft', 'returned') and new.status = 'cancelled') then
    raise exception 'Use the PO buttons to change its status.';
  end if;
  if not engine and old.status not in ('draft', 'returned')
     and (new.supplier_id, new.location_id, new.vat_inclusive, new.vat_rate, new.total) is distinct from (old.supplier_id, old.location_id, old.vat_inclusive, old.vat_rate, old.total) then
    raise exception 'An approved PO can''t be edited. Use "Revise" to change it (it goes back for approval).';
  end if;
  if not engine and (new.supplier_id is distinct from old.supplier_id) then
    raise exception 'Start a new PO for a different supplier.';
  end if;
  if not engine and (new.vat_inclusive is distinct from old.vat_inclusive or new.vat_rate is distinct from old.vat_rate) then
    raise exception 'VAT settings come from the supplier.';
  end if;
  return new;
end $$;
create trigger purchase_order_before_write before insert or update on public.purchase_orders for each row execute function public.purchase_order_before_write();
revoke execute on function public.po_line_before_write, public.po_line_after_write, public.po_line_before_delete,
  public.purchase_order_before_write, public.recalc_po from public, anon, authenticated;

create or replace function public.set_po_status(p_po uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.proc_engine', 'on', true);
  update public.purchase_orders set status = p_status, sent_at = case when p_status = 'sent' then now() else sent_at end where id = p_po;
  perform set_config('app.proc_engine', 'off', true);
end $$;
revoke execute on function public.set_po_status from public, anon, authenticated;

create or replace function public.submit_purchase_order(p_po uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders; sup public.suppliers;
begin
  select * into po from public.purchase_orders where id = p_po for update;
  if po.id is null or not public.has_permission('procurement.po.create') then raise exception 'You can''t submit purchase orders.'; end if;
  if po.status not in ('draft', 'returned') then raise exception 'This PO was already submitted.'; end if;
  if not exists (select 1 from public.purchase_order_lines where po_id = p_po) then raise exception 'Add at least one item.'; end if;
  select * into sup from public.suppliers where id = po.supplier_id;
  if sup.status <> 'approved' then raise exception 'Supplier % is % and can''t receive purchase orders.', sup.name, sup.status; end if;
  return public.start_approval('purchase_order', p_po, po.total,
    format('PO %s to %s: ₱%s', po.number, sup.name, to_char(po.total, 'FM999,999,990.00')), auth.uid());
end $$;

-- After approval: the buyer sends it to the supplier (email/print happens in the app).
create or replace function public.mark_po_sent(p_po uuid) returns void
language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  if not public.has_permission('procurement.po.create') then raise exception 'You can''t send purchase orders.'; end if;
  select * into po from public.purchase_orders where id = p_po for update;
  if po.status <> 'approved' then raise exception 'Only approved POs can be sent.'; end if;
  perform public.set_po_status(p_po, 'sent');
  update public.supplier_products sp set last_price = l.unit_price, last_po_at = now()
  from public.purchase_order_lines l where l.po_id = p_po and sp.supplier_id = po.supplier_id and sp.product_id = l.product_id and sp.unit_code = l.unit_code;
end $$;

-- Revise an approved/sent PO that has nothing received yet: it goes back to draft for changes and new approval.
create or replace function public.revise_purchase_order(p_po uuid) returns void
language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  if not public.has_permission('procurement.po.create') then raise exception 'You can''t revise purchase orders.'; end if;
  select * into po from public.purchase_orders where id = p_po for update;
  if po.status not in ('approved', 'sent') then raise exception 'Only approved or sent POs can be revised.'; end if;
  if exists (select 1 from public.purchase_order_lines where po_id = p_po and received_qty > 0) then
    raise exception 'Items were already received on this PO. Close it and raise a new one instead.';
  end if;
  perform set_config('app.proc_engine', 'on', true);
  update public.purchase_orders set status = 'draft', revision = revision + 1 where id = p_po;
  perform set_config('app.proc_engine', 'off', true);
end $$;

create or replace function public.cancel_purchase_order(p_po uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  if not public.has_permission('procurement.po.create') then raise exception 'You can''t cancel purchase orders.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Please give a reason.'; end if;
  select * into po from public.purchase_orders where id = p_po for update;
  if po.status in ('partly_received', 'received', 'closed', 'cancelled') then
    raise exception 'A % PO can''t be cancelled. Close it instead.', replace(po.status, '_', ' ');
  end if;
  if po.status = 'submitted' then
    perform public.cancel_approval((select id from public.approval_requests where doc_type = 'purchase_order' and record_id = p_po and status = 'pending' limit 1));
  end if;
  perform set_config('app.proc_engine', 'on', true);
  update public.purchase_orders set status = 'cancelled', closed_reason = trim(p_reason) where id = p_po;
  update public.purchase_request_lines set po_line_id = null where po_line_id in (select id from public.purchase_order_lines where po_id = p_po);
  perform set_config('app.proc_engine', 'off', true);
end $$;

-- Close a partly received PO (the rest won't come).
create or replace function public.close_purchase_order(p_po uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  if not public.has_permission('procurement.po.create') then raise exception 'You can''t close purchase orders.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Please give a reason.'; end if;
  select * into po from public.purchase_orders where id = p_po for update;
  if po.status not in ('sent', 'partly_received', 'received') then raise exception 'Only sent or received POs can be closed.'; end if;
  perform set_config('app.proc_engine', 'on', true);
  update public.purchase_orders set status = 'closed', closed_reason = trim(p_reason) where id = p_po;
  perform set_config('app.proc_engine', 'off', true);
end $$;

-- Turn submitted request lines into a draft PO for one supplier (prices from the supplier price list when known).
create or replace function public.po_from_requests(p_supplier uuid, p_location uuid, p_request_lines uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  l record;
begin
  if not public.has_permission('procurement.po.create') then raise exception 'You can''t create purchase orders.'; end if;
  if coalesce(array_length(p_request_lines, 1), 0) = 0 then raise exception 'Choose at least one requested item.'; end if;
  insert into public.purchase_orders (number, supplier_id, location_id) values ('', p_supplier, p_location) returning id into pid;
  for l in
    select rl.*, r.status r_status from public.purchase_request_lines rl join public.purchase_requests r on r.id = rl.request_id
    where rl.id = any (p_request_lines)
  loop
    if l.r_status <> 'submitted' then raise exception 'Only submitted requests can be ordered.'; end if;
    if l.po_line_id is not null then raise exception 'A requested item was already ordered.'; end if;
    with ins as (
      insert into public.purchase_order_lines (po_id, product_id, unit_code, qty, unit_price, request_line_id, notes)
      values (pid, l.product_id, l.unit_code, l.qty,
              coalesce((select price from public.supplier_products where supplier_id = p_supplier and product_id = l.product_id and unit_code = l.unit_code), 0),
              l.id, l.notes)
      returning id)
    update public.purchase_request_lines set po_line_id = (select id from ins) where id = l.id;
  end loop;
  -- requests whose lines are all ordered become "ordered"
  perform set_config('app.proc_engine', 'on', true);
  update public.purchase_requests r set status = 'ordered'
  where r.status = 'submitted' and r.id in (select request_id from public.purchase_request_lines where id = any (p_request_lines))
    and not exists (select 1 from public.purchase_request_lines x where x.request_id = r.id and x.po_line_id is null);
  perform set_config('app.proc_engine', 'off', true);
  return pid;
end $$;

-- ================================================================ receiving against a PO
alter table public.stock_receipts add column po_id uuid references public.purchase_orders(id);
alter table public.stock_receipt_lines add column po_line_id uuid references public.purchase_order_lines(id);
create index on public.stock_receipts (po_id);
create index on public.stock_receipt_lines (po_line_id);

-- p_lines: [{"po_line_id": "...", "qty": 10, "lot_no": "L1", "expiry_date": "2027-06-30", "mfg_date": null, "bin_id": null}]
create or replace function public.receive_purchase_order(p_po uuid, p_lines jsonb, p_reference text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  po public.purchase_orders;
  sup public.suppliers;
  rid uuid;
  x jsonb;
  pl public.purchase_order_lines;
  q numeric;
  tol numeric := coalesce((select po_over_receipt_pct from public.app_settings limit 1), 5);
  n int := 0;
begin
  select * into po from public.purchase_orders where id = p_po for update;
  if po.id is null then raise exception 'PO not found.'; end if;
  if not public.has_permission_at('inventory.receive', po.location_id) then raise exception 'You can''t receive stock at this location.'; end if;
  if po.status not in ('sent', 'partly_received', 'approved') then raise exception 'Only approved or sent POs can be received (this one is %).', replace(po.status, '_', ' '); end if;
  select * into sup from public.suppliers where id = po.supplier_id;
  insert into public.stock_receipts (number, location_id, supplier_name, reference, po_id, notes)
  values ('', po.location_id, sup.name, coalesce(p_reference, ''), p_po, 'Against ' || po.number) returning id into rid;
  for x in select value from jsonb_array_elements(p_lines) loop
    q := nullif(x->>'qty', '')::numeric;
    if q is null or q = 0 then continue; end if;
    if q < 0 then raise exception 'Received quantities can''t be negative.'; end if;
    select * into pl from public.purchase_order_lines where id = (x->>'po_line_id')::uuid and po_id = p_po for update;
    if pl.id is null then raise exception 'That line isn''t on this PO.'; end if;
    if pl.received_qty + q > pl.qty * (1 + tol / 100) then
      raise exception 'Too much received for % (ordered %, already received %; max % over).',
        (select sku from public.products where id = pl.product_id), trim_scale(pl.qty), trim_scale(pl.received_qty), tol || '%';
    end if;
    n := n + 1;
    -- cost per PO unit, without VAT (input VAT is claimable)
    insert into public.stock_receipt_lines (receipt_id, product_id, unit_code, qty, unit_cost, lot_no, mfg_date, expiry_date, bin_id, po_line_id)
    values (rid, pl.product_id, pl.unit_code, q, round(pl.net_amount / nullif(pl.qty, 0), 6),
            coalesce(x->>'lot_no', ''), nullif(x->>'mfg_date', '')::date, nullif(x->>'expiry_date', '')::date, nullif(x->>'bin_id', '')::uuid, pl.id);
    perform set_config('app.proc_engine', 'on', true);
    update public.purchase_order_lines set received_qty = received_qty + q where id = pl.id;
    perform set_config('app.proc_engine', 'off', true);
  end loop;
  if n = 0 then raise exception 'Enter at least one received quantity.'; end if;
  perform public.post_receipt(rid);
  perform public.set_po_status(p_po, case
    when exists (select 1 from public.purchase_order_lines where po_id = p_po and received_qty < qty) then 'partly_received' else 'received' end);
  perform public.emit_event('purchase.received', 'purchase_orders', p_po::text, jsonb_build_object('number', po.number, 'receipt_id', rid));
  return rid;
end $$;

-- ================================================================ supplier invoices and 3-way match
create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  supplier_id uuid not null references public.suppliers(id),
  po_id uuid references public.purchase_orders(id),
  invoice_no text not null check (length(trim(invoice_no)) >= 1),
  invoice_date date not null,
  due_date date,
  subtotal numeric(18, 2) not null default 0,
  vat_amount numeric(18, 2) not null default 0,
  total numeric(18, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'matched', 'variance', 'submitted', 'approved', 'rejected', 'returned', 'void')),
  match_note text not null default '',
  notes text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, invoice_no)
);
create index on public.supplier_invoices (status, due_date);
create index on public.supplier_invoices (po_id);

create table public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.supplier_invoices(id) on delete cascade,
  po_line_id uuid references public.purchase_order_lines(id),
  product_id uuid references public.products(id),
  description text not null default '',
  qty numeric(18, 4) not null check (qty > 0),
  unit_price numeric(18, 4) not null check (unit_price >= 0), -- as billed (same VAT basis as the PO)
  amount numeric(18, 2) not null default 0,
  match_status text not null default '' check (match_status in ('', 'ok', 'qty', 'price', 'not_on_po'))
);
create index on public.supplier_invoice_lines (invoice_id);
create index on public.supplier_invoice_lines (po_line_id);

create or replace function public.supplier_invoice_line_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select status from public.supplier_invoices where id = new.invoice_id) not in ('draft', 'variance', 'returned')
     and coalesce(current_setting('app.proc_engine', true), 'off') <> 'on' then
    raise exception 'Invoice lines can only be changed before the invoice is matched.';
  end if;
  new.amount := round(new.qty * new.unit_price, 2);
  if new.po_line_id is not null then new.product_id := (select product_id from public.purchase_order_lines where id = new.po_line_id); end if;
  return new;
end $$;
create trigger supplier_invoice_line_before_write before insert or update on public.supplier_invoice_lines
  for each row execute function public.supplier_invoice_line_before_write();

create or replace function public.supplier_invoice_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('supplier_invoice');
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'draft';
    if new.po_id is not null then
      select * into po from public.purchase_orders where id = new.po_id;
      if po.supplier_id <> new.supplier_id then raise exception 'That PO is for another supplier.'; end if;
    end if;
    new.due_date := coalesce(new.due_date, new.invoice_date + (select payment_terms_days from public.suppliers where id = new.supplier_id));
    return new;
  end if;
  new.updated_at := now();
  if new.status is distinct from old.status and coalesce(current_setting('app.proc_engine', true), 'off') <> 'on'
     and coalesce(current_setting('app.approval_engine', true), 'off') <> 'on' then
    raise exception 'Use the invoice buttons to change its status.';
  end if;
  return new;
end $$;
create trigger supplier_invoice_before_write before insert or update on public.supplier_invoices
  for each row execute function public.supplier_invoice_before_write();
revoke execute on function public.supplier_invoice_line_before_write, public.supplier_invoice_before_write from public, anon, authenticated;

-- 3-way match: each invoice line against its PO line (price) and what was received but not yet invoiced (qty).
-- All OK → "matched" (ready to pay); otherwise "variance" (submit for CEO approval or correct the lines).
create or replace function public.match_supplier_invoice(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  inv public.supplier_invoices;
  po public.purchase_orders;
  l record;
  tol numeric := coalesce((select invoice_price_tolerance_pct from public.app_settings limit 1), 1);
  st text;
  issues text[] := array[]::text[];
  a numeric; sx record;
begin
  if not public.has_permission('procurement.invoices.manage') then raise exception 'You can''t match supplier invoices.'; end if;
  select * into inv from public.supplier_invoices where id = p_id for update;
  if inv.status not in ('draft', 'variance', 'returned') then raise exception 'This invoice was already matched or approved.'; end if;
  if not exists (select 1 from public.supplier_invoice_lines where invoice_id = p_id) then raise exception 'Add the invoice lines first.'; end if;
  select * into po from public.purchase_orders where id = inv.po_id;
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
    if st = 'not_on_po' then issues := issues || format('"%s" is not on the PO', coalesce(nullif(l.description, ''), l.sku, 'line')); end if;
  end loop;
  select coalesce(sum(amount), 0) into a from public.supplier_invoice_lines where invoice_id = p_id;
  select * into sx from public.vat_split(a, coalesce(po.vat_rate, 0), coalesce(po.vat_inclusive, true));
  update public.supplier_invoices set
    subtotal = case when coalesce(po.vat_inclusive, true) then sx.net else a end,
    vat_amount = sx.vat,
    total = case when coalesce(po.vat_inclusive, true) then a else a + sx.vat end,
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

-- A variance can be accepted by the CEO (approval engine); approval marks the billed quantities as invoiced.
create or replace function public.submit_invoice_variance(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.supplier_invoices; sup text;
begin
  if not public.has_permission('procurement.invoices.manage') then raise exception 'You can''t submit supplier invoices.'; end if;
  select * into inv from public.supplier_invoices where id = p_id for update;
  if inv.status <> 'variance' then raise exception 'Only invoices with a variance need approval.'; end if;
  select name into sup from public.suppliers where id = inv.supplier_id;
  return public.start_approval('supplier_invoice', p_id, inv.total,
    format('Supplier invoice %s from %s: ₱%s, variance: %s', inv.invoice_no, sup, to_char(inv.total, 'FM999,999,990.00'), left(inv.match_note, 120)), auth.uid());
end $$;

create or replace function public.supplier_invoice_after_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    perform set_config('app.proc_engine', 'on', true);
    update public.purchase_order_lines pl set invoiced_qty = invoiced_qty + il.qty
    from public.supplier_invoice_lines il where il.invoice_id = new.id and il.po_line_id = pl.id;
    perform set_config('app.proc_engine', 'off', true);
  end if;
  return null;
end $$;
create trigger supplier_invoice_after_approval after update of status on public.supplier_invoices
  for each row execute function public.supplier_invoice_after_approval();
revoke execute on function public.supplier_invoice_after_approval from public, anon, authenticated;

create or replace function public.void_supplier_invoice(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare inv public.supplier_invoices;
begin
  if not public.has_permission('procurement.invoices.manage') then raise exception 'You can''t void supplier invoices.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Please give a reason.'; end if;
  select * into inv from public.supplier_invoices where id = p_id for update;
  if inv.status in ('submitted', 'void') then raise exception 'This invoice can''t be voided now.'; end if;
  perform set_config('app.proc_engine', 'on', true);
  if inv.status in ('matched', 'approved') then
    update public.purchase_order_lines pl set invoiced_qty = greatest(0, invoiced_qty - il.qty)
    from public.supplier_invoice_lines il where il.invoice_id = p_id and il.po_line_id = pl.id;
  end if;
  update public.supplier_invoices set status = 'void', notes = trim(notes || ' Void: ' || trim(p_reason)) where id = p_id;
  perform set_config('app.proc_engine', 'off', true);
end $$;

-- ================================================================ supplier performance
create or replace view public.supplier_performance with (security_invoker = true) as
  select s.id as supplier_id, s.name,
         count(distinct po.id) filter (where po.status not in ('draft', 'cancelled', 'rejected')) as po_count,
         coalesce(sum(po.total) filter (where po.status not in ('draft', 'cancelled', 'rejected')), 0) as po_value,
         round(100.0 * count(distinct r.id) filter (where po.expected_date is null or r.received_on <= po.expected_date)
               / nullif(count(distinct r.id), 0), 1) as on_time_pct,
         round(100.0 * sum(pl.received_qty) / nullif(sum(pl.qty) filter (where po.status in ('partly_received', 'received', 'closed')), 0), 1) as fill_pct,
         round(100.0 * count(distinct b.id) filter (where b.qa_status = 'rejected') / nullif(count(distinct b.id), 0), 1) as reject_pct
  from public.suppliers s
  left join public.purchase_orders po on po.supplier_id = s.id
  left join public.purchase_order_lines pl on pl.po_id = po.id
  left join public.stock_receipts r on r.po_id = po.id and r.status = 'posted'
  left join public.stock_receipt_lines rl on rl.receipt_id = r.id
  left join public.batches b on b.product_id = rl.product_id and b.lot_no = coalesce(nullif(rl.lot_no, ''), 'NOLOT')
  group by s.id, s.name;
grant select on public.supplier_performance to authenticated;

-- ================================================================ RLS
alter table public.suppliers enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.supplier_bank_accounts enable row level security;
alter table public.supplier_products enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_lines enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_lines enable row level security;

create policy "suppliers: read" on public.suppliers for select to authenticated
  using (public.has_permission('procurement.view') or public.has_permission('procurement.request') or public.can_read_all());
create policy "suppliers: manage" on public.suppliers for all to authenticated
  using (public.has_permission('procurement.suppliers.manage')) with check (public.has_permission('procurement.suppliers.manage'));
create policy "supplier_contacts: read" on public.supplier_contacts for select to authenticated
  using (public.has_permission('procurement.view') or public.can_read_all());
create policy "supplier_contacts: manage" on public.supplier_contacts for all to authenticated
  using (public.has_permission('procurement.suppliers.manage')) with check (public.has_permission('procurement.suppliers.manage'));
create policy "supplier_bank_accounts: read" on public.supplier_bank_accounts for select to authenticated
  using (public.has_permission('procurement.view_bank'));
create policy "supplier_bank_accounts: manage" on public.supplier_bank_accounts for all to authenticated
  using (public.has_permission('procurement.view_bank') and public.has_permission('procurement.suppliers.manage') or public.has_permission('procurement.invoices.manage') and public.has_permission('procurement.view_bank'))
  with check (public.has_permission('procurement.view_bank'));
create policy "supplier_products: read" on public.supplier_products for select to authenticated
  using (public.has_permission('procurement.view') or public.can_read_all());
create policy "supplier_products: manage" on public.supplier_products for all to authenticated
  using (public.has_permission('procurement.suppliers.manage')) with check (public.has_permission('procurement.suppliers.manage'));

create policy "purchase_requests: read" on public.purchase_requests for select to authenticated
  using (requested_by = auth.uid() or public.has_permission('procurement.po.create') or public.has_permission('procurement.view') or public.can_read_all());
create policy "purchase_requests: own draft" on public.purchase_requests for all to authenticated
  using (requested_by = auth.uid() and status = 'draft' and public.has_permission('procurement.request'))
  with check (requested_by = auth.uid() and status in ('draft', 'cancelled') and public.has_permission('procurement.request'));
create policy "purchase_request_lines: read" on public.purchase_request_lines for select to authenticated
  using (exists (select 1 from public.purchase_requests r where r.id = request_id));
create policy "purchase_request_lines: own draft" on public.purchase_request_lines for all to authenticated
  using (exists (select 1 from public.purchase_requests r where r.id = request_id and r.requested_by = auth.uid() and r.status = 'draft'))
  with check (exists (select 1 from public.purchase_requests r where r.id = request_id and r.requested_by = auth.uid() and r.status = 'draft'));

create or replace function public.can_view_po(p_po uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.purchase_orders po where po.id = p_po and (
    public.has_permission('procurement.view') or public.can_read_all() or po.created_by = auth.uid()
    or public.has_permission_at('inventory.receive', po.location_id)
    or exists (select 1 from public.approval_requests r join public.approval_steps s on s.request_id = r.id
               where r.doc_type = 'purchase_order' and r.record_id = po.id and s.approver_ids && public.my_approver_ids())))
$$;
revoke execute on function public.can_view_po from public, anon;
grant execute on function public.can_view_po to authenticated;

create policy "purchase_orders: read" on public.purchase_orders for select to authenticated
  using (created_by = auth.uid() or public.can_view_po(id));
create policy "purchase_orders: draft" on public.purchase_orders for all to authenticated
  using (status in ('draft', 'returned') and public.has_permission('procurement.po.create'))
  with check (status in ('draft', 'returned', 'cancelled') and public.has_permission('procurement.po.create'));
create policy "purchase_order_lines: read" on public.purchase_order_lines for select to authenticated using (public.can_view_po(po_id));
create policy "purchase_order_lines: draft" on public.purchase_order_lines for all to authenticated
  using (public.has_permission('procurement.po.create') and exists (select 1 from public.purchase_orders po where po.id = po_id and po.status in ('draft', 'returned')))
  with check (public.has_permission('procurement.po.create') and exists (select 1 from public.purchase_orders po where po.id = po_id and po.status in ('draft', 'returned')));

create or replace function public.can_view_supplier_invoice(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.supplier_invoices i where i.id = p_id and (
    public.has_permission('procurement.invoices.manage') or public.has_permission('procurement.view') or public.can_read_all()
    or exists (select 1 from public.approval_requests r join public.approval_steps s on s.request_id = r.id
               where r.doc_type = 'supplier_invoice' and r.record_id = i.id and s.approver_ids && public.my_approver_ids())))
$$;
revoke execute on function public.can_view_supplier_invoice from public, anon;
grant execute on function public.can_view_supplier_invoice to authenticated;

create policy "supplier_invoices: read" on public.supplier_invoices for select to authenticated
  using (created_by = auth.uid() or public.can_view_supplier_invoice(id));
create policy "supplier_invoices: edit" on public.supplier_invoices for all to authenticated
  using (status in ('draft', 'variance', 'returned') and public.has_permission('procurement.invoices.manage'))
  with check (status in ('draft', 'variance', 'returned') and public.has_permission('procurement.invoices.manage'));
create policy "supplier_invoice_lines: read" on public.supplier_invoice_lines for select to authenticated using (public.can_view_supplier_invoice(invoice_id));
create policy "supplier_invoice_lines: edit" on public.supplier_invoice_lines for all to authenticated
  using (public.has_permission('procurement.invoices.manage') and exists (select 1 from public.supplier_invoices i where i.id = invoice_id and i.status in ('draft', 'variance', 'returned')))
  with check (public.has_permission('procurement.invoices.manage') and exists (select 1 from public.supplier_invoices i where i.id = invoice_id and i.status in ('draft', 'variance', 'returned')));

revoke execute on function public.submit_purchase_request, public.decline_purchase_request, public.submit_purchase_order, public.mark_po_sent,
  public.revise_purchase_order, public.cancel_purchase_order, public.close_purchase_order, public.po_from_requests,
  public.receive_purchase_order, public.match_supplier_invoice, public.submit_invoice_variance, public.void_supplier_invoice from public, anon;
grant execute on function public.submit_purchase_request, public.decline_purchase_request, public.submit_purchase_order, public.mark_po_sent,
  public.revise_purchase_order, public.cancel_purchase_order, public.close_purchase_order, public.po_from_requests,
  public.receive_purchase_order, public.match_supplier_invoice, public.submit_invoice_variance, public.void_supplier_invoice to authenticated;

create trigger touch_supplier_products before update on public.supplier_products for each row execute function public.touch_updated_at();

-- ================================================================ approvals, attachments, notifications
insert into public.approval_doc_types (doc_type, label, record_table, href_template) values
  ('purchase_order', 'Purchase order', 'purchase_orders', '/procurement/orders/{{id}}'),
  ('supplier_invoice', 'Supplier invoice variance', 'supplier_invoices', '/procurement/invoices/{{id}}')
on conflict do nothing;
do $$
declare p uuid; dt text;
begin
  foreach dt in array array['purchase_order', 'supplier_invoice'] loop
    if not exists (select 1 from public.approval_policies where doc_type = dt) then
      insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority)
      values (dt, case dt when 'purchase_order' then 'Purchase orders: CEO' else 'Invoice variances: CEO' end, null, null, 10) returning id into p;
      insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', (select id from public.roles where code = 'ceo'));
    end if;
  end loop;
end $$;

create or replace function public.can_view_supplier(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.suppliers where id = p_id) and (public.has_permission('procurement.view') or public.can_read_all())
$$;
create or replace function public.can_edit_supplier(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.suppliers where id = p_id) and public.has_permission('procurement.suppliers.manage')
$$;
revoke execute on function public.can_view_supplier, public.can_edit_supplier from public, anon;
grant execute on function public.can_view_supplier, public.can_edit_supplier to authenticated;

insert into public.attachment_sources (record_table, can_view_function, can_attach_function) values
  ('purchase_orders', 'can_view_po', 'can_view_po'),
  ('suppliers', 'can_view_supplier', 'can_edit_supplier'),
  ('supplier_invoices', 'can_view_supplier_invoice', 'can_view_supplier_invoice')
on conflict do nothing;

insert into public.notification_rules (event_type, label, title_template, body_template, href_template, email) values
  ('purchase.request_submitted', 'A purchase request needs ordering', 'Purchase request {{number}}', 'Turn it into a PO or decline it.', '{{href}}', false),
  ('purchase.request_declined', 'Your purchase request was declined', 'Request {{number}} declined', '{{reason}}', '{{href}}', false)
on conflict do nothing;

-- ================================================================ audit
select public.enable_audit(t) from unnest(array['supplier_contacts', 'supplier_products', 'purchase_request_lines', 'purchase_order_lines',
  'supplier_invoice_lines']) as t;
select public.enable_audit('suppliers', false, array['updated_at']);
select public.enable_audit('supplier_bank_accounts', true);
select public.enable_audit('purchase_requests', false, array['updated_at']);
select public.enable_audit('purchase_orders', false, array['updated_at', 'subtotal', 'vat_amount']);
select public.enable_audit('supplier_invoices', false, array['updated_at']);
