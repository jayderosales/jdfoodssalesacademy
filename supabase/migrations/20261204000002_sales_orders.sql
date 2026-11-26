-- Phase 3 (part 2): sales orders, reservations, payments, credit check, fulfilment (stock deducted at "ready for pickup"),
-- shipments, billing invoices, official sales invoice (SI) register, and the public shop functions.
-- Rule (docs/DECISIONS.md 2026-11-26): stock is reserved when an order is placed and deducted only when it's marked
-- ready for pickup, which requires the order to be paid or approved on credit.

-- ================================================================ orders
create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  customer_id uuid not null references public.customers(id),
  channel text not null default 'phone' check (channel in ('shop', 'phone', 'messenger', 'field', 'walk_in', 'email', 'shopify', 'marketplace', 'other')),
  status text not null default 'draft' check (status in ('draft', 'credit_review', 'awaiting_payment', 'confirmed', 'packing',
                                                          'ready_for_pickup', 'dispatched', 'delivered', 'cancelled', 'returned')),
  payment_mode text not null default 'prepaid' check (payment_mode in ('prepaid', 'terms')),
  terms_days int not null default 0 check (terms_days between 0 and 180),
  location_id uuid not null references public.locations(id), -- ship-from (stock) location
  ship_to jsonb not null default '{}',
  courier_note text not null default '',
  notes text not null default '',
  subtotal numeric(18, 2) not null default 0,
  discount_total numeric(18, 2) not null default 0,
  total numeric(18, 2) not null default 0,
  paid_amount numeric(18, 2) not null default 0,
  rep_id uuid references public.profiles(id) on delete set null,
  placed_at timestamptz,
  placed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text not null default '',
  due_date date,
  is_demo boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sales_orders (customer_id, created_at desc);
create index on public.sales_orders (status, placed_at);
create index on public.sales_orders (rep_id, created_at desc);
create index on public.sales_orders (location_id, status);
create index on public.sales_orders (channel, placed_at);

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric(18, 4) not null check (qty > 0), -- base unit
  list_price numeric(18, 2) not null default 0, -- price-list price at the time of the order
  unit_price numeric(18, 2), -- null on insert = use the price list
  price_source text not null default '',
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  line_total numeric(18, 2) not null default 0,
  notes text not null default ''
);
create index on public.sales_order_lines (order_id);
create index on public.sales_order_lines (product_id);

-- Lots picked for each line (from FEFO reservation); posted as sale_dispatch at ready_for_pickup.
create table public.sales_order_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  line_id uuid not null references public.sales_order_lines(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.batches(id),
  bin_id uuid not null references public.bins(id),
  qty numeric(18, 4) not null check (qty > 0),
  movement_id bigint references public.stock_movements(id)
);
create index on public.sales_order_allocations (order_id);

-- ---------------------------------------------------------------- line pricing and totals
create or replace function public.sales_line_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o public.sales_orders;
  rp record;
  prod public.products;
begin
  select * into o from public.sales_orders where id = new.order_id;
  if o.status <> 'draft' and coalesce(current_setting('app.sales_engine', true), 'off') <> 'on' then
    raise exception 'Order lines can only be changed while the order is a draft.';
  end if;
  select * into prod from public.products where id = new.product_id;
  if not prod.active then raise exception '% is inactive.', prod.sku; end if;
  if (select whole_only from public.units where code = prod.base_unit) and new.qty <> trunc(new.qty) then
    raise exception 'Quantity of % must be a whole number of %.', prod.sku, prod.base_unit;
  end if;
  select * into rp from public.resolve_price(o.customer_id, new.product_id, new.qty, coalesce(o.placed_at, now())::date);
  new.list_price := rp.price;
  if new.unit_price is null then
    new.unit_price := rp.price;
    new.price_source := rp.source;
  elsif new.unit_price <> rp.price then
    new.price_source := 'manual';
  else
    new.price_source := rp.source;
  end if;
  if (new.unit_price < new.list_price or new.discount_pct > 0) and auth.uid() is not null
     and not public.has_permission('sales.orders.discount') then
    raise exception 'You can''t give a discount or a price below the price list (₱%).', new.list_price;
  end if;
  new.line_total := round(new.qty * new.unit_price * (1 - new.discount_pct / 100), 2);
  return new;
end $$;
create trigger sales_line_before_write before insert or update on public.sales_order_lines
  for each row execute function public.sales_line_before_write();

create or replace function public.recalc_sales_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s numeric; d numeric;
begin
  select coalesce(sum(round(qty * list_price, 2)), 0), coalesce(sum(line_total), 0) into s, d
  from public.sales_order_lines where order_id = p_order;
  perform set_config('app.sales_engine', 'on', true);
  update public.sales_orders set subtotal = s, discount_total = greatest(s - d, 0), total = d where id = p_order;
  perform set_config('app.sales_engine', 'off', true);
end $$;

create or replace function public.sales_line_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_sales_order(coalesce(new.order_id, old.order_id));
  return null;
end $$;
create trigger sales_line_after_write after insert or update or delete on public.sales_order_lines
  for each row execute function public.sales_line_after_write();

create or replace function public.sales_line_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select status from public.sales_orders where id = old.order_id) not in ('draft', 'cancelled')
     and coalesce(current_setting('app.sales_engine', true), 'off') <> 'on' then
    raise exception 'Order lines can only be removed while the order is a draft.';
  end if;
  return old;
end $$;
create trigger sales_line_before_delete before delete on public.sales_order_lines
  for each row execute function public.sales_line_before_delete();

