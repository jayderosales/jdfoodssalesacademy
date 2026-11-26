-- Phase 6: CEO Command Center. Aggregate report functions (CEO only), and a daily summary at 7:00 Manila through the
-- notification engine (in-app now; email once email is switched on). Owner answers 2026-11-26: all four areas on the
-- first screen, daily email, CEO only.

insert into public.permissions (code, module, description, is_restricted) values
  ('ceo.reports.view', 'executive', 'Open the CEO Command Center (company-wide reports)', false)
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_code)
select r.id, 'ceo.reports.view' from public.roles r where r.code = 'ceo'
on conflict do nothing;

create or replace function public.require_ceo_reports() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('ceo.reports.view') then raise exception 'Only the CEO can open these reports.'; end if;
end $$;
revoke execute on function public.require_ceo_reports from public, anon;
grant execute on function public.require_ceo_reports to authenticated;

-- Sales are counted when an order is released (Ready for pickup), the same moment the ledger records the sale.
create or replace view public.ceo_released_orders with (security_invoker = true) as
  select o.id, o.number, o.customer_id, o.channel, o.rep_id, o.total, o.paid_amount, o.location_id,
         (o.ready_at at time zone 'Asia/Manila')::date as sale_date
  from public.sales_orders o
  where o.status in ('ready_for_pickup', 'dispatched', 'delivered') and o.ready_at is not null;
revoke all on public.ceo_released_orders from anon;

-- ---------------------------------------------------------------- sales targets
-- Monthly targets: one company-wide target per month (rep_id null), optionally one per rep. Set by the CEO.
create table public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  rep_id uuid references public.profiles(id) on delete cascade,
  amount numeric(18, 2) not null check (amount >= 0),
  notes text not null default '',
  created_by uuid default auth.uid() references public.profiles(id),
  updated_at timestamptz not null default now()
);
create unique index sales_targets_company on public.sales_targets (month) where rep_id is null;
create unique index sales_targets_rep on public.sales_targets (month, rep_id) where rep_id is not null;
create index on public.sales_targets (rep_id);
alter table public.sales_targets enable row level security;
create policy "sales_targets: ceo" on public.sales_targets for all to authenticated
  using (public.has_permission('ceo.reports.view')) with check (public.has_permission('ceo.reports.view'));
-- reps can see their own targets
create policy "sales_targets: own" on public.sales_targets for select to authenticated using (rep_id = auth.uid());
create trigger touch_sales_targets before update on public.sales_targets for each row execute function public.touch_updated_at();
select public.enable_audit('sales_targets', false, array['updated_at']);

-- ---------------------------------------------------------------- daily sales
create or replace function public.ceo_sales_daily(p_from date, p_to date)
returns table (day date, orders bigint, sales numeric, collected numeric)
language plpgsql stable security invoker set search_path = public as $$
begin
  perform public.require_ceo_reports();
  return query
    with days as (select d::date as day from generate_series(p_from, p_to, interval '1 day') d),
    s as (select sale_date, count(*) n, sum(total) amt from public.ceo_released_orders where sale_date between p_from and p_to group by 1),
    c as (select paid_on, sum(amount) amt from public.payments where status = 'confirmed' and paid_on between p_from and p_to group by 1)
    select days.day, coalesce(s.n, 0), coalesce(s.amt, 0), coalesce(c.amt, 0)
    from days left join s on s.sale_date = days.day left join c on c.paid_on = days.day
    order by days.day;
end $$;

-- ---------------------------------------------------------------- sales by dimension
-- p_dim: channel | brand | rep | customer | product. Amounts are line totals (VAT-inclusive, as invoiced).
create or replace function public.ceo_sales_breakdown(p_from date, p_to date, p_dim text, p_limit int default 50)
returns table (key text, label text, orders bigint, qty numeric, amount numeric)
language plpgsql stable security invoker set search_path = public as $$
begin
  perform public.require_ceo_reports();
  if p_dim not in ('channel', 'brand', 'rep', 'customer', 'product') then raise exception 'Unknown breakdown %.', p_dim; end if;
  return query
    select x.key, x.label, count(distinct x.order_id), sum(x.qty), sum(x.amount)
    from (
      select o.id order_id, l.qty, l.line_total amount,
        case p_dim when 'channel' then o.channel when 'brand' then coalesce(p.brand_id::text, '') when 'rep' then coalesce(o.rep_id::text, '')
                   when 'customer' then o.customer_id::text else p.id::text end key,
        case p_dim when 'channel' then initcap(replace(o.channel, '_', ' '))
                   when 'brand' then coalesce(b.name, 'No brand')
                   when 'rep' then coalesce(nullif(pr.full_name, ''), 'No rep (shop / office)')
                   when 'customer' then c.name
                   else p.sku || ' ' || p.name end label
      from public.ceo_released_orders o
      join public.sales_order_lines l on l.order_id = o.id
      join public.products p on p.id = l.product_id
      left join public.brands b on b.id = p.brand_id
      left join public.profiles pr on pr.id = o.rep_id
      join public.customers c on c.id = o.customer_id
      where o.sale_date between p_from and p_to
    ) x
    group by x.key, x.label
    order by sum(x.amount) desc
    limit greatest(1, least(p_limit, 500));
