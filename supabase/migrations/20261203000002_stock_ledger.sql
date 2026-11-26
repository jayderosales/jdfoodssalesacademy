-- Phase 2 (part 2): stock ledger, balances, moving weighted-average cost, reservations (FEFO), expiry, reorder alerts.
-- Rules: docs/specs/inventory.md. All stock changes go through post_stock_movement(); nothing else writes balances.

create type public.movement_type as enum (
  'receipt', 'return_in', 'production_output', 'transfer_in', 'count_variance', 'adjustment',
  'production_issue', 'sale_dispatch', 'transfer_out', 'sample', 'internal_use', 'damage', 'disposal'
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.locations(id),
  bin_id uuid not null references public.bins(id),
  batch_id uuid not null references public.batches(id),
  qty numeric(18, 4) not null check (qty <> 0),
  movement_type public.movement_type not null,
  doc_table text not null default '',
  doc_id uuid,
  doc_number text not null default '',
  reason text not null default '',
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (product_id, created_at desc);
create index on public.stock_movements (location_id, created_at desc);
create index on public.stock_movements (batch_id);
create index on public.stock_movements (doc_table, doc_id);
create index stock_movements_outbound_idx on public.stock_movements (product_id, created_at desc) where qty < 0;

-- Cost side of each movement (restricted to inventory.view_cost).
create table public.stock_movement_costs (
  movement_id bigint primary key references public.stock_movements(id),
  unit_cost numeric(18, 6) not null check (unit_cost >= 0),
  value numeric(18, 2) not null,
  avg_cost_after numeric(18, 6) not null
);

create table public.stock_balances (
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.locations(id),
  bin_id uuid not null references public.bins(id),
  batch_id uuid not null references public.batches(id),
  on_hand numeric(18, 4) not null default 0 check (on_hand >= 0),
  reserved numeric(18, 4) not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id, bin_id, batch_id),
  constraint reserved_within_on_hand check (reserved <= on_hand)
);
create index on public.stock_balances (location_id);
create index on public.stock_balances (batch_id);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.locations(id),
  bin_id uuid not null references public.bins(id),
  batch_id uuid not null references public.batches(id),
  qty numeric(18, 4) not null check (qty > 0),
  source_table text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  released_at timestamptz
);
create index reservations_open_idx on public.reservations (source_table, source_id) where released_at is null;

alter table public.stock_movements enable row level security;
alter table public.stock_movement_costs enable row level security;
alter table public.stock_balances enable row level security;
alter table public.reservations enable row level security;

create policy "stock_movements: read" on public.stock_movements for select to authenticated
  using (public.has_permission_at('inventory.view', location_id) or public.can_read_all());
create policy "stock_movement_costs: read" on public.stock_movement_costs for select to authenticated
  using (public.has_permission('inventory.view_cost'));
create policy "stock_balances: read" on public.stock_balances for select to authenticated
  using (public.has_permission_at('inventory.view', location_id) or public.can_read_all());
create policy "reservations: read" on public.reservations for select to authenticated
  using (public.has_permission_at('inventory.view', location_id) or public.can_read_all());
-- No write policies anywhere: only the functions below change stock.

-- The ledger is append-only, even for the service role.
create or replace function public.stock_ledger_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Stock movements can''t be changed or deleted. Post a correcting movement instead.';
end $$;
create trigger stock_movements_immutable before update or delete on public.stock_movements
  for each row execute function public.stock_ledger_immutable();
create trigger stock_movement_costs_immutable before update or delete on public.stock_movement_costs
  for each row execute function public.stock_ledger_immutable();
revoke execute on function public.stock_ledger_immutable from public, anon, authenticated;