-- ---------------------------------------------------------------- header guard
create or replace function public.sales_order_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  engine boolean := coalesce(current_setting('app.sales_engine', true), 'off') = 'on';
  appr boolean := coalesce(current_setting('app.approval_engine', true), 'off') = 'on';
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('sales_order');
    new.created_by := coalesce(auth.uid(), new.created_by);
    if not engine then
      new.status := 'draft';
      new.paid_amount := 0;
    end if;
    new.rep_id := coalesce(new.rep_id, (select owner_id from public.customers where id = new.customer_id), auth.uid());
    if new.payment_mode = 'terms' then
      select payment_terms_days into new.terms_days from public.customers where id = new.customer_id;
      if new.terms_days = 0 then raise exception 'This customer has no credit terms. Use "pay before release".'; end if;
    end if;
    return new;
  end if;
  new.updated_at := now();
  -- The approval engine sets submitted/approved/rejected/returned/draft: map them onto the order's statuses.
  if appr and new.status is distinct from old.status then
    new.status := case new.status
      when 'submitted' then 'credit_review'
      when 'approved' then 'confirmed'
      when 'rejected' then 'cancelled'
      when 'returned' then 'cancelled'
      when 'draft' then 'cancelled'
      else new.status end;
    if new.status = 'confirmed' then new.confirmed_at := now(); end if;
    if new.status = 'cancelled' then
      new.cancelled_at := now();
      new.cancel_reason := coalesce(nullif(new.cancel_reason, ''), 'Credit not approved');
      perform public.release_reservations('sales_orders', new.id);
      delete from public.sales_order_allocations where order_id = new.id and movement_id is null;
    end if;
    return new;
  end if;
  if not engine then
    if new.status is distinct from old.status or new.paid_amount is distinct from old.paid_amount
       or new.total is distinct from old.total or new.customer_id is distinct from old.customer_id then
      raise exception 'Use the order buttons to change its status.';
    end if;
    if old.status <> 'draft' and (new.payment_mode, new.location_id) is distinct from (old.payment_mode, old.location_id) then
      raise exception 'Placed orders can''t change payment mode or ship-from location.';
    end if;
  end if;
  return new;
end $$;
create trigger sales_order_before_write before insert or update on public.sales_orders
  for each row execute function public.sales_order_before_write();
revoke execute on function public.sales_line_before_write, public.sales_line_after_write, public.sales_line_before_delete,
  public.sales_order_before_write, public.recalc_sales_order from public, anon, authenticated;

-- ---------------------------------------------------------------- payments (table; functions further down)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  customer_id uuid not null references public.customers(id),
  order_id uuid references public.sales_orders(id),
  method text not null check (method in ('cash', 'bank_transfer', 'gcash', 'maya', 'cheque', 'card', 'paymongo', 'other')),
  amount numeric(18, 2) not null check (amount > 0),
  reference text not null default '',
  paid_on date not null default public.manila_today(),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  from_customer boolean not null default false, -- submitted on the shop's order page
  provider_id text unique, -- PayMongo payment id
  notes text not null default '',
  received_by uuid references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  reject_reason text not null default '',
  created_at timestamptz not null default now()
);
create index on public.payments (customer_id, paid_on desc);
create index on public.payments (order_id);
create index on public.payments (status, created_at);

create or replace function public.payment_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.number := public.next_document_number('payment');
    return new;
  end if;
  if coalesce(current_setting('app.sales_engine', true), 'off') <> 'on' then
    raise exception 'Payments change only through Record / Confirm / Reject.';
  end if;
  return new;
end $$;
create trigger payment_before_write before insert or update on public.payments for each row execute function public.payment_before_write();
create or replace function public.prevent_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception '% records can''t be deleted. Reject or reverse them instead.', tg_table_name;
end $$;
revoke execute on function public.prevent_delete from public, anon, authenticated;
create trigger payment_no_delete before delete on public.payments for each row execute function public.prevent_delete();
revoke execute on function public.payment_before_write from public, anon, authenticated;


-- ---------------------------------------------------------------- balances and credit
-- What a customer owes: opening balance + every order that is owed (confirmed or later, not cancelled) − confirmed payments.
create or replace function public.customer_balance(p_customer uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select opening_balance from public.customers where id = p_customer), 0)
       + coalesce((select sum(total) from public.sales_orders where customer_id = p_customer
                   and status in ('confirmed', 'packing', 'ready_for_pickup', 'dispatched', 'delivered')), 0)
       - coalesce((select sum(amount) from public.payments where customer_id = p_customer and status = 'confirmed'), 0)
$$;