end $$;

-- ---------------------------------------------------------------- training status and sales vs target per rep
create or replace function public.ceo_rep_performance()
returns table (user_id uuid, full_name text, skill_score numeric, at_risk boolean, level int, quizzes_passed bigint, roleplays_30 bigint,
               last_activity timestamptz, sales_mtd numeric, target_month numeric, sales_30 numeric, sales_90 numeric, orders_30 bigint)
language plpgsql stable security invoker set search_path = public as $$
declare today date := public.manila_today(); m0 date := date_trunc('month', public.manila_today())::date;
begin
  perform public.require_ceo_reports();
  return query
    with reps as (
      select distinct p.id, p.full_name from public.profiles p
      where p.status = 'active' and (p.role = 'rep' or exists (
        select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p.id and r.code in ('sales_rep', 'sales_head')))
    ),
    snap as (
      select distinct on (s.user_id) s.user_id, s.skill_score, s.at_risk, s.current_level from public.skill_snapshots s order by s.user_id, s.computed_at desc
    ),
    quiz as (
      select q.user_id, count(distinct q.quiz_id) filter (where q.passed) passed, max(q.submitted_at) last_at from public.quiz_attempts q group by q.user_id
    ),
    rp as (
      select r.user_id, count(*) filter (where r.status = 'graded' and r.started_at > now() - interval '30 days') n30, max(r.started_at) last_at
      from public.roleplay_sessions r group by r.user_id
    ),
    sales as (
      select o.rep_id, sum(o.total) filter (where o.sale_date >= m0) mtd, sum(o.total) filter (where o.sale_date > today - 30) s30, sum(o.total) s90,
             count(*) filter (where o.sale_date > today - 30) n30
      from public.ceo_released_orders o where o.sale_date > least(today - 90, m0 - 1) and o.rep_id is not null group by o.rep_id
    )
    select reps.id, reps.full_name, snap.skill_score, coalesce(snap.at_risk, false), coalesce(snap.current_level, 0),
           coalesce(quiz.passed, 0), coalesce(rp.n30, 0), greatest(quiz.last_at, rp.last_at),
           coalesce(sales.mtd, 0), (select t.amount from public.sales_targets t where t.month = m0 and t.rep_id = reps.id),
           coalesce(sales.s30, 0), coalesce(sales.s90, 0), coalesce(sales.n30, 0)
    from reps left join snap on snap.user_id = reps.id left join quiz on quiz.user_id = reps.id
    left join rp on rp.user_id = reps.id left join sales on sales.rep_id = reps.id
    order by coalesce(sales.mtd, 0) desc, reps.full_name;
end $$;

-- ---------------------------------------------------------------- headline snapshot
create or replace function public.ceo_snapshot() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  today date := public.manila_today();
  m0 date := date_trunc('month', today)::date;
  lm0 date := (date_trunc('month', today) - interval '1 month')::date;
  lm_same date := least((date_trunc('month', today) - interval '1 month')::date + (today - m0), m0 - 1);
  y0 date := date_trunc('year', today)::date;
  out jsonb := '{}';
  v jsonb;
