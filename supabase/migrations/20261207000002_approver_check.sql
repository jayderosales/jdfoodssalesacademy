-- Tells a requester, before they press "Send for approval", whether anyone other than them can approve a document of
-- this type and amount (same policy choice, approver rules and CEO / Super administrator fallback as start_approval).
-- Returns only true/false, so it reveals nothing about who holds which role.
create or replace function public.approvers_available(p_doc_type text, p_amount numeric) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  pol public.approval_policies;
  st public.approval_policy_steps;
  ids uuid[];
  me uuid := auth.uid();
begin
  if me is null then return false; end if;
  select * into pol from public.approval_policies
  where doc_type = p_doc_type and active
    and (min_amount is null or p_amount >= min_amount)
    and (max_amount is null or p_amount <= max_amount)
  order by priority, min_amount desc nulls last
  limit 1;
  if pol.id is null then return false; end if;
  for st in select * from public.approval_policy_steps where policy_id = pol.id order by step_no loop
    ids := public.resolve_approvers(st, me);
    if cardinality(ids) = 0 then ids := array_remove(public.users_with_role('ceo'), me); end if;
    if cardinality(ids) = 0 then ids := array_remove(public.users_with_role('super_admin'), me); end if;
    if cardinality(ids) = 0 then return false; end if;
  end loop;
  return true;
end $$;
revoke execute on function public.approvers_available from public, anon;
grant execute on function public.approvers_available to authenticated;
