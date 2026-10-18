-- The courtside screen claims the run before writing. Another screen can take over (force),
-- and a screen that's been quiet for 2 minutes loses its claim automatically.
create or replace function public.claim_run(p_run uuid, p_device text, p_force boolean default false)
returns table (claimed boolean, writer_device text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_device is null or char_length(p_device) not between 8 and 64 then
    raise exception 'bad device id';
  end if;
  update public.runs r
     set writer_device = p_device, writer_seen_at = now()
   where r.id = p_run
     and (r.writer_device is null or r.writer_device = p_device
          or r.writer_seen_at < now() - interval '2 minutes' or p_force);
  if found then
    return query select true, p_device;
  else
    return query select false, r.writer_device from public.runs r where r.id = p_run;
  end if;
end;
$$;

-- Send tonight's live state. Only the screen holding the claim can write, and an older version
-- never overwrites a newer one, so retries after a dropped connection are safe.
-- Returns 'ok', 'stale' (already have this or newer) or 'taken' (another screen has the run).
create or replace function public.push_night(
  p_run uuid, p_device text, p_night text, p_version bigint, p_state jsonb,
  p_started_at timestamptz default null, p_ended_at timestamptz default null)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_writer text;
  v_rows integer;
begin
  select r.writer_device into v_writer from public.runs r where r.id = p_run;
  if not found then raise exception 'run not found'; end if;
  if v_writer is distinct from p_device then return 'taken'; end if;
  update public.runs set writer_seen_at = now() where id = p_run;

  insert into public.nights as n (id, run_id, started_at, ended_at, live_state, state_version, updated_at)
  values (p_night, p_run, p_started_at, p_ended_at, p_state, p_version, now())
  on conflict (id) do update
     set live_state = excluded.live_state,
         state_version = excluded.state_version,
         started_at = coalesce(n.started_at, excluded.started_at),
         ended_at = excluded.ended_at,
         updated_at = now()
   where n.state_version < excluded.state_version and n.run_id = excluded.run_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return 'stale'; end if;

  -- Who came tonight (names as entered)
  insert into public.attendance (night_id, run_id, player_key, name)
  select p_night, p_run, lower(left(x.name, 80)), left(x.name, 80)
    from jsonb_array_elements_text(coalesce(p_state -> 'playersTonight', '[]'::jsonb)) as x(name)
   where char_length(x.name) > 0
  on conflict (night_id, player_key) do nothing;
  return 'ok';
end;
$$;

-- What a phone sees: the run, its latest night (live state) and recent games. Needs the run's link token.
create or replace function public.get_run_view(p_token text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_run public.runs;
begin
  if p_token is null or char_length(p_token) < 16 then return null; end if;
  perform set_config('pbm.run_token', p_token, true);
  select * into v_run from public.runs r where r.view_token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'run', jsonb_build_object('name', v_run.name, 'gym', v_run.gym),
    'night', (select jsonb_build_object('id', n.id, 'state', n.live_state, 'updatedAt', n.updated_at, 'startedAt', n.started_at, 'endedAt', n.ended_at)
                from public.nights n where n.run_id = v_run.id order by n.updated_at desc limit 1),
    'games', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nightId', g.night_id, 'n', g.n, 'endedAt', g.ended_at,
                                                          'winner', g.winner, 'winners', g.winners, 'losers', g.losers,
                                                          'final', g.final, 'endedBy', g.ended_by, 'shootout', g.shootout)
                                       order by g.ended_at desc)
                         from (select * from public.games g where g.run_id = v_run.id order by g.ended_at desc limit 500) g), '[]'::jsonb),
    'serverTime', now());
end;
$$;

-- The owner can replace the run's link (the old QR code stops working)
create or replace function public.reset_view_token(p_run uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token text;
begin
  update public.runs r set view_token = replace(gen_random_uuid()::text, '-', '')
   where r.id = p_run and r.owner_id = (select auth.uid())
   returning r.view_token into v_token;
  if v_token is null then raise exception 'only the owner can reset the link'; end if;
  return v_token;
end;
$$;

grant execute on function public.claim_run(uuid, text, boolean) to authenticated;
grant execute on function public.push_night(uuid, text, text, bigint, jsonb, timestamptz, timestamptz) to authenticated;
grant execute on function public.reset_view_token(uuid) to authenticated;
grant execute on function public.get_run_view(text) to anon, authenticated;
