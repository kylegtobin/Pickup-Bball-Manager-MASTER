alter policy runs_select_member on public.runs
  using (owner_id = (select auth.uid()) or (select private.is_run_member(id)));
alter policy runs_update_member on public.runs
  using (owner_id = (select auth.uid()) or (select private.is_run_member(id)))
  with check (owner_id = (select auth.uid()) or (select private.is_run_member(id)));
-- Nobody edits who owns a run or its id through the API
revoke update on public.runs from authenticated;
grant update (name, gym, view_token, writer_device, writer_seen_at) on public.runs to authenticated;
