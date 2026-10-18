-- Only signed-in runners may call the write functions; the private helpers are for policies only
revoke execute on function public.claim_run(uuid, text, boolean) from public, anon;
revoke execute on function public.push_night(uuid, text, text, bigint, jsonb, timestamptz, timestamptz) from public, anon;
revoke execute on function public.push_games(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.reset_view_token(uuid) from public, anon;
revoke execute on function public.get_run_view(text) from public;
revoke execute on function private.is_run_member(uuid) from public, anon;
revoke execute on function private.viewer_token() from public;
grant execute on function private.is_run_member(uuid) to authenticated;
grant execute on function private.viewer_token() to anon, authenticated;
grant execute on function public.get_run_view(text) to anon, authenticated;
