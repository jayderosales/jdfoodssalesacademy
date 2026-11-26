-- Phase 2 (part 5): importers for products and opening stock (all-or-nothing, like the Phase 1b importers).

-- Products: matched by SKU (insert or update). Brand and category by name (categories are created if new).
create or replace function public.import_products(p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  created int := 0;
  updated int := 0;
  existed boolean;
  cat uuid;
  t public.item_type;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    existed := exists (select 1 from public.products where sku = upper(r->>'sku'));
    cat := null;
    if coalesce(r->>'category', '') <> '' then
      select id into cat from public.product_categories where lower(name) = lower(r->>'category');
      if cat is null then insert into public.product_categories (name) values (r->>'category') returning id into cat; end if;
    end if;
    t := coalesce(nullif(r->>'item_type', ''), 'finished_good')::public.item_type;
    insert into public.products (sku, name, brand_id, category_id, item_type, base_unit, size_label, srp, shelf_life_days,
                                 pre_order, lead_time_days, release_on_receipt, track_expiry, notes)
    values (upper(r->>'sku'), r->>'name', (select id from public.brands where lower(name) = lower(r->>'brand')), cat, t,
            coalesce(nullif(r->>'base_unit', ''), 'pc'), coalesce(r->>'size', ''), nullif(r->>'srp', '')::numeric,
            nullif(r->>'shelf_life_days', '')::int, coalesce((r->>'pre_order')::boolean, false), nullif(r->>'lead_time_days', '')::int,
            t in ('merchandise', 'packaging'), t not in ('merchandise', 'service', 'bundle') or coalesce((r->>'track_expiry')::boolean, false),
            coalesce(r->>'notes', ''))
    on conflict (sku) do update set
      name = excluded.name, brand_id = coalesce(excluded.brand_id, products.brand_id), category_id = coalesce(excluded.category_id, products.category_id),
      item_type = excluded.item_type, base_unit = excluded.base_unit, size_label = excluded.size_label,
      srp = coalesce(excluded.srp, products.srp), shelf_life_days = coalesce(excluded.shelf_life_days, products.shelf_life_days),
      pre_order = excluded.pre_order, lead_time_days = coalesce(excluded.lead_time_days, products.lead_time_days),
      notes = case when excluded.notes <> '' then excluded.notes else products.notes end;
    if coalesce(r->>'cost', '') <> '' then
      perform public.set_product_cost((select id from public.products where sku = upper(r->>'sku')), (r->>'cost')::numeric, 'Imported cost');
    end if;
    if existed then updated := updated + 1; else created := created + 1; end if;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated);
end $$;
grant execute on function public.import_products to authenticated;

-- Opening stock: one row per product/location/bin/lot. Posted as receipts (doc "Opening stock") with the given cost,
-- into RELEASED batches (stock already on the shelf). Needs receive permission at each location.
create or replace function public.import_opening_stock(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  prod public.products;
  loc uuid;
  bin uuid;
  bt uuid;
  n int := 0;
  lot text;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    select * into prod from public.products where sku = upper(r->>'sku');
    if prod.id is null then raise exception 'Row %: unknown SKU %.', n, r->>'sku'; end if;
    select id into loc from public.locations where upper(code) = upper(r->>'location') or lower(name) = lower(r->>'location');
    if loc is null then raise exception 'Row %: unknown location %.', n, r->>'location'; end if;
    if not public.has_permission_at('inventory.receive', loc) then raise exception 'Row %: you can''t receive stock at %.', n, r->>'location'; end if;
    select id into bin from public.bins where location_id = loc and code = upper(coalesce(nullif(r->>'bin', ''), 'DEFAULT'));
    if bin is null then raise exception 'Row %: bin % doesn''t exist at this location.', n, r->>'bin'; end if;
    lot := coalesce(nullif(r->>'lot_no', ''), 'OPENING');
    insert into public.batches (product_id, lot_no, mfg_date, expiry_date, qa_status)
    values (prod.id, lot, nullif(r->>'mfg_date', '')::date, nullif(r->>'expiry_date', '')::date, 'released')
    on conflict (product_id, lot_no) do nothing;
    select id into bt from public.batches where product_id = prod.id and lot_no = lot;
    perform public.post_stock_movement(prod.id, loc, bin, bt, public.to_base_qty(prod.id, nullif(r->>'unit', ''), (r->>'qty')::numeric),
      'receipt', nullif(r->>'unit_cost', '')::numeric, 'opening_stock', null, 'OPENING', 'Opening stock');
  end loop;
  return jsonb_build_object('created', n, 'updated', 0);
end $$;
revoke execute on function public.import_opening_stock from public, anon;
grant execute on function public.import_opening_stock to authenticated;

-- ================================================================ reporting views (RLS of the underlying tables applies)
-- Stock on hand with product, location, batch and value. avg_cost is null for people who can't see costs.
create or replace view public.stock_on_hand with (security_invoker = true) as
  select sb.product_id, sb.location_id, sb.bin_id, sb.batch_id, sb.on_hand, sb.reserved,
         p.sku, p.name as product_name, p.base_unit, p.brand_id, p.category_id, l.name as location_name, b.code as bin_code,
         bt.lot_no, bt.expiry_date, bt.qa_status, bt.received_at,
         pc.avg_cost, round(sb.on_hand * pc.avg_cost, 2) as value,
         case when bt.expiry_date is null then null else bt.expiry_date - public.manila_today() end as days_to_expiry,
         sb.product_id::text || ':' || sb.location_id::text || ':' || sb.bin_id::text || ':' || sb.batch_id::text as id
  from public.stock_balances sb
  join public.products p on p.id = sb.product_id
  join public.locations l on l.id = sb.location_id
  join public.bins b on b.id = sb.bin_id
  join public.batches bt on bt.id = sb.batch_id
  left join public.product_costs pc on pc.product_id = sb.product_id
  where sb.on_hand > 0;
grant select on public.stock_on_hand to authenticated;

-- Last outbound movement per product per location (slow-moving detection).
create or replace view public.stock_last_outbound with (security_invoker = true) as
  select product_id, location_id, max(created_at) as last_out
  from public.stock_movements where qty < 0 and movement_type not in ('transfer_out')
  group by product_id, location_id;
grant select on public.stock_last_outbound to authenticated;
