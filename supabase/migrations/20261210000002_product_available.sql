-- Products list "Available" column: sellable quantity across all locations (released, not expired, storage bins,
-- minus reservations), in the product's base unit. A computed column, so the list can select, sort and export it
-- (PostgREST: select=...,stock_available_qty). Runs with the caller's rights, so stock RLS applies.
create or replace function public.stock_available_qty(p public.products) returns numeric
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(available), 0) from public.stock_available where product_id = p.id
$$;
grant execute on function public.stock_available_qty(public.products) to authenticated;