-- ================================================================ posting
-- Internal: called only by document functions that already checked the caller's permission.
-- p_qty is signed and in the product's base unit. p_unit_cost: required for receipts of an item with no average yet;
-- otherwise the current average is used. Returns the movement id.
create or replace function public.post_stock_movement(
  p_product uuid, p_location uuid, p_bin uuid, p_batch uuid, p_qty numeric, p_type public.movement_type,
  p_unit_cost numeric default null, p_doc_table text default '', p_doc_id uuid default null, p_doc_number text default '',
  p_reason text default ''
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  prod public.products;
  loc public.locations;
  b public.bins;
  bt public.batches;
  bal public.stock_balances;
  cost public.product_costs;
  total_qty numeric;
  unit_cost numeric;
  new_avg numeric;
  mid bigint;
  incoming boolean := p_qty > 0;
  cost_bearing boolean := p_type in ('receipt', 'return_in', 'production_output');
begin
  if p_qty is null or p_qty = 0 then raise exception 'Quantity must not be zero.'; end if;
  if p_type in ('receipt', 'return_in', 'production_output', 'transfer_in') and p_qty < 0 then
    raise exception '% must be a positive quantity.', p_type;
  end if;
  if p_type in ('production_issue', 'sale_dispatch', 'transfer_out', 'sample', 'internal_use', 'damage', 'disposal') and p_qty > 0 then
    raise exception '% must be a negative quantity.', p_type;
  end if;

  select * into prod from public.products where id = p_product;
  if prod.id is null then raise exception 'Unknown product.'; end if;
  if prod.item_type in ('service', 'bundle') then raise exception '% is a %, which doesn''t hold stock.', prod.sku, prod.item_type; end if;
  select * into loc from public.locations where id = p_location;
  if not coalesce(loc.holds_inventory, false) then raise exception 'This location doesn''t hold inventory.'; end if;
  select * into b from public.bins where id = p_bin;
  if b.id is null or b.location_id <> p_location then raise exception 'That bin isn''t in this location.'; end if;
  select * into bt from public.batches where id = p_batch;
  if bt.id is null or bt.product_id <> p_product then raise exception 'That batch belongs to another product.'; end if;
  if p_qty <> trunc(p_qty) and (select whole_only from public.units where code = prod.base_unit) then
    raise exception 'Quantity must be a whole number of %.', prod.base_unit;
  end if;

  -- QA gate: non-released stock can't be dispatched, transferred out, sampled or used.
  if p_type in ('sale_dispatch', 'transfer_out', 'sample', 'internal_use', 'production_issue') and bt.qa_status <> 'released' then
    raise exception 'Batch % is % and can''t be moved or used until QA releases it.', bt.lot_no, bt.qa_status;
  end if;
  if p_type = 'transfer_in' and bt.qa_status <> 'released' then
    raise exception 'Batch % is % and can''t be transferred.', bt.lot_no, bt.qa_status;
  end if;

  -- Lock (or create) the balance row.
  insert into public.stock_balances (product_id, location_id, bin_id, batch_id) values (p_product, p_location, p_bin, p_batch)
  on conflict do nothing;
  select * into bal from public.stock_balances
  where product_id = p_product and location_id = p_location and bin_id = p_bin and batch_id = p_batch for update;
  if bal.on_hand + p_qty < 0 then
    raise exception 'Not enough stock of % (lot %) in this bin: % on hand, % requested.', prod.sku, bt.lot_no, trim_scale(bal.on_hand), trim_scale(-p_qty);
  end if;
  if bal.on_hand + p_qty < bal.reserved then
    raise exception 'That would take reserved stock of % (lot %). Release the reservation first.', prod.sku, bt.lot_no;
  end if;

  -- Moving weighted average (one company-wide average per product).
  insert into public.product_costs (product_id) values (p_product) on conflict do nothing;
  select * into cost from public.product_costs where product_id = p_product for update;
  select coalesce(sum(on_hand), 0) into total_qty from public.stock_balances where product_id = p_product;

  if incoming and (cost_bearing or (p_unit_cost is not null and p_type in ('count_variance', 'adjustment'))) then
    unit_cost := coalesce(p_unit_cost, nullif(cost.avg_cost, 0));
    if unit_cost is null then
      raise exception 'Enter a unit cost for % (it has no average cost yet).', prod.sku;
    end if;
    if unit_cost < 0 then raise exception 'Unit cost can''t be negative.'; end if;
    new_avg := case when total_qty + p_qty > 0 then (total_qty * cost.avg_cost + p_qty * unit_cost) / (total_qty + p_qty) else unit_cost end;
  else
    unit_cost := cost.avg_cost;
    if incoming and unit_cost = 0 and p_type in ('count_variance', 'adjustment') then
      raise exception 'Enter a unit cost for % (it has no average cost yet).', prod.sku;
    end if;
    new_avg := cost.avg_cost;
  end if;

  insert into public.stock_movements (product_id, location_id, bin_id, batch_id, qty, movement_type, doc_table, doc_id, doc_number, reason)
  values (p_product, p_location, p_bin, p_batch, p_qty, p_type, coalesce(p_doc_table, ''), p_doc_id, coalesce(p_doc_number, ''), coalesce(p_reason, ''))
  returning id into mid;
  insert into public.stock_movement_costs (movement_id, unit_cost, value, avg_cost_after)
  values (mid, round(unit_cost, 6), round(p_qty * unit_cost, 2), round(new_avg, 6));

  update public.stock_balances set on_hand = on_hand + p_qty, updated_at = now()
  where product_id = p_product and location_id = p_location and bin_id = p_bin and batch_id = p_batch;
  update public.product_costs set avg_cost = round(new_avg, 6), updated_at = now() where product_id = p_product;

  perform public.emit_event('stock.moved', 'stock_movements', mid::text,
    jsonb_build_object('product_id', p_product, 'location_id', p_location, 'batch_id', p_batch, 'qty', p_qty,
                       'type', p_type, 'unit_cost', round(unit_cost, 6), 'doc_table', p_doc_table, 'doc_id', p_doc_id));
  perform public.check_reorder(p_product, p_location);
  return mid;
end $$;
revoke execute on function public.post_stock_movement from public, anon, authenticated;

-- ================================================================ availability and reservations
-- Available-to-sell per product per location: released, unexpired batches in storage bins, minus reservations.
create or replace view public.stock_available with (security_invoker = true) as
  select sb.product_id, sb.location_id, sum(sb.on_hand - sb.reserved) as available, sum(sb.on_hand) as on_hand, sum(sb.reserved) as reserved
  from public.stock_balances sb
  join public.batches bt on bt.id = sb.batch_id
  join public.bins bn on bn.id = sb.bin_id
  where bt.qa_status = 'released' and (bt.expiry_date is null or bt.expiry_date >= public.manila_today()) and bn.kind = 'storage'
  group by sb.product_id, sb.location_id;
grant select on public.stock_available to authenticated;

-- FEFO: earliest expiry first (no-expiry last), then oldest received. Locks rows; all-or-nothing.
create or replace function public.reserve_stock(p_product uuid, p_location uuid, p_qty numeric, p_source_table text, p_source_id uuid, p_min_days_left int default 0)
returns table (batch_id uuid, bin_id uuid, qty numeric, lot_no text, expiry_date date)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  remaining numeric := p_qty;
  r record;
  take numeric;
begin
  if p_qty <= 0 then raise exception 'Quantity to reserve must be positive.'; end if;
  for r in
    select sb.batch_id, sb.bin_id, sb.on_hand - sb.reserved as free, bt.lot_no, bt.expiry_date
    from public.stock_balances sb
    join public.batches bt on bt.id = sb.batch_id
    join public.bins bn on bn.id = sb.bin_id
    where sb.product_id = p_product and sb.location_id = p_location and bn.kind = 'storage'
      and bt.qa_status = 'released'
      and (bt.expiry_date is null or bt.expiry_date >= public.manila_today() + coalesce(p_min_days_left, 0))
      and sb.on_hand - sb.reserved > 0
    order by bt.expiry_date nulls last, bt.received_at, bt.lot_no
    for update of sb
  loop
    exit when remaining <= 0;
    take := least(remaining, r.free);
    update public.stock_balances set reserved = reserved + take, updated_at = now()
    where product_id = p_product and location_id = p_location and bin_id = r.bin_id and batch_id = r.batch_id;
    insert into public.reservations (product_id, location_id, bin_id, batch_id, qty, source_table, source_id)
    values (p_product, p_location, r.bin_id, r.batch_id, take, p_source_table, p_source_id);
    batch_id := r.batch_id; bin_id := r.bin_id; qty := take; lot_no := r.lot_no; expiry_date := r.expiry_date;
    return next;
    remaining := remaining - take;
  end loop;
  if remaining > 0 then
    raise exception 'Only % available to reserve; % requested.', trim_scale(p_qty - remaining), trim_scale(p_qty);
  end if;
end $$;
revoke execute on function public.reserve_stock from public, anon, authenticated;

create or replace function public.release_reservations(p_source_table text, p_source_id uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  r public.reservations;
  total numeric := 0;
begin
  for r in select * from public.reservations where source_table = p_source_table and source_id = p_source_id and released_at is null for update loop
    update public.stock_balances set reserved = greatest(0, reserved - r.qty), updated_at = now()
    where product_id = r.product_id and location_id = r.location_id and bin_id = r.bin_id and batch_id = r.batch_id;
    update public.reservations set released_at = now() where id = r.id;
    total := total + r.qty;
  end loop;
  return total;
end $$;
revoke execute on function public.release_reservations from public, anon, authenticated;

-- ================================================================ reorder levels and alerts
create table public.reorder_rules (
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  min_qty numeric(18, 4) not null default 0 check (min_qty >= 0),
  max_qty numeric(18, 4) not null default 0 check (max_qty >= 0),
  safety_qty numeric(18, 4) not null default 0 check (safety_qty >= 0),
  lead_time_days int not null default 7 check (lead_time_days between 0 and 365),
  alerted_at timestamptz, -- set when available drops to/below min; cleared when it recovers
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id),
  constraint max_over_min check (max_qty >= min_qty)
);
alter table public.reorder_rules enable row level security;
create policy "reorder_rules: read" on public.reorder_rules for select to authenticated
  using (public.has_permission_at('inventory.view', location_id) or public.can_read_all());
create policy "reorder_rules: manage" on public.reorder_rules for all to authenticated
  using (public.has_permission_at('inventory.reorder.manage', location_id))
  with check (public.has_permission_at('inventory.reorder.manage', location_id));

create or replace function public.check_reorder(p_product uuid, p_location uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  rule public.reorder_rules;
  avail numeric;
  prod public.products;
begin
  select * into rule from public.reorder_rules where product_id = p_product and location_id = p_location;
  if rule.product_id is null or rule.min_qty = 0 then return; end if;
  select coalesce(sum(available), 0) into avail from public.stock_available where product_id = p_product and location_id = p_location;
  if avail <= rule.min_qty and rule.alerted_at is null then
    update public.reorder_rules set alerted_at = now() where product_id = p_product and location_id = p_location;
    select * into prod from public.products where id = p_product;
    perform public.emit_event('stock.reorder_needed', 'products', p_product::text,
      jsonb_build_object('recipients', to_jsonb(public.users_with_role('operations_manager') || public.users_with_role('coo')),
                         'sku', prod.sku, 'name', prod.name, 'available', avail, 'min', rule.min_qty,
                         'location', (select name from public.locations where id = p_location), 'href', '/inventory/reorder'));
  elsif avail > rule.min_qty and rule.alerted_at is not null then
    update public.reorder_rules set alerted_at = null where product_id = p_product and location_id = p_location;
  end if;
end $$;
revoke execute on function public.check_reorder from public, anon, authenticated;

-- Suggestions: max − available (on order comes with Phase 4).
create or replace view public.reorder_suggestions with (security_invoker = true) as
  select r.product_id, r.location_id, p.sku, p.name, l.name as location_name, r.min_qty, r.max_qty, r.safety_qty, r.lead_time_days,
         coalesce(a.available, 0) as available, 0::numeric as on_order,
         greatest(0, r.max_qty - coalesce(a.available, 0)) as suggested_qty
  from public.reorder_rules r
  join public.products p on p.id = r.product_id and p.active
  join public.locations l on l.id = r.location_id
  left join public.stock_available a on a.product_id = r.product_id and a.location_id = r.location_id
  where coalesce(a.available, 0) <= r.min_qty and r.min_qty > 0;
grant select on public.reorder_suggestions to authenticated;

-- ================================================================ expiry jobs (pg_cron, Manila night)
create or replace function public.expire_batches() returns int
language plpgsql security definer set search_path = public as $$
declare
  b record;
  n int := 0;
  wh uuid[] := public.users_with_role('warehouse') || public.users_with_role('operations_manager');
begin
  for b in
    select bt.id, bt.lot_no, p.sku, p.name, coalesce(sum(sb.on_hand), 0) as qty
    from public.batches bt join public.products p on p.id = bt.product_id
    left join public.stock_balances sb on sb.batch_id = bt.id
    where bt.expiry_date < public.manila_today() and bt.qa_status in ('quarantine', 'released', 'on_hold')
    group by bt.id, bt.lot_no, p.sku, p.name
  loop
    perform set_config('app.batch_status', 'on', true);
    update public.batches set qa_status = 'expired' where id = b.id;
    perform set_config('app.batch_status', 'off', true);
    if b.qty > 0 then
      perform public.emit_event('batch.expired', 'batches', b.id::text,
        jsonb_build_object('recipients', to_jsonb(wh), 'sku', b.sku, 'name', b.name, 'lot', b.lot_no, 'qty', b.qty, 'href', '/inventory/batches?status=expired'));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.notify_near_expiry() returns int
language plpgsql security definer set search_path = public as $$
declare
  days int := coalesce((select near_expiry_days from public.app_settings limit 1), 60);
  b record;
  n int := 0;
  who uuid[] := public.users_with_role('warehouse') || public.users_with_role('operations_manager')
                || public.users_with_role('sales_head');
begin
  for b in
    select bt.id, bt.lot_no, bt.expiry_date, p.sku, p.name, sum(sb.on_hand) as qty
    from public.batches bt join public.products p on p.id = bt.product_id
    join public.stock_balances sb on sb.batch_id = bt.id
    where bt.qa_status = 'released' and bt.near_expiry_notified_at is null
      and bt.expiry_date between public.manila_today() and public.manila_today() + days
    group by bt.id, bt.lot_no, bt.expiry_date, p.sku, p.name
    having sum(sb.on_hand) > 0
  loop
    update public.batches set near_expiry_notified_at = now() where id = b.id;
    perform public.emit_event('batch.near_expiry', 'batches', b.id::text,
      jsonb_build_object('recipients', to_jsonb(who), 'sku', b.sku, 'name', b.name, 'lot', b.lot_no,
                         'expiry', to_char(b.expiry_date, 'Mon DD, YYYY'), 'qty', b.qty, 'href', '/inventory/batches?expiring=1'));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.expire_batches, public.notify_near_expiry from public, anon, authenticated;

insert into public.notification_rules (event_type, label, title_template, body_template, href_template, email, priority) values
  ('stock.reorder_needed', 'Stock reached its reorder level', 'Reorder: {{sku}} {{name}}', 'Only {{available}} left at {{location}} (minimum {{min}}).', '{{href}}', true, 'normal'),
  ('batch.near_expiry', 'A batch will expire soon', 'Expiring {{expiry}}: {{sku}} lot {{lot}}', '{{qty}} on hand. Push it to customers or plan a promo.', '{{href}}', true, 'normal'),
  ('batch.expired', 'A batch has expired', 'Expired: {{sku}} lot {{lot}}', '{{qty}} on hand can no longer be sold. Plan disposal.', '{{href}}', true, 'high')
on conflict do nothing;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 00:30 and 06:00 Manila (UTC+8)
    perform cron.schedule('jdos-expire-batches', '30 16 * * *', 'select public.expire_batches()');
    perform cron.schedule('jdos-near-expiry', '0 22 * * *', 'select public.notify_near_expiry()');
  end if;
end $$;

-- ================================================================ audit
select public.enable_audit('reorder_rules', false, array['updated_at', 'alerted_at']);
insert into public.audit_exempt (table_name, reason) values
  ('stock_movements', 'The stock ledger is itself an append-only record.'),
  ('stock_movement_costs', 'Part of the append-only stock ledger.'),
  ('stock_balances', 'Derived from the stock ledger.'),
  ('reservations', 'Derived; created and released by order processing.')
on conflict do nothing;
