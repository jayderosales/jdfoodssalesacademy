-- Phase 3 (part 1): sales permissions, customers, price lists and customer prices, CRM (leads, activities, field visits).
-- See docs/plans/phase-03.md.

-- ================================================================ permissions
insert into public.permissions (code, module, description, is_restricted) values
  ('sales.view',              'sales', 'See customers, orders and sales figures (own customers unless "view all")', false),
  ('sales.view_all',          'sales', 'See every customer, lead and order', false),
  ('sales.customers.manage',  'sales', 'Add and edit customers', false),
  ('sales.crm',               'sales', 'Work leads, log calls and field visits', false),
  ('sales.orders.create',     'sales', 'Create and place sales orders', false),
  ('sales.orders.discount',   'sales', 'Give discounts or prices below the price list', false),
  ('sales.pricing.manage',    'sales', 'Edit price lists and customer prices', false),
  ('sales.payments.record',   'sales', 'Record customer payments', false),
  ('sales.payments.confirm',  'sales', 'Confirm customer payments (finance)', false),
  ('sales.fulfil',            'sales', 'Pick, pack and hand orders to couriers', false),
  ('sales.invoices.manage',   'sales', 'Billing invoices and official sales invoice register', false)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, x.perm
from (values
  ('sales_rep', 'sales.view'), ('sales_rep', 'sales.customers.manage'), ('sales_rep', 'sales.crm'), ('sales_rep', 'sales.orders.create'),
  ('sales_rep', 'sales.payments.record'),
  ('sales_head', 'sales.view'), ('sales_head', 'sales.view_all'), ('sales_head', 'sales.customers.manage'), ('sales_head', 'sales.crm'),
  ('sales_head', 'sales.orders.create'), ('sales_head', 'sales.orders.discount'), ('sales_head', 'sales.pricing.manage'),
  ('sales_head', 'sales.payments.record'),
  ('operations_manager', 'sales.view'), ('operations_manager', 'sales.view_all'), ('operations_manager', 'sales.orders.create'),
  ('operations_manager', 'sales.fulfil'),
  ('warehouse', 'sales.fulfil'),
  ('coo', 'sales.view'), ('coo', 'sales.view_all'), ('coo', 'sales.fulfil'),
  ('cmo', 'sales.view'), ('cmo', 'sales.view_all'),
  ('accounting_officer', 'sales.view'), ('accounting_officer', 'sales.view_all'), ('accounting_officer', 'sales.payments.record'),
  ('accounting_officer', 'sales.payments.confirm'), ('accounting_officer', 'sales.invoices.manage'),
  ('cfo', 'sales.view'), ('cfo', 'sales.view_all'), ('cfo', 'sales.payments.confirm'), ('cfo', 'sales.invoices.manage'),
  ('cfo', 'sales.pricing.manage')
) as x(role_code, perm)
join public.roles r on r.code = x.role_code
on conflict do nothing;

-- ================================================================ settings and numbering
alter table public.app_settings
  add column shop_location_id uuid references public.locations(id),
  add column unpaid_order_hours int not null default 48 check (unpaid_order_hours between 1 and 720),
  add column shop_payment_instructions text not null default
    'Pay by bank transfer, GCash or Maya, then enter your reference number on the order page. (Placeholder: JD Foods will add the account details here.)',
  add column shop_enabled boolean not null default true,
  add column paymongo_enabled boolean not null default false;
update public.app_settings set shop_location_id = (select id from public.locations where code = 'PLR-FG');

-- Where shop orders ship from: the setting, else the FG warehouse.
create or replace function public.shop_location() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select shop_location_id from public.app_settings limit 1),
                  (select id from public.locations where code = 'PLR-FG'),
                  (select id from public.locations where holds_inventory and type = 'warehouse' order by created_at limit 1))
$$;
revoke execute on function public.shop_location from public, anon, authenticated;

insert into public.number_series (entity_id, doc_type, label, prefix)
select e.id, x.doc_type, x.label, x.prefix
from public.entities e
cross join (values ('customer', 'Customer', 'CUS'), ('lead', 'Lead', 'LD'), ('sales_order', 'Sales order', 'SO'),
                   ('payment', 'Customer payment', 'PAY'), ('billing_invoice', 'Billing invoice', 'BI')) as x(doc_type, label, prefix)
where e.code = 'JDF'
on conflict do nothing;

-- Products get a shop description and photo.
alter table public.products
  add column description text not null default '',
  add column image_url text not null default '' check (image_url = '' or image_url ~ '^https://');

