-- Phase 2 (part 3): stock documents: receipts, two-step transfers, adjustments (approval), cycle counts (approval).
-- Each document is edited as a draft (RLS: permission at its location), then a security-definer function posts it
-- through post_stock_movement(). Adjustments and counts go through the approval engine and post on approval.

insert into public.number_series (entity_id, doc_type, label, prefix)
select e.id, x.doc_type, x.label, x.prefix
from public.entities e
cross join (values ('stock_receipt', 'Stock receipt', 'RCV'), ('stock_transfer', 'Stock transfer', 'TRF'),
                   ('stock_adjustment', 'Stock adjustment', 'ADJ'), ('stock_count', 'Cycle count', 'CNT')) as x(doc_type, label, prefix)
where e.code = 'JDF'
on conflict do nothing;

-- Shared: may the current user work on documents at this location with this permission?
create or replace function public.can_stock_doc(p_perm text, p_location uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_permission_at(p_perm, p_location)
$$;
grant execute on function public.can_stock_doc to authenticated;

-- Default bin of a location.
create or replace function public.default_bin(p_location uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.bins where location_id = p_location and code = 'DEFAULT'
$$;
grant execute on function public.default_bin to authenticated;

-- ================================================================ receipts
create table public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  location_id uuid not null references public.locations(id),
  supplier_name text not null default '',
  reference text not null default '',
  received_on date not null default public.manila_today(),
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  posted_at timestamptz,
  posted_by uuid references public.profiles(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.stock_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.stock_receipts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  unit_code text not null references public.units(code),
  qty numeric(18, 4) not null check (qty > 0),
  unit_cost numeric(18, 6) check (unit_cost is null or unit_cost >= 0), -- per entered unit
  lot_no text not null default '',
  mfg_date date,
  expiry_date date,
  bin_id uuid references public.bins(id)
);
create index on public.stock_receipts (location_id, received_on desc);
create index on public.stock_receipt_lines (receipt_id);

-- Receipts and transfers get their number on insert.
create or replace function public.assign_stock_doc_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.number := public.next_document_number(tg_argv[0]);
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;
revoke execute on function public.assign_stock_doc_number from public, anon, authenticated;
create trigger assign_number before insert on public.stock_receipts for each row execute function public.assign_stock_doc_number('stock_receipt');

create or replace function public.post_receipt(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.stock_receipts;
  l public.stock_receipt_lines;
  prod public.products;
  base_qty numeric;
  factor numeric;
  bt public.batches;
  lot text;
  exp date;
  n int := 0;
begin
  select * into r from public.stock_receipts where id = p_id for update;
  if r.id is null then raise exception 'Receipt not found.'; end if;
  if not public.has_permission_at('inventory.receive', r.location_id) then raise exception 'You can''t receive stock at this location.'; end if;
  if r.status <> 'draft' then raise exception 'This receipt was already posted.'; end if;

  for l in select * from public.stock_receipt_lines where receipt_id = p_id loop
    n := n + 1;
    select * into prod from public.products where id = l.product_id;
    base_qty := public.to_base_qty(l.product_id, l.unit_code, l.qty);
    factor := base_qty / l.qty;
    lot := coalesce(nullif(trim(l.lot_no), ''), case when prod.track_expiry then null else 'NOLOT' end);
    if lot is null then raise exception 'Line %: enter the lot number for %.', n, prod.sku; end if;
    exp := coalesce(l.expiry_date, case when prod.shelf_life_days is not null then coalesce(l.mfg_date, r.received_on) + prod.shelf_life_days end);
    if prod.track_expiry and exp is null then raise exception 'Line %: enter the expiry date for % (or set its shelf life).', n, prod.sku; end if;

    select * into bt from public.batches where product_id = l.product_id and lot_no = lot;
    if bt.id is null then
      insert into public.batches (product_id, lot_no, mfg_date, expiry_date, qa_status)
      values (l.product_id, lot, l.mfg_date, exp, case when prod.release_on_receipt then 'released' else 'quarantine' end::public.qa_status)
      returning * into bt;
    end if;
    perform public.post_stock_movement(l.product_id, r.location_id, coalesce(l.bin_id, public.default_bin(r.location_id)), bt.id,
      base_qty, 'receipt', case when l.unit_cost is not null then l.unit_cost / factor end, 'stock_receipts', r.id, r.number,
      coalesce(nullif(r.supplier_name, ''), 'Manual receipt'));
  end loop;
  if n = 0 then raise exception 'Add at least one line.'; end if;
  update public.stock_receipts set status = 'posted', posted_at = now(), posted_by = auth.uid() where id = p_id;
end $$;
revoke execute on function public.post_receipt from public, anon;
grant execute on function public.post_receipt to authenticated;

-- ================================================================ transfers (dispatch → in transit → receive)
create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  from_location_id uuid not null references public.locations(id),
  to_location_id uuid not null references public.locations(id),
  status text not null default 'draft' check (status in ('draft', 'dispatched', 'received', 'cancelled')),
  notes text not null default '',
  dispatched_at timestamptz,
  dispatched_by uuid references public.profiles(id),
  received_at timestamptz,
  received_by uuid references public.profiles(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint different_locations check (from_location_id <> to_location_id)
);
create table public.stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  from_bin_id uuid references public.bins(id),
  qty numeric(18, 4) not null check (qty > 0), -- base unit
  received_qty numeric(18, 4) check (received_qty is null or received_qty >= 0),
  to_bin_id uuid references public.bins(id),
  constraint received_not_more check (received_qty is null or received_qty <= qty)
);
create trigger assign_number before insert on public.stock_transfers for each row execute function public.assign_stock_doc_number('stock_transfer');
create index on public.stock_transfers (from_location_id, created_at desc);
create index on public.stock_transfers (to_location_id, created_at desc);
create index on public.stock_transfer_lines (transfer_id);

create or replace function public.dispatch_transfer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.stock_transfers;
  l public.stock_transfer_lines;
  n int := 0;
begin
  select * into t from public.stock_transfers where id = p_id for update;
  if t.id is null then raise exception 'Transfer not found.'; end if;
  if not public.has_permission_at('inventory.transfer', t.from_location_id) then raise exception 'You can''t dispatch from this location.'; end if;
  if t.status <> 'draft' then raise exception 'This transfer was already dispatched.'; end if;
  if not (select holds_inventory from public.locations where id = t.to_location_id) then raise exception 'The destination doesn''t hold inventory.'; end if;
  for l in select * from public.stock_transfer_lines where transfer_id = p_id loop
    n := n + 1;
    perform public.post_stock_movement(l.product_id, t.from_location_id, coalesce(l.from_bin_id, public.default_bin(t.from_location_id)), l.batch_id,
      -l.qty, 'transfer_out', null, 'stock_transfers', t.id, t.number, 'To ' || (select name from public.locations where id = t.to_location_id));
  end loop;
  if n = 0 then raise exception 'Add at least one line.'; end if;
  update public.stock_transfers set status = 'dispatched', dispatched_at = now(), dispatched_by = auth.uid() where id = p_id;
  perform public.emit_event('transfer.dispatched', 'stock_transfers', p_id::text, jsonb_build_object('number', t.number));
end $$;

-- p_lines: [{"line_id": "...", "received_qty": 10, "to_bin_id": "..."}]; lines not listed are received in full.
create or replace function public.receive_transfer(p_id uuid, p_lines jsonb default '[]') returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.stock_transfers;
  l public.stock_transfer_lines;
  rq numeric;
  bin uuid;
  short boolean := false;
begin
  select * into t from public.stock_transfers where id = p_id for update;
  if t.id is null then raise exception 'Transfer not found.'; end if;
  if not public.has_permission_at('inventory.transfer', t.to_location_id) then raise exception 'You can''t receive at this location.'; end if;
  if t.status <> 'dispatched' then raise exception 'Only dispatched transfers can be received.'; end if;
  for l in select * from public.stock_transfer_lines where transfer_id = p_id for update loop
    rq := coalesce((select (x->>'received_qty')::numeric from jsonb_array_elements(p_lines) x where x->>'line_id' = l.id::text), l.qty);
    bin := coalesce((select nullif(x->>'to_bin_id', '')::uuid from jsonb_array_elements(p_lines) x where x->>'line_id' = l.id::text),
                    l.to_bin_id, public.default_bin(t.to_location_id));
    if rq < 0 or rq > l.qty then raise exception 'Received quantity must be between 0 and %.', l.qty; end if;
    if rq > 0 then
      perform public.post_stock_movement(l.product_id, t.to_location_id, bin, l.batch_id, rq, 'transfer_in', null,
        'stock_transfers', t.id, t.number, 'From ' || (select name from public.locations where id = t.from_location_id));
    end if;
    if rq < l.qty then short := true; end if;
    update public.stock_transfer_lines set received_qty = rq, to_bin_id = bin where id = l.id;
  end loop;
  update public.stock_transfers set status = 'received', received_at = now(), received_by = auth.uid() where id = p_id;
  if short then
    perform public.emit_event('transfer.short', 'stock_transfers', p_id::text,
      jsonb_build_object('recipients', to_jsonb(public.users_with_role('operations_manager')), 'number', t.number, 'href', '/inventory/transfers/' || p_id));
  end if;
end $$;
revoke execute on function public.dispatch_transfer, public.receive_transfer from public, anon;
grant execute on function public.dispatch_transfer, public.receive_transfer to authenticated;

-- Stock dispatched but not (fully) received, valued at the cost it left with.
create or replace view public.stock_in_transit with (security_invoker = true) as
  select t.id as transfer_id, t.number, t.from_location_id, t.to_location_id, t.status, l.product_id, l.batch_id,
         l.qty - coalesce(l.received_qty, 0) as qty_in_transit, t.dispatched_at
  from public.stock_transfers t join public.stock_transfer_lines l on l.transfer_id = t.id
  where t.status in ('dispatched', 'received') and l.qty > coalesce(l.received_qty, 0);
grant select on public.stock_in_transit to authenticated;

-- ================================================================ adjustments (approval)
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  location_id uuid not null references public.locations(id),
  reason_type text not null check (reason_type in ('correction', 'found', 'damage', 'disposal', 'sample', 'internal_use')),
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'returned', 'cancelled', 'posted')),
  total_value numeric(18, 2) not null default 0,
  requested_by uuid not null default auth.uid() references public.profiles(id),
  posted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.stock_adjustment_lines (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.stock_adjustments(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  bin_id uuid references public.bins(id),
  qty numeric(18, 4) not null check (qty <> 0), -- signed, base unit
  unit_cost numeric(18, 6) check (unit_cost is null or unit_cost >= 0), -- only for stock found with no average cost yet
  reason text not null default ''
);
create index on public.stock_adjustments (location_id, created_at desc);
create index on public.stock_adjustment_lines (adjustment_id);

create or replace function public.adjustment_movement_type(p_reason text) returns public.movement_type
language sql immutable as $$
  select (case p_reason when 'damage' then 'damage' when 'disposal' then 'disposal' when 'sample' then 'sample'
                        when 'internal_use' then 'internal_use' else 'adjustment' end)::public.movement_type
$$;

create or replace function public.stock_adjustment_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.stock_adjustment_lines;
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('stock_adjustment');
    new.requested_by := coalesce(auth.uid(), new.requested_by);
    new.status := 'draft';
    return new;
  end if;
  if new.status is distinct from old.status and coalesce(current_setting('app.approval_engine', true), 'off') <> 'on'
     and not (old.status in ('draft', 'returned') and new.status = 'cancelled') then
    raise exception 'Status changes go through the approval process.';
  end if;
  -- Approved → post every line, then mark posted (all or nothing: a failure undoes the approval).
  if new.status = 'approved' and old.status <> 'approved' then
    for l in select * from public.stock_adjustment_lines where adjustment_id = new.id loop
      perform public.post_stock_movement(l.product_id, new.location_id, coalesce(l.bin_id, public.default_bin(new.location_id)), l.batch_id,
        l.qty, public.adjustment_movement_type(new.reason_type), l.unit_cost, 'stock_adjustments', new.id, new.number,
        coalesce(nullif(l.reason, ''), new.reason_type));
    end loop;
    new.status := 'posted';
    new.posted_at := now();
  end if;
  return new;
end $$;
create trigger stock_adjustment_before_write before insert or update on public.stock_adjustments
  for each row execute function public.stock_adjustment_before_write();

create or replace function public.submit_adjustment(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a public.stock_adjustments;
  v numeric;
  n int;
  bad text;
begin
  select * into a from public.stock_adjustments where id = p_id for update;
  if a.id is null or not public.has_permission_at('inventory.adjust.request', a.location_id) then
    raise exception 'You can''t request adjustments at this location.';
  end if;
  if a.status not in ('draft', 'returned') then raise exception 'This adjustment was already submitted.'; end if;
  select count(*) into n from public.stock_adjustment_lines where adjustment_id = p_id;
  if n = 0 then raise exception 'Add at least one line.'; end if;
  if a.reason_type in ('damage', 'disposal', 'sample', 'internal_use')
     and exists (select 1 from public.stock_adjustment_lines where adjustment_id = p_id and qty > 0) then
    raise exception 'For %, quantities must be negative (stock going out).', a.reason_type;
  end if;
  if a.reason_type = 'found' and exists (select 1 from public.stock_adjustment_lines where adjustment_id = p_id and qty < 0) then
    raise exception 'For found stock, quantities must be positive.';
  end if;
  select string_agg(p.sku, ', ') into bad
  from public.stock_adjustment_lines l join public.batches b on b.id = l.batch_id join public.products p on p.id = l.product_id
  where l.adjustment_id = p_id and b.product_id <> l.product_id;
  if bad is not null then raise exception 'Batch doesn''t match product: %', bad; end if;
  select coalesce(sum(abs(l.qty) * coalesce(l.unit_cost, c.avg_cost, 0)), 0) into v
  from public.stock_adjustment_lines l left join public.product_costs c on c.product_id = l.product_id
  where l.adjustment_id = p_id;
  update public.stock_adjustments set total_value = round(v, 2) where id = p_id;
  return public.start_approval('stock_adjustment', p_id, round(v, 2),
    format('Stock %s %s: ₱%s at %s', replace(a.reason_type, '_', ' '), a.number, to_char(v, 'FM999,999,990.00'),
           (select name from public.locations where id = a.location_id)), auth.uid());
end $$;
revoke execute on function public.submit_adjustment from public, anon;
grant execute on function public.submit_adjustment to authenticated;

-- ================================================================ cycle counts (approval)
create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  location_id uuid not null references public.locations(id),
  scope_label text not null default '',
  blind boolean not null default true, -- counters don't see expected quantities
  status text not null default 'counting' check (status in ('counting', 'submitted', 'approved', 'rejected', 'returned', 'cancelled', 'posted')),
  snapshot_at timestamptz not null default now(),
  total_variance_value numeric(18, 2) not null default 0,
  notes text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id),
  posted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  bin_id uuid not null references public.bins(id),
  expected_qty numeric(18, 4) not null,
  counted_qty numeric(18, 4) check (counted_qty is null or counted_qty >= 0),
  unit_cost numeric(18, 6) not null default 0,
  counted_by uuid references public.profiles(id),
  counted_at timestamptz,
  unique (count_id, product_id, batch_id, bin_id)
);
create index on public.stock_counts (location_id, created_at desc);
create index on public.stock_count_lines (count_id);

