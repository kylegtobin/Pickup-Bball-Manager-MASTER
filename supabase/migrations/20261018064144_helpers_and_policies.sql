-- Is the signed-in user the owner or a co-runner of this run? (private schema: not reachable through the API)
create or replace function private.is_run_member(p_run uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.runs r where r.id = p_run and r.owner_id = (select auth.uid()))
      or exists (select 1 from public.run_members m where m.run_id = p_run and m.user_id = (select auth.uid()));
$$;

-- The run token a viewer passed to get_run_view, for this request only
create or replace function private.viewer_token()
returns text
language sql
stable
set search_path = ''
as $$ select nullif(current_setting('pbm.run_token', true), '') $$;

create policy runs_select_member on public.runs for select to authenticated
  using ((select private.is_run_member(id)));
create policy runs_select_viewer on public.runs for select to anon, authenticated
  using (view_token = (select private.viewer_token()));
create policy runs_insert_owner on public.runs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy runs_update_member on public.runs for update to authenticated
  using ((select private.is_run_member(id)))
  with check ((select private.is_run_member(id)));
create policy runs_remove_owner on public.runs for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy run_members_select on public.run_members for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.runs r where r.id = run_id and r.owner_id = (select auth.uid())));
create policy run_members_owner_write on public.run_members for all to authenticated
  using (exists (select 1 from public.runs r where r.id = run_id and r.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.runs r where r.id = run_id and r.owner_id = (select auth.uid())));

create policy nights_member_all on public.nights for all to authenticated
  using ((select private.is_run_member(run_id)))
  with check ((select private.is_run_member(run_id)));
create policy nights_select_viewer on public.nights for select to anon, authenticated
  using (run_id in (select r.id from public.runs r where r.view_token = (select private.viewer_token())));

create policy games_member_all on public.games for all to authenticated
  using ((select private.is_run_member(run_id)))
  with check ((select private.is_run_member(run_id)));
create policy games_select_viewer on public.games for select to anon, authenticated
  using (run_id in (select r.id from public.runs r where r.view_token = (select private.viewer_token())));

create policy attendance_member_all on public.attendance for all to authenticated
  using ((select private.is_run_member(run_id)))
  with check ((select private.is_run_member(run_id)));
create policy attendance_select_viewer on public.attendance for select to anon, authenticated
  using (run_id in (select r.id from public.runs r where r.view_token = (select private.viewer_token())));

grant select on public.runs, public.nights, public.games, public.attendance to anon;
grant select, insert, update, delete on public.runs, public.run_members, public.nights, public.games, public.attendance to authenticated;
