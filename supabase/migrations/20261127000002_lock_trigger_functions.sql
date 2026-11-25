-- Trigger functions run automatically; nobody needs to call them through the API (Supabase security advisor).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_columns() from public, anon, authenticated;
revoke execute on function public.write_audit() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