-- ABC class by outbound value over the last 90 days: A = top 80% of value, B = next 15%, C = the rest.
create or replace view public.product_abc with (security_invoker = false) as
  with v as (
    select m.product_id, sum(-m.qty * c.unit_cost) as value
    from public.stock_movements m join public.stock_movement_costs c on c.movement_id = m.id
    where m.qty < 0 and m.created_at > now() - interval '90 days'
    group by m.product_id
  ), r as (
    select product_id, value, sum(value) over (order by value desc) / nullif(sum(value) over (), 0) as cum from v
  )
  select p.id as product_id, case when r.cum <= 0.8 then 'A' when r.cum <= 0.95 then 'B' else 'C' end as abc_class
  from public.products p left join r on r.product_id = p.id;
grant select on public.product_abc to authenticated;

-- Create a count: snapshot of every balance in the chosen bins (or zone, or ABC class) at this location.
create or replace function public.create_count(p_location uuid, p_zone text default null, p_bin_ids uuid[] default null,
                                               p_abc text default null, p_blind boolean default true, p_label text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  n int;
begin
  if not public.has_permission_at('inventory.count', p_location) then raise exception 'You can''t count at this location.'; end if;
  insert into public.stock_counts (number, location_id, scope_label, blind)
  values (public.next_document_number('stock_count'), p_location,
          coalesce(nullif(p_label, ''), concat_ws(' · ', case when p_zone is not null then 'Zone ' || p_zone end,
                                                         case when p_abc is not null then 'Class ' || p_abc end,
                                                         case when p_bin_ids is not null then cardinality(p_bin_ids) || ' bins' end), 'Whole location'),
          p_blind)
  returning id into cid;
  insert into public.stock_count_lines (count_id, product_id, batch_id, bin_id, expected_qty, unit_cost)
  select cid, sb.product_id, sb.batch_id, sb.bin_id, sb.on_hand, coalesce(pc.avg_cost, 0)
  from public.stock_balances sb
  join public.bins b on b.id = sb.bin_id
  left join public.product_costs pc on pc.product_id = sb.product_id
  left join public.product_abc abc on abc.product_id = sb.product_id
  where sb.location_id = p_location and sb.on_hand > 0
    and (p_zone is null or b.zone = p_zone)
    and (p_bin_ids is null or sb.bin_id = any (p_bin_ids))
    and (p_abc is null or coalesce(abc.abc_class, 'C') = p_abc);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'There''s no stock to count in that selection.'; end if;
  return cid;
end $$;

create or replace function public.record_count(p_line uuid, p_qty numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.stock_counts;
begin
  select sc.* into c from public.stock_counts sc join public.stock_count_lines l on l.count_id = sc.id where l.id = p_line;
  if c.id is null or not public.has_permission_at('inventory.count', c.location_id) then raise exception 'You can''t count at this location.'; end if;
  if c.status not in ('counting', 'returned') then raise exception 'This count is closed.'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Enter zero or more.'; end if;
  update public.stock_count_lines set counted_qty = p_qty, counted_by = auth.uid(), counted_at = now() where id = p_line;
end $$;

create or replace function public.stock_count_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l public.stock_count_lines;
begin
  if tg_op = 'INSERT' then return new; end if;
  if new.status is distinct from old.status and coalesce(current_setting('app.approval_engine', true), 'off') <> 'on'
     and coalesce(current_setting('app.count_engine', true), 'off') <> 'on' then
    raise exception 'Status changes go through the count and approval process.';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    for l in select * from public.stock_count_lines where count_id = new.id and counted_qty is not null and counted_qty <> expected_qty loop
      perform public.post_stock_movement(l.product_id, new.location_id, l.bin_id, l.batch_id, l.counted_qty - l.expected_qty,
        'count_variance', case when l.unit_cost > 0 then l.unit_cost end, 'stock_counts', new.id, new.number, 'Cycle count variance');
    end loop;
    new.status := 'posted';
    new.posted_at := now();
  end if;
  if new.status = 'draft' then new.status := 'counting'; end if; -- cancelled approval sends it back to counting
  return new;
end $$;
create trigger stock_count_before_write before insert or update on public.stock_counts
  for each row execute function public.stock_count_before_write();

create or replace function public.submit_count(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.stock_counts;
  missing int;
  v numeric;
begin
  select * into c from public.stock_counts where id = p_id for update;
  if c.id is null or not public.has_permission_at('inventory.count', c.location_id) then raise exception 'You can''t count at this location.'; end if;
  if c.status not in ('counting', 'returned') then raise exception 'This count was already submitted.'; end if;
  select count(*) into missing from public.stock_count_lines where count_id = p_id and counted_qty is null;
  if missing > 0 then raise exception '% line(s) haven''t been counted yet. Enter 0 for items you couldn''t find.', missing; end if;
  select coalesce(sum(abs(counted_qty - expected_qty) * unit_cost), 0) into v from public.stock_count_lines where count_id = p_id;
  perform set_config('app.count_engine', 'on', true);
  update public.stock_counts set total_variance_value = round(v, 2) where id = p_id;
  if not exists (select 1 from public.stock_count_lines where count_id = p_id and counted_qty <> expected_qty) then
    update public.stock_counts set status = 'posted', posted_at = now() where id = p_id;
    perform set_config('app.count_engine', 'off', true);
    return 'no_variance';
  end if;
  perform set_config('app.count_engine', 'off', true);
  perform public.start_approval('stock_count', p_id, round(v, 2),
    format('Count variance %s: ₱%s at %s', c.number, to_char(v, 'FM999,999,990.00'), (select name from public.locations where id = c.location_id)), auth.uid());
  return 'submitted';
end $$;
revoke execute on function public.create_count, public.record_count, public.submit_count from public, anon;
grant execute on function public.create_count, public.record_count, public.submit_count to authenticated;

-- ================================================================ RLS for documents
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_lines enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_lines enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustment_lines enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;

create policy "stock_receipts: read" on public.stock_receipts for select to authenticated
  using (public.has_permission_at('inventory.view', location_id) or public.can_read_all());
create policy "stock_receipts: draft" on public.stock_receipts for all to authenticated
  using (status = 'draft' and public.has_permission_at('inventory.receive', location_id))
  with check (status = 'draft' and public.has_permission_at('inventory.receive', location_id));
create policy "stock_receipt_lines: read" on public.stock_receipt_lines for select to authenticated
  using (exists (select 1 from public.stock_receipts r where r.id = receipt_id));
create policy "stock_receipt_lines: draft" on public.stock_receipt_lines for all to authenticated
  using (exists (select 1 from public.stock_receipts r where r.id = receipt_id and r.status = 'draft' and public.has_permission_at('inventory.receive', r.location_id)))
  with check (exists (select 1 from public.stock_receipts r where r.id = receipt_id and r.status = 'draft' and public.has_permission_at('inventory.receive', r.location_id)));

create policy "stock_transfers: read" on public.stock_transfers for select to authenticated
  using (public.has_permission_at('inventory.view', from_location_id) or public.has_permission_at('inventory.view', to_location_id) or public.can_read_all());
create policy "stock_transfers: draft" on public.stock_transfers for all to authenticated
  using (status = 'draft' and public.has_permission_at('inventory.transfer', from_location_id))
  with check (status = 'draft' and public.has_permission_at('inventory.transfer', from_location_id));
create policy "stock_transfer_lines: read" on public.stock_transfer_lines for select to authenticated
  using (exists (select 1 from public.stock_transfers t where t.id = transfer_id));
create policy "stock_transfer_lines: draft" on public.stock_transfer_lines for all to authenticated
  using (exists (select 1 from public.stock_transfers t where t.id = transfer_id and t.status = 'draft' and public.has_permission_at('inventory.transfer', t.from_location_id)))
  with check (exists (select 1 from public.stock_transfers t where t.id = transfer_id and t.status = 'draft' and public.has_permission_at('inventory.transfer', t.from_location_id)));

create or replace function public.can_view_stock_adjustment(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stock_adjustments a where a.id = p_id and (
    public.has_permission_at('inventory.view', a.location_id) or public.can_read_all() or a.requested_by = auth.uid()
    or exists (select 1 from public.approval_requests r join public.approval_steps s on s.request_id = r.id
               where r.doc_type = 'stock_adjustment' and r.record_id = a.id and s.approver_ids && public.my_approver_ids())))
$$;
create or replace function public.can_edit_stock_adjustment(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stock_adjustments a where a.id = p_id and a.status in ('draft', 'returned', 'submitted')
                 and public.has_permission_at('inventory.adjust.request', a.location_id))
$$;
grant execute on function public.can_view_stock_adjustment, public.can_edit_stock_adjustment to authenticated;

create policy "stock_adjustments: read" on public.stock_adjustments for select to authenticated
  using (public.has_permission_at('inventory.view', location_id) or requested_by = auth.uid() or public.can_view_stock_adjustment(id));
create policy "stock_adjustments: draft" on public.stock_adjustments for all to authenticated
  using (status in ('draft', 'returned') and public.has_permission_at('inventory.adjust.request', location_id))
  with check (status in ('draft', 'returned', 'cancelled') and public.has_permission_at('inventory.adjust.request', location_id));
create policy "stock_adjustment_lines: read" on public.stock_adjustment_lines for select to authenticated
  using (public.can_view_stock_adjustment(adjustment_id));
create policy "stock_adjustment_lines: draft" on public.stock_adjustment_lines for all to authenticated
  using (exists (select 1 from public.stock_adjustments a where a.id = adjustment_id and a.status in ('draft', 'returned') and public.has_permission_at('inventory.adjust.request', a.location_id)))
  with check (exists (select 1 from public.stock_adjustments a where a.id = adjustment_id and a.status in ('draft', 'returned') and public.has_permission_at('inventory.adjust.request', a.location_id)));

create policy "stock_counts: read" on public.stock_counts for select to authenticated
  using (public.has_permission_at('inventory.view', location_id) or public.can_read_all()
         or exists (select 1 from public.approval_requests r join public.approval_steps s on s.request_id = r.id
                    where r.doc_type = 'stock_count' and r.record_id = stock_counts.id and s.approver_ids && public.my_approver_ids()));
create policy "stock_count_lines: read" on public.stock_count_lines for select to authenticated
  using (exists (select 1 from public.stock_counts c where c.id = count_id));
-- counts are created, counted and submitted through functions only

-- ================================================================ approvals, attachments, notifications
insert into public.approval_doc_types (doc_type, label, record_table, href_template) values
  ('stock_adjustment', 'Stock adjustment', 'stock_adjustments', '/inventory/adjustments/{{id}}'),
  ('stock_count', 'Cycle count', 'stock_counts', '/inventory/counts/{{id}}')
on conflict do nothing;

do $$
declare
  p uuid;
  ops uuid := (select id from public.roles where code = 'operations_manager');
  ceo uuid := (select id from public.roles where code = 'ceo');
  dt text;
begin
  foreach dt in array array['stock_adjustment', 'stock_count'] loop
    if exists (select 1 from public.approval_policies where doc_type = dt) then continue; end if;
    insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority)
    values (dt, case dt when 'stock_adjustment' then 'Adjustments up to ₱5,000' else 'Count variances up to ₱5,000' end, null, 5000, 10) returning id into p;
    insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', ops);
    insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority)
    values (dt, case dt when 'stock_adjustment' then 'Adjustments over ₱5,000' else 'Count variances over ₱5,000' end, 5000.01, null, 10) returning id into p;
    insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id) values (p, 1, 'role', ceo);
  end loop;
end $$;

insert into public.attachment_sources (record_table, can_view_function, can_attach_function) values
  ('stock_adjustments', 'can_view_stock_adjustment', 'can_edit_stock_adjustment')
on conflict do nothing;

insert into public.notification_rules (event_type, label, title_template, body_template, href_template, email) values
  ('transfer.short', 'A transfer arrived short', 'Transfer {{number}} arrived short', 'Some items were not received. Check and resolve the difference.', '{{href}}', true)
on conflict do nothing;

-- ================================================================ audit
select public.enable_audit(t) from unnest(array['stock_receipts', 'stock_receipt_lines', 'stock_transfers', 'stock_transfer_lines',
  'stock_adjustments', 'stock_adjustment_lines', 'stock_counts', 'stock_count_lines']) as t;
