-- Performance: row-level security on the busiest tables evaluated permission functions once PER ROW (a year of journal
-- lines = tens of thousands of permission checks per report). Wrapping row-independent checks in (select ...) makes
-- Postgres evaluate them once per query (an InitPlan), and a "sees everything" fast path now comes before the per-row
-- function. Access rules are unchanged: every fast path repeats a condition already inside the per-row function.
-- Found by supabase/tests/simulation.test.ts (part B).

-- "Has this permission with no location/department limit" (location-scoped tables can then skip the per-row check).
create or replace function public.has_permission_everywhere(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_active_profile() and public.mfa_ok()
     and exists (select 1 from public.user_grants(auth.uid()) g
                 where (g.grants_all or exists (select 1 from public.role_permissions rp where rp.role_id = g.role_id and rp.permission_code = perm))
                   and g.location_id is null and g.department_id is null)
$$;
revoke execute on function public.has_permission_everywhere from public, anon;
grant execute on function public.has_permission_everywhere to authenticated;

-- ---------------------------------------------------------------- accounting
drop policy "accounts: read" on public.accounts;
create policy "accounts: read" on public.accounts for select to authenticated
  using ((select public.has_permission('accounting.view')) or (select public.has_permission('finance.reports.view'))
         or (select public.has_permission('procurement.invoices.manage')) or (select public.can_read_all()));

drop policy "journal_entries: read" on public.journal_entries;
create policy "journal_entries: read" on public.journal_entries for select to authenticated
  using ((select public.has_permission('accounting.view')) or (select public.can_read_all())
         or created_by = (select auth.uid()) or public.can_view_journal(id));

drop policy "journal_lines: read" on public.journal_lines;
create policy "journal_lines: read" on public.journal_lines for select to authenticated
  using ((select public.has_permission('accounting.view')) or (select public.can_read_all()) or public.can_view_journal(entry_id));

drop policy "supplier_invoices: read" on public.supplier_invoices;
create policy "supplier_invoices: read" on public.supplier_invoices for select to authenticated
  using (created_by = (select auth.uid()) or (select public.has_permission('procurement.invoices.manage'))
         or (select public.has_permission('procurement.view')) or (select public.can_read_all()) or public.can_view_supplier_invoice(id));

-- ---------------------------------------------------------------- sales
drop policy "sales_orders: read" on public.sales_orders;
create policy "sales_orders: read" on public.sales_orders for select to authenticated
  using ((select public.has_permission('sales.view_all')) or (select public.can_read_all()) or (select public.has_permission('sales.payments.confirm'))
         or created_by = (select auth.uid()) or rep_id = (select auth.uid()) or public.can_view_order(id));

drop policy "sales_order_lines: read" on public.sales_order_lines;
create policy "sales_order_lines: read" on public.sales_order_lines for select to authenticated
  using ((select public.has_permission('sales.view_all')) or (select public.can_read_all()) or (select public.has_permission('sales.payments.confirm'))
         or public.can_view_order(order_id));

drop policy "sales_order_allocations: read" on public.sales_order_allocations;
create policy "sales_order_allocations: read" on public.sales_order_allocations for select to authenticated
  using ((select public.has_permission('sales.view_all')) or (select public.can_read_all()) or (select public.has_permission('sales.payments.confirm'))
         or public.can_view_order(order_id));

drop policy "customers: read" on public.customers;
create policy "customers: read" on public.customers for select to authenticated
  using ((select public.has_permission('sales.view_all')) or (select public.can_read_all()) or (select public.has_permission('sales.fulfil'))
         or (select public.has_permission('sales.payments.confirm'))
         or created_by = (select auth.uid()) or owner_id = (select auth.uid()) or public.can_view_customer(id));

drop policy "payments: read" on public.payments;
create policy "payments: read" on public.payments for select to authenticated
  using ((select public.has_permission('sales.payments.confirm')) or (select public.has_permission('sales.view_all')) or (select public.can_read_all())
         or received_by = (select auth.uid())
         or (order_id is not null and public.can_view_order(order_id))
         or exists (select 1 from public.customers c where c.id = payments.customer_id and c.user_id = (select auth.uid())));

-- ---------------------------------------------------------------- inventory
drop policy "products: read" on public.products;
create policy "products: read" on public.products for select to authenticated using ((select public.is_active_user()));

drop policy "batches: read" on public.batches;
create policy "batches: read" on public.batches for select to authenticated
  using ((select public.has_permission('inventory.view')) or (select public.can_read_all()));

drop policy "stock_balances: read" on public.stock_balances;
create policy "stock_balances: read" on public.stock_balances for select to authenticated
  using ((select public.has_permission_everywhere('inventory.view')) or (select public.can_read_all()) or public.has_permission_at('inventory.view', location_id));

drop policy "stock_movements: read" on public.stock_movements;
create policy "stock_movements: read" on public.stock_movements for select to authenticated
  using ((select public.has_permission_everywhere('inventory.view')) or (select public.can_read_all()) or public.has_permission_at('inventory.view', location_id));

-- ---------------------------------------------------------------- people
drop policy "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated
  using ((id = (select auth.uid()) and (select public.is_active_profile())) or (select public.has_permission('admin.users.view'))
         or public.can_view_user(id) or public.is_my_manager(id));

drop policy "user_roles: read" on public.user_roles;
create policy "user_roles: read" on public.user_roles for select to authenticated
  using ((user_id = (select auth.uid()) and (select public.is_active_profile())) or (select public.has_permission('admin.users.view')) or (select public.can_read_all()));

-- ---------------------------------------------------------------- top-bar count in one round trip (layout)
create or replace function public.my_pending_approval_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.approval_steps s
  where s.status = 'pending' and s.approver_ids && public.my_approver_ids()
$$;
revoke execute on function public.my_pending_approval_count from public, anon;
grant execute on function public.my_pending_approval_count to authenticated;