begin
  perform public.require_ceo_reports();

  -- sales and profit
  select jsonb_build_object(
    'today', coalesce(sum(total) filter (where sale_date = today), 0),
    'orders_today', count(*) filter (where sale_date = today),
    'yesterday', coalesce(sum(total) filter (where sale_date = today - 1), 0),
    'mtd', coalesce(sum(total) filter (where sale_date between m0 and today), 0),
    'orders_mtd', count(*) filter (where sale_date between m0 and today),
    'last_month_same_days', coalesce(sum(total) filter (where sale_date between lm0 and lm_same), 0),
    'last_month', coalesce(sum(total) filter (where sale_date between lm0 and m0 - 1), 0),
    'ytd', coalesce(sum(total) filter (where sale_date between y0 and today), 0),
    'orders_ytd', count(*) filter (where sale_date between y0 and today))
  into v from public.ceo_released_orders where sale_date >= least(lm0, y0);
  out := out || jsonb_build_object('sales', v);

  -- targets: this month (company) and the year so far (sum of monthly company targets)
  out := out || jsonb_build_object('target', jsonb_build_object(
    'month', (select amount from public.sales_targets where month = m0 and rep_id is null),
    'ytd', (select sum(amount) from public.sales_targets where rep_id is null and month between y0 and m0),
    'days_in_month', extract(day from (m0 + interval '1 month' - interval '1 day'))::int,
    'day_of_month', extract(day from today)::int));

  select jsonb_build_object(
    'revenue', coalesce(sum(credit - debit) filter (where type = 'income' and subtype = 'sales'), 0),
    'cost_of_sales', coalesce(sum(debit - credit) filter (where subtype = 'cost_of_sales'), 0),
    'net_income', coalesce(sum(credit - debit) filter (where type in ('income', 'expense')), 0),
    'cash', (select coalesce(sum(closing), 0) from public.trial_balance(today, today) t where t.subtype in ('cash', 'bank')),
    'books_live', (select books_live_from is not null from public.app_settings limit 1))
  into v from public.trial_balance(m0, today);
  out := out || jsonb_build_object('ledger', v);

  -- cash and collections
  select jsonb_build_object(
    'owed', coalesce(sum(total - paid_amount), 0),
    'overdue', coalesce(sum(total - paid_amount) filter (where due_date < today), 0),
    'overdue_customers', count(distinct customer_id) filter (where due_date < today))
  into v from public.sales_orders
  where status in ('ready_for_pickup', 'dispatched', 'delivered') and paid_amount < total;
  out := out || jsonb_build_object('receivables', v);

  select jsonb_build_object(
    'owed', coalesce(sum(total - paid_amount), 0),
    'due_7_days', coalesce(sum(total - paid_amount) filter (where coalesce(due_date, invoice_date) <= today + 7), 0),
    'overdue', coalesce(sum(total - paid_amount) filter (where coalesce(due_date, invoice_date) < today), 0))
  into v from public.supplier_invoices where status in ('matched', 'approved') and paid_amount < total;
  out := out || jsonb_build_object('payables', v);

  select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0)) into v from public.payments where status = 'pending';
  out := out || jsonb_build_object('payments_pending', v);

  -- stock and production
  select jsonb_build_object('value', coalesce(sum(sb.on_hand * coalesce(pc.avg_cost, 0)), 0))
  into v from public.stock_balances sb left join public.product_costs pc on pc.product_id = sb.product_id;
  out := out || jsonb_build_object('inventory', v);

  select jsonb_build_object(
    'below_min', count(*) filter (where coalesce(sa.available, 0) <= rr.min_qty and coalesce(sa.available, 0) > 0),
    'out_of_stock', count(*) filter (where coalesce(sa.available, 0) <= 0))
  into v from public.reorder_rules rr left join public.stock_available sa on sa.product_id = rr.product_id and sa.location_id = rr.location_id
  where rr.min_qty > 0;
  out := out || jsonb_build_object('reorder', v);

  select jsonb_build_object('lots', count(distinct b.id), 'value', coalesce(sum(sb.on_hand * coalesce(pc.avg_cost, 0)), 0))
  into v from public.batches b join public.stock_balances sb on sb.batch_id = b.id and sb.on_hand > 0
  left join public.product_costs pc on pc.product_id = b.product_id
  where b.expiry_date between today and today + 60;
  out := out || jsonb_build_object('near_expiry', v);

  select jsonb_build_object('lots', count(*), 'products', count(distinct l.product_id))
  into v from public.production_report_lines l join public.production_reports r on r.id = l.report_id
  where r.status = 'submitted' and r.report_date = today;
  out := out || jsonb_build_object('production_today', v);

  select jsonb_build_object('count', count(*)) into v from public.sales_orders o
  where o.status in ('confirmed', 'packing') and exists (
    select 1 from public.sales_order_lines sl join public.products p on p.id = sl.product_id
    where sl.order_id = o.id and p.item_type not in ('service', 'bundle')
      and coalesce((select sum(a.qty) from public.sales_order_allocations a where a.line_id = sl.id), 0) < sl.qty);
  out := out || jsonb_build_object('incomplete_orders', v);

  -- approvals and risks
  select jsonb_build_object('count', count(*), 'amount', coalesce(sum(r.amount), 0)) into v
  from public.approval_steps s join public.approval_requests r on r.id = s.request_id
  where s.status = 'pending' and r.status = 'pending' and s.approver_ids && public.my_approver_ids();
  out := out || jsonb_build_object('approvals', v);

  select jsonb_build_object('count', count(*)) into v from public.risk_alerts where resolved_at is null;
  out := out || jsonb_build_object('risks', v);
  select jsonb_build_object('count', count(*)) into v from public.unposted_events where resolved_at is null;
  out := out || jsonb_build_object('unposted', v);

  return out || jsonb_build_object('as_of', now(), 'today', today);
end $$;