-- Overdue: terms orders past their due date and not fully paid, or an opening balance past due.
create or replace function public.customer_overdue(p_customer uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(
    coalesce((select sum(total - paid_amount) from public.sales_orders where customer_id = p_customer and payment_mode = 'terms'
              and status in ('ready_for_pickup', 'dispatched', 'delivered') and due_date < public.manila_today() and paid_amount < total), 0)
    + coalesce((select case when opening_due_date < public.manila_today() then opening_balance else 0 end from public.customers where id = p_customer), 0)
    - coalesce((select sum(amount) from public.payments where customer_id = p_customer and status = 'confirmed' and order_id is null), 0), 0)
$$;
revoke execute on function public.customer_balance, public.customer_overdue from public, anon;
grant execute on function public.customer_balance, public.customer_overdue to authenticated;

-- ---------------------------------------------------------------- reservations
-- Reserve FEFO lots for every stocked line (bundles reserve their components; services and pre-order items skip).
create or replace function public.allocate_sales_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.sales_orders;
  l record;
  r record;
  prod public.products;
  avail numeric;
begin
  select * into o from public.sales_orders where id = p_order;
  for l in
    select sl.id line_id, sl.product_id, sl.qty from public.sales_order_lines sl
    join public.products p on p.id = sl.product_id
    where sl.order_id = p_order and p.item_type not in ('service', 'bundle')
      and not exists (select 1 from public.sales_order_allocations a where a.line_id = sl.id)
    union all
    select sl.id, bc.component_id, sl.qty * bc.qty from public.sales_order_lines sl
    join public.products p on p.id = sl.product_id and p.item_type = 'bundle'
    join public.bundle_components bc on bc.bundle_id = sl.product_id
    where sl.order_id = p_order and not exists (select 1 from public.sales_order_allocations a where a.line_id = sl.id and a.product_id = bc.component_id)
  loop
    select * into prod from public.products where id = l.product_id;
    if prod.pre_order and o.status = 'draft' then continue; end if; -- pre-order lines are picked when packing
    select coalesce(sum(available), 0) into avail from public.stock_available where product_id = l.product_id and location_id = o.location_id;
    if avail < l.qty then
      raise exception 'Only % % of % (%) available.', trim_scale(avail), prod.base_unit, prod.name, prod.sku;
    end if;
    for r in select * from public.reserve_stock(l.product_id, o.location_id, l.qty, 'sales_orders', p_order) loop
      insert into public.sales_order_allocations (order_id, line_id, product_id, batch_id, bin_id, qty)
      values (p_order, l.line_id, l.product_id, r.batch_id, r.bin_id, r.qty);
    end loop;
  end loop;
end $$;
revoke execute on function public.allocate_sales_order from public, anon, authenticated;

create or replace function public.set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.sales_engine', 'on', true);
  update public.sales_orders set status = p_status,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    ready_at = case when p_status = 'ready_for_pickup' then now() else ready_at end,
    dispatched_at = case when p_status = 'dispatched' then now() else dispatched_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where id = p_order;
  perform set_config('app.sales_engine', 'off', true);
end $$;
revoke execute on function public.set_order_status from public, anon, authenticated;

-- ---------------------------------------------------------------- place (internal + staff)
create or replace function public.place_order_internal(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.sales_orders;
  c public.customers;
  bal numeric;
  od numeric;
begin
  select * into o from public.sales_orders where id = p_order for update;
  if o.status <> 'draft' then raise exception 'This order was already placed.'; end if;
  if not exists (select 1 from public.sales_order_lines where order_id = p_order) then raise exception 'Add at least one product.'; end if;
  if o.total <= 0 then raise exception 'The order total must be more than zero.'; end if;
  select * into c from public.customers where id = o.customer_id;
  if not c.active then raise exception 'This customer is inactive.'; end if;
  perform set_config('app.sales_engine', 'on', true);
  update public.sales_orders set placed_at = now(), placed_by = auth.uid() where id = p_order;
  perform set_config('app.sales_engine', 'off', true);
  perform public.allocate_sales_order(p_order);

  if o.payment_mode = 'prepaid' then
    perform public.set_order_status(p_order, 'awaiting_payment');
    perform public.emit_event('sales.order_placed', 'sales_orders', p_order::text,
      jsonb_build_object('recipients', to_jsonb(public.users_with_role('sales_head') || public.users_with_role('operations_manager')),
                         'number', o.number, 'customer', c.name, 'total', to_char(o.total, 'FM999,999,990.00'), 'href', '/sales/orders/' || p_order));
    return 'awaiting_payment';
  end if;

  bal := public.customer_balance(c.id);
  od := public.customer_overdue(c.id);
  if c.on_hold or od > 0 or bal + o.total > c.credit_limit then
    perform public.start_approval('sales_order_credit', p_order, o.total,
      format('Credit release %s for %s: ₱%s (balance ₱%s, limit ₱%s%s%s)', o.number, c.name, to_char(o.total, 'FM999,999,990.00'),
             to_char(bal, 'FM999,999,990.00'), to_char(c.credit_limit, 'FM999,999,990.00'),
             case when od > 0 then ', overdue ₱' || to_char(od, 'FM999,999,990.00') else '' end,
             case when c.on_hold then ', ON HOLD' else '' end),
      coalesce(auth.uid(), o.created_by));
    return 'credit_review';
  end if;
  perform public.set_order_status(p_order, 'confirmed');
  return 'confirmed';
end $$;
revoke execute on function public.place_order_internal from public, anon, authenticated;

create or replace function public.can_view_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sales_orders o join public.customers c on c.id = o.customer_id where o.id = p_order and (
    public.has_permission('sales.view_all') or public.can_read_all() or c.user_id = auth.uid()
    or (public.has_permission('sales.view') and (o.rep_id = auth.uid() or o.created_by = auth.uid()))
    or public.has_permission_at('sales.fulfil', o.location_id) or public.has_permission('sales.payments.confirm')
    or exists (select 1 from public.approval_requests r join public.approval_steps s on s.request_id = r.id
               where r.doc_type = 'sales_order_credit' and r.record_id = o.id and s.approver_ids && public.my_approver_ids())))
$$;
revoke execute on function public.can_view_order from public, anon;
grant execute on function public.can_view_order to authenticated;

create or replace function public.place_sales_order(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o public.sales_orders;
begin
  select * into o from public.sales_orders where id = p_order;
  if o.id is null or not public.has_permission('sales.orders.create')
     or not (o.created_by = auth.uid() or o.rep_id = auth.uid() or public.has_permission('sales.view_all')) then
    raise exception 'You can''t place this order.';
  end if;
  return public.place_order_internal(p_order);
end $$;

-- ---------------------------------------------------------------- cancel
create or replace function public.cancel_sales_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.sales_orders;
begin
  select * into o from public.sales_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found.'; end if;
  if auth.uid() is not null and not (
       public.has_permission('sales.view_all')
       or (public.has_permission('sales.orders.create') and (o.created_by = auth.uid() or o.rep_id = auth.uid()))) then
    raise exception 'You can''t cancel this order.';
  end if;
  if o.status not in ('draft', 'awaiting_payment', 'confirmed', 'packing', 'credit_review') then
    raise exception 'A % order can''t be cancelled. Use a return once it has left the warehouse.', replace(o.status, '_', ' ');
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Please give a reason.'; end if;
  if o.paid_amount > 0 then raise exception 'This order has confirmed payments. Refund or move the payment first.'; end if;
  if o.status = 'credit_review' then
    perform public.cancel_approval((select id from public.approval_requests where doc_type = 'sales_order_credit' and record_id = p_order and status = 'pending' limit 1));
  end if;
  perform public.release_reservations('sales_orders', p_order);
  delete from public.sales_order_allocations where order_id = p_order and movement_id is null;
  perform set_config('app.sales_engine', 'on', true);
  update public.sales_orders set cancel_reason = trim(p_reason) where id = p_order;
  perform set_config('app.sales_engine', 'off', true);
  perform public.set_order_status(p_order, 'cancelled');
end $$;

-- ================================================================ payments
-- After a payment is confirmed: update the order's paid amount and release prepaid orders once fully paid.
create or replace function public.apply_payment_to_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.sales_orders;
  paid numeric;
begin
  if p_order is null then return; end if;
  select * into o from public.sales_orders where id = p_order for update;
  select coalesce(sum(amount), 0) into paid from public.payments where order_id = p_order and status = 'confirmed';
  perform set_config('app.sales_engine', 'on', true);
  update public.sales_orders set paid_amount = paid where id = p_order;
  perform set_config('app.sales_engine', 'off', true);
  if o.status = 'awaiting_payment' and paid >= o.total then
    perform public.set_order_status(p_order, 'confirmed');
    perform public.emit_event('sales.order_paid', 'sales_orders', p_order::text,
      jsonb_build_object('recipients', to_jsonb(public.users_with_role('warehouse') || public.users_with_role('operations_manager')),
                         'number', o.number, 'href', '/sales/fulfilment'));
  end if;
end $$;
revoke execute on function public.apply_payment_to_order from public, anon, authenticated;

create or replace function public.record_payment(p_customer uuid, p_order uuid, p_method text, p_amount numeric, p_reference text,
                                                 p_paid_on date default null, p_notes text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  o public.sales_orders;
begin
  if not public.has_permission('sales.payments.record') and not public.has_permission('sales.payments.confirm') then
    raise exception 'You can''t record payments.';
  end if;
  if p_order is not null then
    select * into o from public.sales_orders where id = p_order;
    if o.customer_id <> p_customer then raise exception 'That order belongs to another customer.'; end if;
    if o.status in ('draft', 'cancelled') then raise exception 'You can''t pay a % order.', o.status; end if;
    if not public.can_view_order(p_order) then raise exception 'Order not found.'; end if;
  elsif not public.can_view_customer(p_customer) then
    raise exception 'Customer not found.';
  end if;
  if p_method <> 'cash' and length(trim(coalesce(p_reference, ''))) < 3 then
    raise exception 'Enter the reference number (bank, GCash, Maya or cheque).';
  end if;
  insert into public.payments (number, customer_id, order_id, method, amount, reference, paid_on, notes, received_by)
  values ('', p_customer, p_order, p_method, p_amount, trim(coalesce(p_reference, '')), coalesce(p_paid_on, public.manila_today()),
          coalesce(p_notes, ''), auth.uid())
  returning id into pid;
  perform public.emit_event('payment.submitted', 'payments', pid::text,
    jsonb_build_object('recipients', to_jsonb(public.users_with_role('accounting_officer') || public.users_with_role('cfo')),
                       'amount', to_char(p_amount, 'FM999,999,990.00'), 'method', p_method, 'href', '/sales/payments'));
  return pid;
end $$;

-- Finance confirms against the bank/e-wallet statement. The person who recorded a payment can't confirm it.
create or replace function public.confirm_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  if not public.has_permission('sales.payments.confirm') then raise exception 'Only finance can confirm payments.'; end if;
  select * into p from public.payments where id = p_payment for update;
  if p.id is null then raise exception 'Payment not found.'; end if;
  if p.status <> 'pending' then raise exception 'This payment was already %.', p.status; end if;
  if p.received_by = auth.uid() then raise exception 'You recorded this payment, so someone else has to confirm it.'; end if;
  perform set_config('app.sales_engine', 'on', true);
  update public.payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_payment;
  perform set_config('app.sales_engine', 'off', true);
  perform public.apply_payment_to_order(p.order_id);
  perform public.emit_event('payment.confirmed', 'payments', p_payment::text,
    jsonb_build_object('amount', p.amount, 'order_id', p.order_id, 'customer_id', p.customer_id, 'method', p.method));
end $$;

create or replace function public.reject_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  if not public.has_permission('sales.payments.confirm') then raise exception 'Only finance can reject payments.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Please give a reason.'; end if;
  select * into p from public.payments where id = p_payment for update;
  if p.status <> 'pending' then raise exception 'This payment was already %.', p.status; end if;
  perform set_config('app.sales_engine', 'on', true);
  update public.payments set status = 'rejected', reject_reason = trim(p_reason), confirmed_by = auth.uid(), confirmed_at = now() where id = p_payment;
  perform set_config('app.sales_engine', 'off', true);
end $$;

-- PayMongo webhook (server, service role only): an online payment is confirmed by the provider.
create or replace function public.record_online_payment(p_order_number text, p_amount numeric, p_provider_id text, p_method text default 'paymongo')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o public.sales_orders;
  pid uuid;
begin
  select id into pid from public.payments where provider_id = p_provider_id;
  if pid is not null then return pid; end if; -- webhook retries are idempotent
  select * into o from public.sales_orders where number = p_order_number;
  if o.id is null then raise exception 'Unknown order %.', p_order_number; end if;
  insert into public.payments (number, customer_id, order_id, method, amount, reference, from_customer, provider_id, status, confirmed_at)
  values ('', o.customer_id, o.id, 'paymongo', p_amount, p_provider_id, true, p_provider_id, 'confirmed', now())
  returning id into pid;
  perform public.apply_payment_to_order(o.id);
  return pid;
end $$;
revoke execute on function public.record_online_payment from public, anon, authenticated;

-- ================================================================ fulfilment
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  courier text not null,
  tracking_no text not null default '',
  fee_info numeric(18, 2) check (fee_info is null or fee_info >= 0), -- paid by the customer to the courier; information only
  pickup_location_id uuid references public.locations(id),
  booked_by uuid default auth.uid() references public.profiles(id),
  dispatched_at timestamptz not null default now(),
  delivered_at timestamptz,
  pod_note text not null default '',
  created_at timestamptz not null default now()
);
create index on public.shipments (order_id);
create index on public.shipments (tracking_no) where tracking_no <> '';

create or replace function public.require_fulfil(p_order uuid) returns public.sales_orders
language plpgsql security definer set search_path = public as $$
declare o public.sales_orders;
begin
  select * into o from public.sales_orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found.'; end if;
  if not public.has_permission_at('sales.fulfil', o.location_id) then raise exception 'You can''t fulfil orders from this location.'; end if;
  return o;
end $$;
revoke execute on function public.require_fulfil from public, anon, authenticated;

create or replace function public.start_packing(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.sales_orders;
begin
  o := public.require_fulfil(p_order);
  if o.status <> 'confirmed' then raise exception 'Only confirmed orders (paid or credit approved) can be packed.'; end if;
  perform public.set_order_status(p_order, 'packing');
  perform public.allocate_sales_order(p_order); -- picks up pre-order lines that now have stock
end $$;

-- The inventory moment: post sale_dispatch for every allocated lot. Only paid or credit-approved orders get here.
create or replace function public.mark_ready_for_pickup(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.sales_orders;
  a public.sales_order_allocations;
  mid bigint;
  missing text;
begin
  o := public.require_fulfil(p_order);
  if o.status not in ('confirmed', 'packing') then
    raise exception 'Only paid or credit-approved orders can be released (this one is %).', replace(o.status, '_', ' ');
  end if;
  if o.payment_mode = 'prepaid' and o.paid_amount < o.total then
    raise exception 'This order isn''t fully paid yet (₱% of ₱%).', o.paid_amount, o.total;
  end if;
  perform public.allocate_sales_order(p_order);
  select string_agg(p.sku, ', ') into missing
  from public.sales_order_lines sl join public.products p on p.id = sl.product_id
  where sl.order_id = p_order and p.item_type not in ('service', 'bundle')
    and coalesce((select sum(al.qty) from public.sales_order_allocations al where al.line_id = sl.id), 0) < sl.qty;
  if missing is not null then raise exception 'Not enough stock picked for: %.', missing; end if;

  perform public.release_reservations('sales_orders', p_order);
  for a in select * from public.sales_order_allocations where order_id = p_order and movement_id is null loop
    mid := public.post_stock_movement(a.product_id, o.location_id, a.bin_id, a.batch_id, -a.qty, 'sale_dispatch', null,
                                      'sales_orders', o.id, o.number, 'Sale');
    update public.sales_order_allocations set movement_id = mid where id = a.id;
  end loop;
  perform set_config('app.sales_engine', 'on', true);
  update public.sales_orders set due_date = case when payment_mode = 'terms' then public.manila_today() + terms_days end where id = p_order;
  perform set_config('app.sales_engine', 'off', true);
  perform public.set_order_status(p_order, 'ready_for_pickup');
  perform public.issue_billing_invoice(p_order);
  perform public.emit_event('sales.order_ready', 'sales_orders', p_order::text,
    jsonb_build_object('number', o.number, 'total', o.total, 'customer_id', o.customer_id));
end $$;

create or replace function public.dispatch_order(p_order uuid, p_courier text, p_tracking text, p_fee numeric default null,
                                                 p_pickup uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare o public.sales_orders;
begin
  o := public.require_fulfil(p_order);
  if o.status <> 'ready_for_pickup' then raise exception 'Mark the order ready for pickup first.'; end if;
  if length(trim(coalesce(p_courier, ''))) < 2 then raise exception 'Enter the courier.'; end if;
  insert into public.shipments (order_id, courier, tracking_no, fee_info, pickup_location_id)
  values (p_order, trim(p_courier), trim(coalesce(p_tracking, '')), p_fee, p_pickup);
  perform public.set_order_status(p_order, 'dispatched');
end $$;

create or replace function public.mark_delivered(p_order uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare o public.sales_orders;
begin
  o := public.require_fulfil(p_order);
  if o.status <> 'dispatched' then raise exception 'Only dispatched orders can be marked delivered.'; end if;
  update public.shipments set delivered_at = now(), pod_note = coalesce(p_note, '') where order_id = p_order and delivered_at is null;
  perform public.set_order_status(p_order, 'delivered');
end $$;

-- Returns come back into a RETURNS bin (not sellable) so the warehouse/QA can inspect, then transfer or write off.
create or replace function public.return_sales_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.sales_orders;
  a public.sales_order_allocations;
  rb uuid;
begin
  o := public.require_fulfil(p_order);
  if o.status not in ('ready_for_pickup', 'dispatched', 'delivered') then raise exception 'Only released orders can be returned.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Please give a reason.'; end if;
  insert into public.bins (location_id, code, kind) values (o.location_id, 'RETURNS', 'receiving') on conflict (location_id, code) do nothing;
  select id into rb from public.bins where location_id = o.location_id and code = 'RETURNS';
  for a in select * from public.sales_order_allocations where order_id = p_order and movement_id is not null loop
    perform public.post_stock_movement(a.product_id, o.location_id, rb, a.batch_id, a.qty, 'return_in',
      (select unit_cost from public.stock_movement_costs where movement_id = a.movement_id), 'sales_orders', o.id, o.number, 'Return: ' || trim(p_reason));
  end loop;
  perform set_config('app.sales_engine', 'on', true);
  update public.sales_orders set cancel_reason = trim(p_reason) where id = p_order;
  perform set_config('app.sales_engine', 'off', true);
  perform public.set_order_status(p_order, 'returned');
  update public.billing_invoices set status = 'void' where order_id = p_order;
end $$;

-- ================================================================ billing invoices and official SI monitoring
create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  order_id uuid not null unique references public.sales_orders(id),
  customer_id uuid not null references public.customers(id),
  issued_on date not null default public.manila_today(),
  due_on date,
  total numeric(18, 2) not null,
  status text not null default 'issued' check (status in ('issued', 'void')),
  created_at timestamptz not null default now()
);
create index on public.billing_invoices (customer_id, issued_on desc);

create or replace function public.issue_billing_invoice(p_order uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o public.sales_orders;
  bid uuid;
begin
  select id into bid from public.billing_invoices where order_id = p_order;
  if bid is not null then return bid; end if;
  select * into o from public.sales_orders where id = p_order;
  insert into public.billing_invoices (number, order_id, customer_id, due_on, total)
  values (public.next_document_number('billing_invoice'), p_order, o.customer_id, o.due_date, o.total) returning id into bid;
  return bid;
end $$;
revoke execute on function public.issue_billing_invoice from public, anon, authenticated;

create table public.si_booklets (
  id uuid primary key default gen_random_uuid(),
  series text not null default '' check (series ~ '^[A-Z0-9-]{0,10}$'),
  start_no int not null check (start_no > 0),
  end_no int not null,
  holder_id uuid references public.profiles(id) on delete set null,
  location_id uuid references public.locations(id),
  received_on date not null default public.manila_today(),
  status text not null default 'active' check (status in ('active', 'used_up', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint range_ok check (end_no >= start_no and end_no - start_no < 5000)
);
-- booklets of the same series can't overlap
create or replace function public.si_booklet_no_overlap() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.si_booklets b where b.id <> new.id and b.series = new.series and b.status <> 'cancelled'
             and int4range(b.start_no, b.end_no, '[]') && int4range(new.start_no, new.end_no, '[]')) then
    raise exception 'This number range overlaps another booklet.';
  end if;
  return new;
end $$;
create trigger si_booklet_no_overlap before insert or update on public.si_booklets for each row execute function public.si_booklet_no_overlap();

create table public.si_issuances (
  id uuid primary key default gen_random_uuid(),
  series text not null default '',
  si_no int not null check (si_no > 0),
  booklet_id uuid references public.si_booklets(id),
  invoice_id uuid references public.billing_invoices(id),
  customer_id uuid references public.customers(id),
  amount numeric(18, 2),
  issued_on date not null default public.manila_today(),
  status text not null default 'issued' check (status in ('issued', 'void', 'spoiled')),
  note text not null default '',
  recorded_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (series, si_no)
);
create index on public.si_issuances (invoice_id);
create index on public.si_issuances (booklet_id, si_no);

create or replace function public.record_si(p_invoice uuid, p_series text, p_si_no int, p_status text default 'issued', p_note text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.billing_invoices;
  bk uuid;
  sid uuid;
begin
  if not public.has_permission('sales.invoices.manage') then raise exception 'You can''t record official invoices.'; end if;
  if p_status not in ('issued', 'void', 'spoiled') then raise exception 'Unknown status.'; end if;
  if p_status = 'issued' and p_invoice is null then raise exception 'Pick the billing invoice this SI was issued for.'; end if;
  if p_status <> 'issued' and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Say why the SI was voided or spoiled.'; end if;
  if exists (select 1 from public.si_issuances where series = upper(coalesce(p_series, '')) and si_no = p_si_no) then
    raise exception 'SI % % was already recorded (duplicate).', upper(coalesce(p_series, '')), p_si_no;
  end if;
  select id into bk from public.si_booklets where series = upper(coalesce(p_series, '')) and status <> 'cancelled'
    and p_si_no between start_no and end_no limit 1;
  if p_invoice is not null then
    select * into inv from public.billing_invoices where id = p_invoice;
    if exists (select 1 from public.si_issuances where invoice_id = p_invoice and status = 'issued') and p_status = 'issued' then
      raise exception 'This billing invoice already has an official SI.';
    end if;
  end if;
  insert into public.si_issuances (series, si_no, booklet_id, invoice_id, customer_id, amount, status, note)
  values (upper(coalesce(p_series, '')), p_si_no, bk, p_invoice, inv.customer_id, inv.total, p_status,
          coalesce(p_note, '') || case when bk is null then ' [out of range: no booklet holds this number]' else '' end)
  returning id into sid;
  if bk is not null and not exists (
       select 1 from generate_series((select start_no from public.si_booklets where id = bk), (select end_no from public.si_booklets where id = bk)) n
       where not exists (select 1 from public.si_issuances i where i.series = upper(coalesce(p_series, '')) and i.si_no = n)) then
    update public.si_booklets set status = 'used_up' where id = bk;
  end if;
  return sid;
end $$;

-- Monitoring: out-of-range numbers, gaps (skipped numbers below the highest used in a booklet), invoices without SI.
create or replace view public.si_exceptions with (security_invoker = true) as
  select 'out_of_range'::text as kind, i.series, i.si_no, i.issued_on, i.invoice_id, null::uuid as booklet_id,
         'SI number is not in any registered booklet' as detail
  from public.si_issuances i where i.booklet_id is null
  union all
  select 'gap', b.series, n.n, null::date, null::uuid, b.id, 'Skipped number (not issued, voided or spoiled)'
  from public.si_booklets b
  cross join lateral generate_series(b.start_no, coalesce((select max(si_no) from public.si_issuances i where i.booklet_id = b.id), b.start_no - 1)) n(n)
  where b.status <> 'cancelled' and not exists (select 1 from public.si_issuances i where i.series = b.series and i.si_no = n.n)
  union all
  select 'missing_si', '', null::int, bi.issued_on, bi.id, null::uuid, 'Billing invoice ' || bi.number || ' has no official SI yet'
  from public.billing_invoices bi
  where bi.status = 'issued' and bi.issued_on < public.manila_today()
    and not exists (select 1 from public.si_issuances i where i.invoice_id = bi.id and i.status = 'issued');
grant select on public.si_exceptions to authenticated;

-- ================================================================ shop (public)
-- Catalog for anyone: active products sold online, retail price, in-stock flag. Never cost or quantities.
create or replace function public.shop_catalog() returns table (
  id uuid, sku text, name text, brand text, category text, size_label text, srp numeric, description text, image_url text,
  item_type text, pre_order boolean, in_stock boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.sku, p.name, b.name, c.name, p.size_label, p.srp, p.description, p.image_url, p.item_type::text, p.pre_order,
         case
           when p.item_type = 'service' or p.pre_order then true
           when p.item_type = 'bundle' then exists (select 1 from public.bundle_components bc where bc.bundle_id = p.id)
             and not exists (select 1 from public.bundle_components bc where bc.bundle_id = p.id
               and coalesce((select sum(available) from public.stock_available a where a.product_id = bc.component_id
                             and a.location_id = public.shop_location()), 0) < bc.qty)
           else coalesce((select sum(available) from public.stock_available a where a.product_id = p.id
                          and a.location_id = public.shop_location()), 0) > 0
         end
  from public.products p
  left join public.brands b on b.id = p.brand_id
  left join public.product_categories c on c.id = p.category_id
  where p.active and p.srp is not null and 'portal' = any (p.sellable_channels)
    and (p.item_type <> 'bundle' or exists (select 1 from public.bundle_components bc where bc.bundle_id = p.id))
    and coalesce((select shop_enabled from public.app_settings limit 1), true)
$$;
grant execute on function public.shop_catalog to anon, authenticated;

-- Prices for the signed-in shop customer (their price list), or SRP for guests.
create or replace function public.shop_prices(p_product_ids uuid[]) returns table (product_id uuid, price numeric)
language sql stable security definer set search_path = public as $$
  select x.id, (select r.price from public.resolve_price((select id from public.customers where user_id = auth.uid() and auth.uid() is not null), x.id, 1) r)
  from unnest(p_product_ids) x(id)
  where exists (select 1 from public.products p where p.id = x.id and p.active and 'portal' = any (p.sellable_channels))
$$;
grant execute on function public.shop_prices to anon, authenticated;

-- Place a shop order. p: {name, mobile, email, address:{line, city, province, zip}, courier_note, notes, lines:[{sku, qty}]}
create or replace function public.place_shop_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mobile text := regexp_replace(coalesce(p->>'mobile', ''), '[^0-9+]', '', 'g');
  shop_cust uuid;
  v_price numeric;
  nm text := trim(coalesce(p->>'name', ''));
  cid uuid;
  oid uuid;
  l jsonb;
  prod public.products;
  q numeric;
  n int := 0;
  loc uuid := public.shop_location();
  res text;
  o public.sales_orders;
begin
  if not coalesce((select shop_enabled from public.app_settings limit 1), true) then raise exception 'The shop is closed right now.'; end if;
  if length(nm) < 2 or length(nm) > 120 then raise exception 'Please enter your name.'; end if;
  if v_mobile !~ '^(09|\+639)[0-9]{9}$' then raise exception 'Please enter a valid PH mobile number (09XXXXXXXXX).'; end if;
  if coalesce(p->>'email', '') <> '' and (p->>'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email address doesn''t look right.'; end if;
  if length(trim(coalesce(p->'address'->>'line', ''))) < 5 or length(trim(coalesce(p->'address'->>'city', ''))) < 2 then
    raise exception 'Please enter the delivery address and city.';
  end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'Your cart is empty.'; end if;
  if jsonb_array_length(p->'lines') > 50 then raise exception 'Too many items in one order (max 50 lines).'; end if;
  -- simple abuse limits
  if (select count(*) from public.sales_orders so join public.customers c on c.id = so.customer_id
      where so.channel = 'shop' and c.mobile = v_mobile and so.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many orders from this number in the last hour. Please call us instead.';
  end if;
  if (select count(*) from public.sales_orders where channel = 'shop' and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'The shop is busy. Please try again in a minute.';
  end if;

  -- customer: the signed-in account, else match by mobile, else a new retail customer
  if auth.uid() is not null then select id into shop_cust from public.customers where user_id = auth.uid(); end if;
  cid := shop_cust;
  if cid is null then select id into cid from public.customers where mobile = v_mobile and active order by created_at limit 1; end if;
  if cid is null then
    insert into public.customers (code, name, type, mobile, email, source)
    values ('', nm, 'retail', v_mobile, coalesce(p->>'email', ''), 'shop') returning id into cid;
  end if;

  perform set_config('app.sales_engine', 'on', true);
  insert into public.sales_orders (number, customer_id, channel, status, payment_mode, location_id, ship_to, courier_note, notes)
  values ('', cid, 'shop', 'draft', 'prepaid', loc,
          jsonb_build_object('recipient', nm, 'phone', v_mobile, 'email', coalesce(p->>'email', ''),
                             'line', trim(p->'address'->>'line'), 'city', trim(p->'address'->>'city'),
                             'province', trim(coalesce(p->'address'->>'province', '')), 'zip', trim(coalesce(p->'address'->>'zip', ''))),
          left(coalesce(p->>'courier_note', ''), 300), left(coalesce(p->>'notes', ''), 500))
  returning id into oid;
  perform set_config('app.sales_engine', 'off', true);

  for l in select value from jsonb_array_elements(p->'lines') loop
    n := n + 1;
    select * into prod from public.products where sku = upper(l->>'sku') and active and 'portal' = any (sellable_channels);
    if prod.id is null then raise exception 'Item % is no longer available.', l->>'sku'; end if;
    q := (l->>'qty')::numeric;
    if q is null or q < 1 or q > 999 or q <> trunc(q) then raise exception 'Quantity for % must be 1 to 999.', prod.name; end if;
    -- guests always pay SRP; only a signed-in customer gets their own prices (a mobile number proves nothing)
    v_price := case when shop_cust is not null then (select r.price from public.resolve_price(shop_cust, prod.id, q) r) else prod.srp end;
    insert into public.sales_order_lines (order_id, product_id, qty, unit_price) values (oid, prod.id, q, v_price);
  end loop;
  res := public.place_order_internal(oid);
  select * into o from public.sales_orders where id = oid;
  return jsonb_build_object('number', o.number, 'total', o.total, 'status', o.status);
end $$;
grant execute on function public.place_shop_order to anon, authenticated;

-- Order status for the "track my order" page: order number + the mobile used.
create or replace function public.shop_order_status(p_number text, p_mobile text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'status', o.status, 'placed_at', o.placed_at, 'total', o.total, 'paid', o.paid_amount,
    'ship_to', o.ship_to, 'courier_note', o.courier_note,
    'lines', (select jsonb_agg(jsonb_build_object('name', p.name, 'sku', p.sku, 'qty', l.qty, 'price', l.unit_price, 'total', l.line_total) order by p.name)
              from public.sales_order_lines l join public.products p on p.id = l.product_id where l.order_id = o.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('method', y.method, 'amount', y.amount, 'status', y.status, 'reference', right(y.reference, 4)) order by y.created_at), '[]')
                 from public.payments y where y.order_id = o.id),
    'shipment', (select jsonb_build_object('courier', s.courier, 'tracking_no', s.tracking_no, 'dispatched_at', s.dispatched_at, 'delivered_at', s.delivered_at)
                 from public.shipments s where s.order_id = o.id order by s.created_at desc limit 1),
    'instructions', (select shop_payment_instructions from public.app_settings limit 1),
    'paymongo', (select paymongo_enabled from public.app_settings limit 1))
  from public.sales_orders o join public.customers c on c.id = o.customer_id
  where o.number = upper(trim(p_number)) and o.channel = 'shop'
    and right(regexp_replace(coalesce(o.ship_to->>'phone', c.mobile), '[^0-9]', '', 'g'), 10) = right(regexp_replace(coalesce(p_mobile, ''), '[^0-9]', '', 'g'), 10)
    and length(regexp_replace(coalesce(p_mobile, ''), '[^0-9]', '', 'g')) >= 10
$$;
grant execute on function public.shop_order_status to anon, authenticated;

-- The customer enters their transfer/GCash reference; finance confirms it.
create or replace function public.submit_shop_payment(p_number text, p_mobile text, p_method text, p_reference text, p_amount numeric)
returns text
language plpgsql security definer set search_path = public as $$
declare
  st jsonb := public.shop_order_status(p_number, p_mobile);
  o public.sales_orders;
  pid uuid;
begin
  if st is null then raise exception 'Order not found. Check the order number and mobile number.'; end if;
  select * into o from public.sales_orders where number = upper(trim(p_number));
  if o.status <> 'awaiting_payment' then raise exception 'This order isn''t waiting for payment.'; end if;
  if p_method not in ('bank_transfer', 'gcash', 'maya') then raise exception 'Choose bank transfer, GCash or Maya.'; end if;
  if length(trim(coalesce(p_reference, ''))) < 4 then raise exception 'Enter the reference number from your receipt.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > o.total * 2 then raise exception 'Enter the amount you paid.'; end if;
  if (select count(*) from public.payments where order_id = o.id and status = 'pending') >= 3 then
    raise exception 'We already have payments to check for this order. We''ll update you soon.';
  end if;
  insert into public.payments (number, customer_id, order_id, method, amount, reference, from_customer)
  values ('', o.customer_id, o.id, p_method, p_amount, left(trim(p_reference), 60), true) returning id into pid;
  perform public.emit_event('payment.submitted', 'payments', pid::text,
    jsonb_build_object('recipients', to_jsonb(public.users_with_role('accounting_officer') || public.users_with_role('cfo')),
                       'amount', to_char(p_amount, 'FM999,999,990.00'), 'method', p_method, 'href', '/sales/payments'));
  return 'submitted';
end $$;
grant execute on function public.submit_shop_payment to anon, authenticated;

-- Unpaid shop orders are cancelled after the configured hours (unless a payment is waiting to be checked).
create or replace function public.cancel_unpaid_orders() returns int
language plpgsql security definer set search_path = public as $$
declare
  h int := coalesce((select unpaid_order_hours from public.app_settings limit 1), 48);
  r record;
  n int := 0;
begin
  for r in select id from public.sales_orders o
           where o.status = 'awaiting_payment' and o.channel = 'shop' and o.placed_at < now() - make_interval(hours => h)
             and o.paid_amount = 0 and not exists (select 1 from public.payments y where y.order_id = o.id and y.status = 'pending')
  loop
    perform public.release_reservations('sales_orders', r.id);
    delete from public.sales_order_allocations where order_id = r.id and movement_id is null;
    perform set_config('app.sales_engine', 'on', true);
    update public.sales_orders set cancel_reason = 'Not paid within ' || h || ' hours' where id = r.id;
    perform set_config('app.sales_engine', 'off', true);
    perform public.set_order_status(r.id, 'cancelled');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.cancel_unpaid_orders from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('jdos-cancel-unpaid-orders', '7 * * * *', 'select public.cancel_unpaid_orders()');
  end if;
end $$;

-- ================================================================ RLS
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
alter table public.sales_order_allocations enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.si_booklets enable row level security;
alter table public.si_issuances enable row level security;

create policy "sales_orders: read" on public.sales_orders for select to authenticated
  using (public.has_permission('sales.view_all') or created_by = auth.uid() or rep_id = auth.uid() or public.can_view_order(id));
create policy "sales_orders: insert draft" on public.sales_orders for insert to authenticated
  with check (status = 'draft' and public.has_permission('sales.orders.create') and public.can_view_customer(customer_id));
create policy "sales_orders: edit draft" on public.sales_orders for update to authenticated
  using (status = 'draft' and public.has_permission('sales.orders.create') and (created_by = auth.uid() or public.has_permission('sales.view_all')))
  with check (public.has_permission('sales.orders.create') and public.can_view_customer(customer_id));
create policy "sales_orders: delete draft" on public.sales_orders for delete to authenticated
  using (status = 'draft' and (created_by = auth.uid() or public.has_permission('sales.view_all')));

create policy "sales_order_lines: read" on public.sales_order_lines for select to authenticated using (public.can_view_order(order_id));
create policy "sales_order_lines: draft" on public.sales_order_lines for all to authenticated
  using (exists (select 1 from public.sales_orders o where o.id = order_id and o.status = 'draft' and public.has_permission('sales.orders.create')
                 and (o.created_by = auth.uid() or public.has_permission('sales.view_all'))))
  with check (exists (select 1 from public.sales_orders o where o.id = order_id and o.status = 'draft' and public.has_permission('sales.orders.create')
                      and (o.created_by = auth.uid() or public.has_permission('sales.view_all'))));
create policy "sales_order_allocations: read" on public.sales_order_allocations for select to authenticated using (public.can_view_order(order_id));

create policy "payments: read" on public.payments for select to authenticated
  using (public.has_permission('sales.payments.confirm') or public.has_permission('sales.view_all') or public.can_read_all()
         or received_by = auth.uid() or (order_id is not null and public.can_view_order(order_id))
         or exists (select 1 from public.customers c where c.id = customer_id and c.user_id = auth.uid()));
create policy "shipments: read" on public.shipments for select to authenticated using (public.can_view_order(order_id));
create policy "billing_invoices: read" on public.billing_invoices for select to authenticated
  using (public.has_permission('sales.invoices.manage') or public.can_view_order(order_id));
create policy "si_booklets: read" on public.si_booklets for select to authenticated
  using (public.has_permission('sales.invoices.manage') or public.can_read_all() or holder_id = auth.uid());
create policy "si_booklets: manage" on public.si_booklets for all to authenticated
  using (public.has_permission('sales.invoices.manage')) with check (public.has_permission('sales.invoices.manage'));
create policy "si_issuances: read" on public.si_issuances for select to authenticated
  using (public.has_permission('sales.invoices.manage') or public.can_read_all());

revoke execute on function public.place_sales_order, public.cancel_sales_order, public.record_payment, public.confirm_payment,
  public.reject_payment, public.start_packing, public.mark_ready_for_pickup, public.dispatch_order, public.mark_delivered,
  public.return_sales_order, public.record_si from public, anon;
grant execute on function public.place_sales_order, public.cancel_sales_order, public.record_payment, public.confirm_payment,
  public.reject_payment, public.start_packing, public.mark_ready_for_pickup, public.dispatch_order, public.mark_delivered,
  public.return_sales_order, public.record_si to authenticated;
revoke execute on function public.si_booklet_no_overlap from public, anon, authenticated;

-- ================================================================ approvals, notifications
insert into public.approval_doc_types (doc_type, label, record_table, href_template) values
  ('sales_order_credit', 'Credit release (sales order)', 'sales_orders', '/sales/orders/{{id}}')
on conflict do nothing;
do $$
declare p uuid;
begin
  if not exists (select 1 from public.approval_policies where doc_type = 'sales_order_credit') then
    insert into public.approval_policies (doc_type, name, min_amount, max_amount, priority)
    values ('sales_order_credit', 'Credit release: CEO', null, null, 10) returning id into p;
    insert into public.approval_policy_steps (policy_id, step_no, approver_type, role_id)
    values (p, 1, 'role', (select id from public.roles where code = 'ceo'));
  end if;
end $$;

insert into public.notification_rules (event_type, label, title_template, body_template, href_template, email) values
  ('sales.order_placed', 'A new order is waiting for payment', 'New order {{number}}: ₱{{total}}', '{{customer}} placed an order.', '{{href}}', false),
  ('sales.order_paid', 'An order is paid and ready to pack', 'Paid: {{number}}', 'Pack it and mark it ready for pickup.', '{{href}}', false),
  ('payment.submitted', 'A customer payment needs checking', 'Payment to confirm: ₱{{amount}}', 'Method: {{method}}. Check it against the bank or e-wallet.', '{{href}}', true)
on conflict do nothing;

-- ================================================================ audit
select public.enable_audit(t) from unnest(array['sales_order_lines', 'shipments', 'billing_invoices', 'si_booklets', 'si_issuances']) as t;
select public.enable_audit('sales_orders', false, array['updated_at', 'subtotal', 'discount_total']);
select public.enable_audit('payments');
insert into public.audit_exempt (table_name, reason) values
  ('sales_order_allocations', 'Derived from reservations; each posted lot is on a stock movement.')
on conflict do nothing;
