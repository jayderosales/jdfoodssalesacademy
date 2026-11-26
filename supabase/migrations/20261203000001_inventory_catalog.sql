-- Phase 2 (part 1): product master, units, barcodes, bundles, bins, batches. See docs/specs/inventory.md.

-- ================================================================ permissions
insert into public.permissions (code, module, description, is_restricted) values
  ('inventory.view',            'inventory', 'See products, stock levels and batches', false),
  ('inventory.view_cost',       'inventory', 'See costs and stock values', true),
  ('inventory.products.manage', 'inventory', 'Add and edit products, units, barcodes and bundles', false),
  ('inventory.receive',         'inventory', 'Receive stock into a warehouse', false),
  ('inventory.transfer',        'inventory', 'Dispatch and receive transfers between locations', false),
  ('inventory.adjust.request',  'inventory', 'Request stock adjustments, damage and disposal', false),
  ('inventory.count',           'inventory', 'Create and enter cycle counts', false),
  ('inventory.qa.release',      'inventory', 'Change batch QA status (release, hold, reject)', false),
  ('inventory.reorder.manage',  'inventory', 'Set reorder levels', false)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, x.perm
from (values
  ('warehouse', 'inventory.view'), ('warehouse', 'inventory.receive'), ('warehouse', 'inventory.transfer'),
  ('warehouse', 'inventory.adjust.request'), ('warehouse', 'inventory.count'),
  ('operations_manager', 'inventory.view'), ('operations_manager', 'inventory.view_cost'), ('operations_manager', 'inventory.products.manage'),
  ('operations_manager', 'inventory.receive'), ('operations_manager', 'inventory.transfer'), ('operations_manager', 'inventory.adjust.request'),
  ('operations_manager', 'inventory.count'), ('operations_manager', 'inventory.reorder.manage'),
  ('coo', 'inventory.view'), ('coo', 'inventory.view_cost'), ('coo', 'inventory.products.manage'), ('coo', 'inventory.reorder.manage'),
  ('qa', 'inventory.view'), ('qa', 'inventory.qa.release'),
  ('manufacturing', 'inventory.view'), ('manufacturing', 'inventory.transfer'),
  ('cfo', 'inventory.view'), ('cfo', 'inventory.view_cost'), ('accounting_officer', 'inventory.view'), ('accounting_officer', 'inventory.view_cost'),
  ('sales_head', 'inventory.view'), ('sales_rep', 'inventory.view'), ('cmo', 'inventory.view'),
  ('auditor', 'inventory.view')
) as x(role_code, perm)
join public.roles r on r.code = x.role_code
on conflict do nothing;

-- ================================================================ Academy's training products → academy_products
-- The Academy had a small "products" table of training placeholders. It's renamed so the real product master can use
-- the name; each training product can be linked to a real SKU (product_id) later.
alter table public.products rename to academy_products;
update public.audit_tables set table_name = 'academy_products' where table_name = 'products';
alter trigger audit_products on public.academy_products rename to audit_academy_products;
alter trigger touch_products on public.academy_products rename to touch_academy_products;

-- ================================================================ settings
alter table public.app_settings
  add column near_expiry_days int not null default 60 check (near_expiry_days between 1 and 730),
  add column critical_expiry_days int not null default 30 check (critical_expiry_days between 0 and 365),
  add column slow_moving_days int not null default 90 check (slow_moving_days between 7 and 730);