-- ================================================================ price lists
create table public.price_lists (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name text not null,
  is_retail boolean not null default false, -- the SRP list: falls back to products.srp
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.price_list_items (
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  min_qty numeric(18, 4) not null default 1 check (min_qty > 0),
  price numeric(18, 2) not null check (price >= 0),
  valid_from date not null default '2000-01-01',
  valid_to date,
  updated_at timestamptz not null default now(),
  primary key (price_list_id, product_id, min_qty, valid_from),
  constraint valid_range check (valid_to is null or valid_to >= valid_from)
);
create index on public.price_list_items (product_id);

insert into public.price_lists (code, name, is_retail) values
  ('RETAIL', 'Retail (SRP)', true), ('REGULAR', 'Regular customers', false), ('CORPORATE', 'Corporate accounts', false),
  ('DISTRIBUTOR', 'Distributors', false), ('RESELLER', 'Resellers', false)
on conflict do nothing;

-- ================================================================ customers
create type public.customer_type as enum ('retail', 'regular', 'corporate', 'distributor', 'reseller');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(trim(name)) >= 2),
  type public.customer_type not null default 'retail',
  price_list_id uuid references public.price_lists(id),
  mobile text not null default '',
  email text not null default '',
  tin text not null default '',
  payment_terms_days int not null default 0 check (payment_terms_days between 0 and 180), -- 0 = pay before release
  credit_limit numeric(18, 2) not null default 0 check (credit_limit >= 0),
  on_hold boolean not null default false,
  opening_balance numeric(18, 2) not null default 0,
  opening_due_date date,
  owner_id uuid references public.profiles(id) on delete set null, -- assigned sales rep
  user_id uuid unique references public.profiles(id) on delete set null, -- portal / shop account
  source text not null default 'staff',
  notes text not null default '',
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index on public.customers (owner_id);
create index on public.customers (type, active);
create index on public.customers (mobile) where mobile <> '';
create index customers_name_idx on public.customers (lower(name));

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  role text not null default '',
  mobile text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
create index on public.customer_contacts (customer_id);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null default 'Main',
  recipient text not null default '',
  phone text not null default '',
  line text not null,
  city text not null default '',
  province text not null default '',
  zip text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.customer_addresses (customer_id);

create table public.customer_prices (
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric(18, 2) not null check (price >= 0),
  valid_from date not null default '2000-01-01',
  valid_to date,
  updated_at timestamptz not null default now(),
  primary key (customer_id, product_id, valid_from),
  constraint valid_range check (valid_to is null or valid_to >= valid_from)
);
create index on public.customer_prices (product_id);

create or replace function public.customer_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.code, '') = '' then new.code := public.next_document_number('customer'); end if;
  else
    new.updated_at := now();
    new.updated_by := auth.uid();
    -- credit terms are a finance/sales-head decision
    if (new.credit_limit, new.payment_terms_days, new.on_hold) is distinct from (old.credit_limit, old.payment_terms_days, old.on_hold)
       and auth.uid() is not null and not (public.has_permission('sales.view_all') or public.has_permission('sales.payments.confirm')) then
      raise exception 'Only the sales head or finance can change credit terms.';
    end if;
  end if;
  new.mobile := regexp_replace(coalesce(new.mobile, ''), '[^0-9+]', '', 'g');
  if new.price_list_id is null then
    new.price_list_id := (select id from public.price_lists where code = case new.type when 'retail' then 'RETAIL' else upper(new.type::text) end);
  end if;
  return new;
end $$;
create trigger customer_before_write before insert or update on public.customers for each row execute function public.customer_before_write();
revoke execute on function public.customer_before_write from public, anon, authenticated;

-- New customers with credit terms or limits set by a rep start at cash terms.
create or replace function public.customer_credit_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not (public.has_permission('sales.view_all') or public.has_permission('sales.payments.confirm')) then
    new.credit_limit := 0;
    new.payment_terms_days := 0;
  end if;
  return new;
end $$;
create trigger customer_credit_on_insert before insert on public.customers for each row execute function public.customer_credit_on_insert();
revoke execute on function public.customer_credit_on_insert from public, anon, authenticated;

-- ================================================================ price resolution
-- Customer price → customer's price list (highest min_qty ≤ qty) → SRP. Same rules as src/lib/sales/pricing.ts.
create or replace function public.resolve_price(p_customer uuid, p_product uuid, p_qty numeric default 1, p_date date default null)
returns table (price numeric, source text)
language plpgsql stable security definer set search_path = public as $$
declare
  d date := coalesce(p_date, public.manila_today());
  pl uuid;
  v numeric;
