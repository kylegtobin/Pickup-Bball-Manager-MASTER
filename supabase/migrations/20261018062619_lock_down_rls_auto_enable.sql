-- The automatic-RLS helper runs from an event trigger; nobody should call it through the API
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