-- ================================================================ catalog
create type public.item_type as enum ('finished_good', 'raw_material', 'packaging', 'merchandise', 'service', 'bundle');
create type public.storage_condition as enum ('ambient', 'chilled', 'frozen');
create type public.qa_status as enum ('quarantine', 'released', 'on_hold', 'rejected', 'expired');

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  parent_id uuid references public.product_categories(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.units (
  code text primary key check (code ~ '^[a-z]{1,12}$'),
  name text not null,
  kind text not null default 'count' check (kind in ('count', 'weight', 'volume')),
  whole_only boolean not null default true -- quantities must be whole numbers (pieces)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku ~ '^[A-Z0-9][A-Z0-9-]{0,39}$'),
  name text not null check (length(trim(name)) >= 2),
  brand_id uuid references public.brands(id),
  category_id uuid references public.product_categories(id),
  item_type public.item_type not null default 'finished_good',
  base_unit text not null references public.units(code),
  size_label text not null default '',
  shelf_life_days int check (shelf_life_days is null or shelf_life_days between 1 and 3650),
  storage_condition public.storage_condition not null default 'ambient',
  fda_cpr_no text not null default '',
  fda_cpr_expiry date,
  srp numeric(18, 2) check (srp is null or srp >= 0),
  release_on_receipt boolean not null default false, -- skip quarantine (merchandise, packaging)
  track_expiry boolean not null default true,
  pre_order boolean not null default false,
  lead_time_days int check (lead_time_days is null or lead_time_days between 0 and 365),
  sellable_channels text[] not null default array['field_sales', 'phone', 'messenger', 'portal', 'shopify', 'shopee', 'lazada', 'tiktok_shop', 'live_selling', 'walk_in'],
  notes text not null default '',
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index on public.products (brand_id);
create index on public.products (category_id);
create index on public.products (item_type, active);
create index products_name_trgm_idx on public.products (lower(name));

-- Moving weighted-average cost per product (one company). Kept apart so cost visibility can be restricted.
create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  avg_cost numeric(18, 6) not null default 0 check (avg_cost >= 0),
  updated_at timestamptz not null default now()
);

-- Other units for a product: factor = base units per unit (case = 12 bottles).
create table public.product_units (
  product_id uuid not null references public.products(id) on delete cascade,
  unit_code text not null references public.units(code),
  factor numeric(18, 6) not null check (factor > 0),
  primary key (product_id, unit_code)
);
create table public.product_barcodes (
  barcode text primary key check (barcode ~ '^[0-9A-Za-z\-]{4,40}$'),
  product_id uuid not null references public.products(id) on delete cascade,
  unit_code text not null references public.units(code)
);
create index on public.product_barcodes (product_id);

create table public.bundle_components (
  bundle_id uuid not null references public.products(id) on delete cascade,
  component_id uuid not null references public.products(id),
  qty numeric(18, 4) not null check (qty > 0),
  primary key (bundle_id, component_id),
  constraint not_self check (bundle_id <> component_id)
);

-- Only bundles have components; components can't be bundles or services.
create or replace function public.check_bundle_component() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select item_type from public.products where id = new.bundle_id) <> 'bundle' then
    raise exception 'Only bundle products can have components.';
  end if;
  if (select item_type from public.products where id = new.component_id) in ('bundle', 'service') then
    raise exception 'A bundle component must be a stocked product.';
  end if;
  return new;
end $$;
create trigger check_bundle_component before insert or update on public.bundle_components
  for each row execute function public.check_bundle_component();

-- Convert a quantity in any unit of a product to its base unit (4 decimals; whole-only base units must stay whole).
create or replace function public.to_base_qty(p_product uuid, p_unit text, p_qty numeric) returns numeric
language plpgsql stable set search_path = public as $$
declare
  base text;
  f numeric;
  q numeric;
  whole boolean;
begin
  select base_unit into base from public.products where id = p_product;
  if base is null then raise exception 'Unknown product.'; end if;
  if p_unit is null or p_unit = base then
    f := 1;
  else
    select factor into f from public.product_units where product_id = p_product and unit_code = p_unit;
    if f is null then
      -- global weight/volume conversions
      f := case
        when p_unit = 'kg' and base = 'g' then 1000 when p_unit = 'g' and base = 'kg' then 0.001
        when p_unit = 'l' and base = 'ml' then 1000 when p_unit = 'ml' and base = 'l' then 0.001
      end;
    end if;
    if f is null then raise exception 'No conversion from % to % for this product.', p_unit, base; end if;
  end if;
  q := round(p_qty * f, 4);
  select whole_only into whole from public.units where code = base;
  if whole and q <> trunc(q) then
    raise exception '% % is not a whole number of % (the base unit).', p_qty, p_unit, base;
  end if;
  return q;
