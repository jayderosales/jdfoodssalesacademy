-- Phase 2 (part 4): entering product costs (and SRP edits are audited on products).
-- The moving-average cost is normally maintained by the stock ledger. An authorised person can also SET it:
--   * before any stock exists (opening cost / standard cost for imports and valuation), or
--   * as a revaluation when stock exists: logged with quantity on hand and the value difference.

insert into public.permissions (code, module, description, is_restricted) values
  ('inventory.cost.manage', 'inventory', 'Enter or revalue product costs', true)
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_code)
select r.id, 'inventory.cost.manage' from public.roles r where r.code in ('operations_manager', 'coo', 'cfo')
on conflict do nothing;

create table public.product_cost_changes (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id),
  old_cost numeric(18, 6) not null,
  new_cost numeric(18, 6) not null check (new_cost >= 0),
  qty_on_hand numeric(18, 4) not null,
  value_change numeric(18, 2) not null,
  reason text not null,
  changed_by uuid not null default auth.uid() references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index on public.product_cost_changes (product_id, changed_at desc);
alter table public.product_cost_changes enable row level security;
create policy "product_cost_changes: read" on public.product_cost_changes for select to authenticated
  using (public.has_permission('inventory.view_cost'));

create trigger product_cost_changes_immutable before update or delete on public.product_cost_changes
  for each row execute function public.stock_ledger_immutable();

create or replace function public.set_product_cost(p_product uuid, p_cost numeric, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  old numeric;
  q numeric;
begin
  if not public.has_permission('inventory.cost.manage') then raise exception 'You don''t have permission to change costs.'; end if;
  if p_cost is null or p_cost < 0 then raise exception 'Cost must be zero or more.'; end if;
  if not exists (select 1 from public.products where id = p_product) then raise exception 'Unknown product.'; end if;
  insert into public.product_costs (product_id) values (p_product) on conflict do nothing;
  select avg_cost into old from public.product_costs where product_id = p_product for update;
  select coalesce(sum(on_hand), 0) into q from public.stock_balances where product_id = p_product;
  if round(p_cost, 6) = old then return; end if;
  if q > 0 and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'There is stock on hand, so this is a revaluation: please give a reason.';
  end if;
  update public.product_costs set avg_cost = round(p_cost, 6), updated_at = now() where product_id = p_product;
  insert into public.product_cost_changes (product_id, old_cost, new_cost, qty_on_hand, value_change, reason)
  values (p_product, old, round(p_cost, 6), q, round(q * (p_cost - old), 2), coalesce(nullif(trim(p_reason), ''), case when q = 0 then 'Cost entered (no stock on hand)' end));
  if q > 0 then
    perform public.emit_event('stock.revalued', 'products', p_product::text,
      jsonb_build_object('old_cost', old, 'new_cost', round(p_cost, 6), 'qty', q, 'value_change', round(q * (p_cost - old), 2)));
  end if;
end $$;
revoke execute on function public.set_product_cost from public, anon;
grant execute on function public.set_product_cost to authenticated;

insert into public.audit_exempt (table_name, reason) values
  ('product_cost_changes', 'Append-only cost change log.')
on conflict do nothing;