begin
  if p_customer is not null then
    select cp.price into v from public.customer_prices cp
    where cp.customer_id = p_customer and cp.product_id = p_product and cp.valid_from <= d and (cp.valid_to is null or cp.valid_to >= d)
    order by cp.valid_from desc limit 1;
    if v is not null then price := v; source := 'customer'; return next; return; end if;
    select price_list_id into pl from public.customers where id = p_customer;
  end if;
  if pl is not null then
    select i.price into v from public.price_list_items i
    where i.price_list_id = pl and i.product_id = p_product and i.min_qty <= coalesce(p_qty, 1)
      and i.valid_from <= d and (i.valid_to is null or i.valid_to >= d)
    order by i.min_qty desc, i.valid_from desc limit 1;
    if v is not null then price := v; source := (select code from public.price_lists where id = pl); return next; return; end if;
  end if;
  select srp into v from public.products where id = p_product;
  if v is null then raise exception 'This product has no price yet.'; end if;
  price := v; source := 'SRP';
  return next;
end $$;
revoke execute on function public.resolve_price from public, anon;
grant execute on function public.resolve_price to authenticated;

-- ================================================================ CRM
create type public.lead_stage as enum ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  name text not null check (length(trim(name)) >= 2),
  company text not null default '',
  mobile text not null default '',
  email text not null default '',
  city text not null default '',
  source text not null default 'referral' check (source in ('referral', 'walk_in', 'facebook', 'website', 'shop', 'event', 'cold_call', 'other')),
  interest text not null default '',
  customer_type public.customer_type not null default 'retail',
  stage public.lead_stage not null default 'new',
  est_value numeric(18, 2) not null default 0 check (est_value >= 0),
  owner_id uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  lost_reason text not null default '',
  next_action text not null default '',
  next_action_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index on public.leads (owner_id, stage);
create index on public.leads (customer_id);
create index on public.leads (next_action_at) where stage not in ('won', 'lost');

create or replace function public.lead_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('lead');
    new.owner_id := coalesce(new.owner_id, auth.uid());
  else
    new.updated_at := now();
    if new.stage is distinct from old.stage then new.stage_changed_at := now(); end if;
  end if;
  if new.stage = 'lost' and length(trim(new.lost_reason)) < 3 then raise exception 'Say why the lead was lost.'; end if;
  return new;
end $$;
create trigger lead_before_write before insert or update on public.leads for each row execute function public.lead_before_write();
revoke execute on function public.lead_before_write from public, anon, authenticated;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('call', 'visit', 'message', 'email', 'meeting', 'note', 'task')),
  subject text not null check (length(trim(subject)) >= 2),
  notes text not null default '',
  outcome text not null default '',
  customer_id uuid references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id),
  due_at timestamptz,
  done_at timestamptz,
  -- field visit check-in (browser geolocation)
  lat numeric(9, 6) check (lat is null or lat between -90 and 90),
  lng numeric(9, 6) check (lng is null or lng between -180 and 180),
  accuracy_m numeric(8, 1),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  constraint has_subject_record check (customer_id is not null or lead_id is not null or kind in ('task', 'note'))
);
create index on public.activities (owner_id, due_at);
create index on public.activities (customer_id, created_at desc);
create index on public.activities (lead_id, created_at desc);

-- Convert a lead into a customer (keeps the lead, marks it won).
create or replace function public.convert_lead(p_lead uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.leads;
  cid uuid;
begin
  select * into l from public.leads where id = p_lead for update;
  if l.id is null then raise exception 'Lead not found.'; end if;
  if not (public.has_permission('sales.crm') and (l.owner_id = auth.uid() or public.has_permission('sales.view_all'))) then
    raise exception 'You can only convert your own leads.';
  end if;
  if l.customer_id is not null then return l.customer_id; end if;
  insert into public.customers (code, name, type, mobile, email, owner_id, source, notes)
  values ('', coalesce(nullif(l.company, ''), l.name), l.customer_type, l.mobile, l.email, coalesce(l.owner_id, auth.uid()), 'lead ' || l.number, l.interest)
  returning id into cid;
  if l.company <> '' then
    insert into public.customer_contacts (customer_id, name, mobile, email) values (cid, l.name, l.mobile, l.email);
  end if;
  update public.leads set customer_id = cid, stage = 'won' where id = p_lead;
  return cid;
end $$;
revoke execute on function public.convert_lead from public, anon;
grant execute on function public.convert_lead to authenticated;

-- ================================================================ RLS
alter table public.price_lists enable row level security;
alter table public.price_list_items enable row level security;
alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.customer_prices enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;

create or replace function public.can_view_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.customers c where c.id = p_customer and (
    public.has_permission('sales.view_all') or public.can_read_all() or c.user_id = auth.uid()
    or (public.has_permission('sales.view') and (c.owner_id = auth.uid() or c.owner_id is null))
    or public.has_permission('sales.fulfil') or public.has_permission('sales.payments.confirm')))