end $$;
grant execute on function public.to_base_qty to authenticated, service_role;

-- ================================================================ bins
create table public.bins (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{0,29}$'),
  zone text not null default '',
  rack text not null default '',
  kind text not null default 'storage' check (kind in ('storage', 'receiving', 'damaged')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, code)
);
create index on public.bins (location_id);

-- Every stock-holding location gets a DEFAULT and a DAMAGED bin.
create or replace function public.ensure_default_bins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.holds_inventory then
    insert into public.bins (location_id, code, kind) values (new.id, 'DEFAULT', 'storage'), (new.id, 'DAMAGED', 'damaged')
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger ensure_default_bins after insert or update of holds_inventory on public.locations
  for each row execute function public.ensure_default_bins();
revoke execute on function public.ensure_default_bins from public, anon, authenticated;

-- A location is "sellable" when it's a warehouse or pickup hub (the production store isn't).
create or replace function public.location_is_sellable(p_location uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select type in ('warehouse', 'pickup_hub', 'business_center') and holds_inventory from public.locations where id = p_location
$$;
grant execute on function public.location_is_sellable to authenticated, service_role;

-- ================================================================ batches
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  lot_no text not null check (length(trim(lot_no)) >= 1),
  mfg_date date,
  expiry_date date,
  supplier_lot text not null default '',
  qa_status public.qa_status not null default 'quarantine',
  qa_note text not null default '',
  near_expiry_notified_at timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (product_id, lot_no),
  constraint expiry_after_mfg check (expiry_date is null or mfg_date is null or expiry_date >= mfg_date)
);
create index on public.batches (product_id);
create index on public.batches (expiry_date) where qa_status in ('released', 'quarantine', 'on_hold');
create index on public.batches (qa_status);

-- QA status changes only through set_batch_status() (QA permission) or the expiry job.
create or replace function public.guard_batch_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.qa_status is distinct from old.qa_status and coalesce(current_setting('app.batch_status', true), 'off') <> 'on' then
    raise exception 'Batch QA status changes go through QA (Inventory → Batches).';
  end if;
  if new.product_id <> old.product_id or new.lot_no <> old.lot_no then
    raise exception 'A batch''s product and lot number can''t be changed.';
  end if;
  return new;
end $$;
create trigger guard_batch_status before update on public.batches for each row execute function public.guard_batch_status();
revoke execute on function public.guard_batch_status from public, anon, authenticated;