revoke execute on function public.ceo_sales_daily, public.ceo_sales_breakdown, public.ceo_rep_performance, public.ceo_snapshot from public, anon;
grant execute on function public.ceo_sales_daily, public.ceo_sales_breakdown, public.ceo_rep_performance, public.ceo_snapshot to authenticated;

-- ---------------------------------------------------------------- daily summary (7:00 Manila)
insert into public.notification_rules (event_type, label, title_template, body_template, href_template, in_app, email)
values ('ceo.daily_digest', 'CEO daily summary (7:00 Manila)', 'Daily summary: {{date}}', '{{body}}', '/ceo', true, true)
on conflict (event_type) do nothing;

create or replace function public.send_ceo_daily_digest() returns int
language plpgsql security definer set search_path = public as $$
declare
  ceos uuid[];
  y date := public.manila_today() - 1;
  m0 date := date_trunc('month', public.manila_today() - 1)::date;
  y0 date := date_trunc('year', public.manila_today() - 1)::date;
  mtd numeric; ytd numeric; tgt numeric;
  sales numeric; orders bigint; collected numeric; overdue numeric; due7 numeric; pending_n bigint; appr bigint; risks bigint; prod bigint; incomplete bigint; below bigint;
  body text;
  peso text := '₱';
begin
  ceos := public.users_with_role('ceo');
  if coalesce(cardinality(ceos), 0) = 0 then return 0; end if;
  select coalesce(sum(total), 0), count(*) into sales, orders from public.ceo_released_orders where sale_date = y;
  select coalesce(sum(total) filter (where sale_date >= m0), 0), coalesce(sum(total), 0) into mtd, ytd from public.ceo_released_orders where sale_date between y0 and y;
  select amount into tgt from public.sales_targets where month = m0 and rep_id is null;
  select coalesce(sum(amount), 0) into collected from public.payments where status = 'confirmed' and paid_on = y;
  select coalesce(sum(total - paid_amount) filter (where due_date < y + 1), 0) into overdue from public.sales_orders
    where status in ('ready_for_pickup', 'dispatched', 'delivered') and paid_amount < total;
  select coalesce(sum(total - paid_amount), 0) into due7 from public.supplier_invoices
    where status in ('matched', 'approved') and paid_amount < total and coalesce(due_date, invoice_date) <= y + 8;
  select count(*) into pending_n from public.payments where status = 'pending';
  select count(*) into appr from public.approval_steps s join public.approval_requests r on r.id = s.request_id
    where s.status = 'pending' and r.status = 'pending' and s.approver_ids && ceos;
  select count(*) into risks from public.risk_alerts where resolved_at is null;
  select count(*) into prod from public.production_report_lines l join public.production_reports r on r.id = l.report_id where r.status = 'submitted' and r.report_date = y;
  select count(*) into below from public.reorder_rules rr left join public.stock_available sa on sa.product_id = rr.product_id and sa.location_id = rr.location_id
    where rr.min_qty > 0 and coalesce(sa.available, 0) <= rr.min_qty;
  select count(*) into incomplete from public.sales_orders o where o.status in ('confirmed', 'packing') and exists (
    select 1 from public.sales_order_lines sl join public.products p on p.id = sl.product_id
    where sl.order_id = o.id and p.item_type not in ('service', 'bundle')
      and coalesce((select sum(a.qty) from public.sales_order_allocations a where a.line_id = sl.id), 0) < sl.qty);
  body := format(E'Sales: %s%s (%s orders). Month to date: %s%s%s. Year to date: %s%s. Collected: %s%s.\nCustomers overdue: %s%s. Supplier bills due within 7 days: %s%s. Payments to confirm: %s.\nWaiting for your approval: %s. Escalated items: %s.\nProduction lots reported: %s. Items at or below minimum: %s. Orders waiting for stock: %s.',
    peso, to_char(sales, 'FM999,999,999,990.00'), orders, peso, to_char(mtd, 'FM999,999,999,990.00'),
    case when tgt > 0 then format(' (%s%% of the %s%s target)', round(100 * mtd / tgt), peso, to_char(tgt, 'FM999,999,999,990')) else '' end,
    peso, to_char(ytd, 'FM999,999,999,990.00'), peso, to_char(collected, 'FM999,999,999,990.00'),
    peso, to_char(overdue, 'FM999,999,999,990.00'), peso, to_char(due7, 'FM999,999,999,990.00'), pending_n,
    appr, risks, prod, below, incomplete);
  return public.notify_users('ceo.daily_digest', ceos, jsonb_build_object('date', to_char(y, 'Mon DD, YYYY'), 'body', body));
end $$;
revoke execute on function public.send_ceo_daily_digest from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('jdos-ceo-daily-digest', '0 23 * * *', 'select public.send_ceo_daily_digest()'); -- 07:00 Manila
  end if;
end $$;
