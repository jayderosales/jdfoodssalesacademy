-- Shop: customers can upload a photo of their proof of payment at checkout (or later on the order page), and see the
-- bank details to pay to. Bank details are settings (Settings → Online shop), not code. Guests have no account, so
-- the upload goes through the server (service role) after checking the order number + mobile; staff who confirm
-- payments can view the proof. Nothing is confirmed automatically: finance still checks and confirms.

alter table public.app_settings
  add column shop_bank_name text not null default '',
  add column shop_bank_account_name text not null default '',
  add column shop_bank_account_no text not null default '';

alter table public.payments add column proof_path text;

-- What the shop shows customers about paying (safe for anyone: these are the details customers pay to).
create or replace function public.shop_payment_details() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bank', s.shop_bank_name, 'account_name', s.shop_bank_account_name, 'account_no', s.shop_bank_account_no,
    'instructions', s.shop_payment_instructions)
  from public.app_settings s limit 1
$$;
revoke execute on function public.shop_payment_details from public;
grant execute on function public.shop_payment_details to anon, authenticated;

-- Private bucket for proofs: images or PDF, up to 10 MB. Uploads only through the server (no insert policy).
insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false) on conflict do nothing;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    update storage.buckets set file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
    where id = 'payment-proofs';
  end if;
end $$;
create policy "payment proofs: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((select public.has_permission('sales.payments.confirm')) or (select public.has_permission('sales.view_all'))
         or (select public.can_read_all())));

-- Records the customer's payment with its proof. Called by the server (service role) after the photo is stored;
-- the order number + mobile must match, like the reference-number form.
create or replace function public.submit_shop_payment_proof(p_number text, p_mobile text, p_path text, p_reference text, p_amount numeric,
                                                             p_method text default 'bank_transfer')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  st jsonb := public.shop_order_status(p_number, p_mobile);
  o public.sales_orders;
  pid uuid;
begin
  if st is null then raise exception 'Order not found. Check the order number and mobile number.'; end if;
  select * into o from public.sales_orders where number = upper(trim(p_number));
  if o.status <> 'awaiting_payment' then raise exception 'This order isn''t waiting for payment.'; end if;
  if p_path is null or p_path not like o.number || '/%' then raise exception 'The proof of payment doesn''t belong to this order.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > o.total * 2 then raise exception 'Enter the amount you paid.'; end if;
  if coalesce(p_method, '') not in ('bank_transfer', 'gcash', 'maya') then raise exception 'Choose bank transfer, GCash or Maya.'; end if;
  if (select count(*) from public.payments where order_id = o.id and status = 'pending') >= 3 then
    raise exception 'We already have payments to check for this order. We''ll update you soon.';
  end if;
  insert into public.payments (number, customer_id, order_id, method, amount, reference, from_customer, proof_path)
  values ('', o.customer_id, o.id, p_method, p_amount, coalesce(nullif(left(trim(coalesce(p_reference, '')), 60), ''), 'Proof photo'), true, p_path)
  returning id into pid;
  perform public.emit_event('payment.submitted', 'payments', pid::text,
    jsonb_build_object('recipients', to_jsonb(public.users_with_role('accounting_officer') || public.users_with_role('cfo')),
                       'amount', to_char(p_amount, 'FM999,999,990.00'), 'method', p_method || ' (proof photo)', 'href', '/sales/payments'));
  return pid;
end $$;
revoke execute on function public.submit_shop_payment_proof from public, anon, authenticated;