create or replace function public.set_batch_status(p_batch uuid, p_status public.qa_status, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare b public.batches;
begin
  if not public.has_permission('inventory.qa.release') then
    raise exception 'Only QA can change a batch''s status.';
  end if;
  select * into b from public.batches where id = p_batch for update;
  if b.id is null then raise exception 'Batch not found.'; end if;
  if p_status = 'expired' then raise exception 'Batches expire automatically on their expiry date.'; end if;
  if p_status = 'released' and b.expiry_date is not null and b.expiry_date < public.manila_today() then
    raise exception 'This batch is past its expiry date and can''t be released.';
  end if;
  if b.qa_status = 'expired' then raise exception 'Expired batches can''t be changed.'; end if;
  if p_status in ('on_hold', 'rejected') and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Please give a reason.';
  end if;
  perform set_config('app.batch_status', 'on', true);
  update public.batches set qa_status = p_status, qa_note = coalesce(nullif(trim(p_note), ''), qa_note) where id = p_batch;
  perform set_config('app.batch_status', 'off', true);
  perform public.emit_event('batch.status_changed', 'batches', p_batch::text,
    jsonb_build_object('status', p_status, 'lot', b.lot_no, 'product_id', b.product_id));
end $$;
revoke execute on function public.set_batch_status from public, anon;
grant execute on function public.set_batch_status to authenticated;

-- ================================================================ RLS
alter table public.brands enable row level security;
alter table public.product_categories enable row level security;
alter table public.units enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.product_units enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.bundle_components enable row level security;
alter table public.bins enable row level security;
alter table public.batches enable row level security;

-- Catalog: readable by all staff (sales needs it); costs only with inventory.view_cost.
do $$
declare t text;
begin
  foreach t in array array['brands', 'product_categories', 'units', 'products', 'product_units', 'product_barcodes', 'bundle_components'] loop
    execute format('create policy "%1$s: read" on public.%1$I for select to authenticated using (public.is_active_user())', t);
    execute format('create policy "%1$s: manage" on public.%1$I for all to authenticated using (public.has_permission(''inventory.products.manage'')) with check (public.has_permission(''inventory.products.manage''))', t);
  end loop;
end $$;
create policy "product_costs: read" on public.product_costs for select to authenticated
  using (public.has_permission('inventory.view_cost'));
-- (no write policy: costs are maintained by the stock ledger)

create policy "bins: read" on public.bins for select to authenticated
  using (public.has_permission_at('inventory.view', location_id) or public.can_read_all());
create policy "bins: manage" on public.bins for all to authenticated
  using (public.has_permission('admin.org.manage') or public.has_permission('inventory.products.manage'))
  with check (public.has_permission('admin.org.manage') or public.has_permission('inventory.products.manage'));

create policy "batches: read" on public.batches for select to authenticated
  using (public.has_permission('inventory.view') or public.can_read_all());
-- batches are created by receipts/production functions; QA status via set_batch_status()

create trigger touch_products before update on public.products for each row execute function public.touch_updated_at();

-- ================================================================ seeds
insert into public.units (code, name, kind, whole_only) values
  ('pc', 'piece', 'count', true), ('pcs', 'pieces', 'count', true), ('pack', 'pack', 'count', true), ('bottle', 'bottle', 'count', true),
  ('box', 'box', 'count', true), ('case', 'case', 'count', true), ('unit', 'unit', 'count', true), ('set', 'set', 'count', true),
  ('roll', 'roll', 'count', true), ('jar', 'jar', 'count', true), ('layout', 'layout', 'count', true), ('sack', 'sack', 'count', true),
  ('drum', 'drum', 'count', true), ('kg', 'kilogram', 'weight', false), ('g', 'gram', 'weight', false),
  ('l', 'liter', 'volume', false), ('ml', 'milliliter', 'volume', false)
on conflict do nothing;
insert into public.brands (name) values ('JD Foods'), ('ThyChef'), ('McKeith'), ('Arkadia'), ('Catcher Gourmet'), ('Other')
on conflict do nothing;

-- Locations: FG warehouse and production store (names from the price-list address; rename in Organization → Locations).
insert into public.locations (entity_id, code, name, type, holds_inventory, is_pickup_point, address, city)
select e.id, x.code, x.name, x.type::public.location_type, true, x.pickup, 'Unit C-12 C Philasia Pacific Realty and Dev''t Compound, Bulihan', 'Plaridel, Bulacan'
from public.entities e
cross join (values ('PLR-FG', 'Plaridel FG warehouse', 'warehouse', true), ('PLR-PROD', 'Plaridel production store', 'plant', false)) as x(code, name, type, pickup)
where e.code = 'JDF'
on conflict do nothing;
-- bins for locations that existed before the trigger
insert into public.bins (location_id, code, kind)
select l.id, x.code, x.kind from public.locations l cross join (values ('DEFAULT', 'storage'), ('DAMAGED', 'damaged')) as x(code, kind)
where l.holds_inventory
on conflict do nothing;

-- ================================================================ audit
alter table public.academy_products add column product_id uuid references public.products(id) on delete set null;
create index on public.academy_products (product_id);

select public.enable_audit(t) from unnest(array['brands', 'product_categories', 'products', 'product_units', 'product_barcodes',
  'bundle_components', 'bins', 'batches']) as t;
insert into public.audit_exempt (table_name, reason) values
  ('units', 'Reference list, changed only by migrations.'),
  ('product_costs', 'Derived from the stock ledger; every cost change is on a stock movement.')
on conflict do nothing;
