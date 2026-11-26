-- Phase 2 (part 6): tighten function grants flagged by the Supabase security advisor.
-- Helpers are for signed-in staff only; trigger functions aren't callable as RPCs at all.

revoke execute on function public.can_stock_doc(text, uuid), public.default_bin(uuid), public.location_is_sellable(uuid),
  public.can_view_stock_adjustment(uuid), public.can_edit_stock_adjustment(uuid) from public, anon;
grant execute on function public.can_stock_doc(text, uuid), public.default_bin(uuid), public.location_is_sellable(uuid),
  public.can_view_stock_adjustment(uuid), public.can_edit_stock_adjustment(uuid) to authenticated;

revoke execute on function public.stock_adjustment_before_write(), public.stock_count_before_write(),
  public.check_bundle_component() from public, anon, authenticated;

alter function public.adjustment_movement_type(text) set search_path = public;

-- ABC classes follow the caller's cost visibility (create_count runs as definer, so counts still see every class).
alter view public.product_abc set (security_invoker = true);