$$;
create or replace function public.can_edit_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.customers c where c.id = p_customer and public.has_permission('sales.customers.manage')
                 and (public.has_permission('sales.view_all') or c.owner_id = auth.uid() or c.owner_id is null))
$$;
revoke execute on function public.can_view_customer, public.can_edit_customer from public, anon;
grant execute on function public.can_view_customer, public.can_edit_customer to authenticated;

create policy "price_lists: read" on public.price_lists for select to authenticated
  using (public.has_permission('sales.view') or public.has_permission('sales.pricing.manage') or public.can_read_all());
create policy "price_lists: manage" on public.price_lists for all to authenticated
  using (public.has_permission('sales.pricing.manage')) with check (public.has_permission('sales.pricing.manage'));
create policy "price_list_items: read" on public.price_list_items for select to authenticated
  using (public.has_permission('sales.view') or public.has_permission('sales.pricing.manage') or public.can_read_all());
create policy "price_list_items: manage" on public.price_list_items for all to authenticated
  using (public.has_permission('sales.pricing.manage')) with check (public.has_permission('sales.pricing.manage'));

-- inline clauses first: a row being inserted isn't visible yet to the helper's own query (insert ... returning)
create policy "customers: read" on public.customers for select to authenticated
  using (public.has_permission('sales.view_all') or created_by = auth.uid() or owner_id = auth.uid() or public.can_view_customer(id));
create policy "customers: insert" on public.customers for insert to authenticated
  with check (public.has_permission('sales.customers.manage') and (owner_id is null or owner_id = auth.uid() or public.has_permission('sales.view_all')));
create policy "customers: update" on public.customers for update to authenticated
  using (public.can_edit_customer(id))
  with check (public.has_permission('sales.customers.manage') and (owner_id is null or owner_id = auth.uid() or public.has_permission('sales.view_all')));

create policy "customer_contacts: read" on public.customer_contacts for select to authenticated using (public.can_view_customer(customer_id));
create policy "customer_contacts: manage" on public.customer_contacts for all to authenticated
  using (public.can_edit_customer(customer_id)) with check (public.can_edit_customer(customer_id));
create policy "customer_addresses: read" on public.customer_addresses for select to authenticated using (public.can_view_customer(customer_id));
create policy "customer_addresses: manage" on public.customer_addresses for all to authenticated
  using (public.can_edit_customer(customer_id)) with check (public.can_edit_customer(customer_id));
create policy "customer_prices: read" on public.customer_prices for select to authenticated
  using (public.has_permission('sales.pricing.manage') or (public.has_permission('sales.view') and public.can_view_customer(customer_id)));
create policy "customer_prices: manage" on public.customer_prices for all to authenticated
  using (public.has_permission('sales.pricing.manage')) with check (public.has_permission('sales.pricing.manage'));

create policy "leads: read" on public.leads for select to authenticated
  using (public.has_permission('sales.view_all') or public.can_read_all() or (public.has_permission('sales.crm') and owner_id = auth.uid()));
create policy "leads: write" on public.leads for all to authenticated
  using (public.has_permission('sales.crm') and (owner_id = auth.uid() or public.has_permission('sales.view_all')))
  with check (public.has_permission('sales.crm') and (owner_id = auth.uid() or public.has_permission('sales.view_all')));

create policy "activities: read" on public.activities for select to authenticated
  using (owner_id = auth.uid() or public.has_permission('sales.view_all') or public.can_read_all());
create policy "activities: write" on public.activities for all to authenticated
  using (public.has_permission('sales.crm') and (owner_id = auth.uid() or public.has_permission('sales.view_all')))
  with check (public.has_permission('sales.crm') and owner_id = auth.uid()
              and (customer_id is null or public.can_view_customer(customer_id)));

create trigger touch_price_list_items before update on public.price_list_items for each row execute function public.touch_updated_at();
create trigger touch_customer_prices before update on public.customer_prices for each row execute function public.touch_updated_at();

-- ================================================================ audit
select public.enable_audit(t) from unnest(array['price_lists', 'price_list_items', 'customer_contacts', 'customer_addresses',
  'customer_prices', 'activities']) as t;
select public.enable_audit('customers', false, array['updated_at', 'updated_by']);
select public.enable_audit('leads', false, array['updated_at', 'stage_changed_at']);
