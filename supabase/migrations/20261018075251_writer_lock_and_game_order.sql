-- Astra Oct 18: a write that started before a take-over could finish after it.
-- Writes now lock the run row for the whole write, so a take-over waits for a write in progress
-- (and a write that comes after a take-over sees the new writer). Game uploads carry a version too.
alter table public.nights add column games_version bigint not null default 0;

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
  select r.writer_device into v_writer from public.runs r where r.id = p_run for update;
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

  insert into public.attendance (night_id, run_id, player_key, name)
  select p_night, p_run, lower(left(x.name, 80)), left(x.name, 80)
    from jsonb_array_elements_text(coalesce(p_state -> 'playersTonight', '[]'::jsonb)) as x(name)
   where char_length(x.name) > 0
  on conflict (night_id, player_key) do nothing;
  return 'ok';
end;
$$;

-- Make tonight's game list match the courtside screen's. Returns 'ok', 'stale' (a newer list is already
-- there) or 'taken' (another screen has the run).
create or replace function public.push_games(p_run uuid, p_device text, p_night text, p_version bigint, p_games jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_writer text;
  v_have bigint;
begin
  select r.writer_device into v_writer from public.runs r where r.id = p_run for update;
  if not found then raise exception 'run not found'; end if;
  if v_writer is distinct from p_device then return 'taken'; end if;
  select n.games_version into v_have from public.nights n where n.id = p_night and n.run_id = p_run for update;
  if not found then raise exception 'night not found'; end if;
  if v_have >= p_version then return 'stale'; end if;
  update public.nights set games_version = p_version where id = p_night;

  update public.games g
     set voided = true
   where g.night_id = p_night and g.run_id = p_run and not g.voided
     and g.id not in (select x ->> 'id' from jsonb_array_elements(coalesce(p_games, '[]'::jsonb)) as x where x ? 'id');

  insert into public.games as g (id, night_id, run_id, n, started_at, ended_at, winner, winners, losers, shootout, final, ended_by, voided)
  select x ->> 'id', p_night, p_run, (x ->> 'n')::integer,
         case when jsonb_typeof(x -> 'startedAt') = 'number' then to_timestamp((x ->> 'startedAt')::double precision / 1000) end,
         to_timestamp((x ->> 'endedAt')::double precision / 1000),
         x ->> 'winner', coalesce(x -> 'winners', '[]'), coalesce(x -> 'losers', '[]'),
         x -> 'shootout', x -> 'final', x ->> 'endedBy', false
    from jsonb_array_elements(coalesce(p_games, '[]'::jsonb)) as x
   where x ? 'id'
  on conflict (id) do update
     set n = excluded.n, started_at = excluded.started_at, ended_at = excluded.ended_at, winner = excluded.winner,
         winners = excluded.winners, losers = excluded.losers, shootout = excluded.shootout,
         final = excluded.final, ended_by = excluded.ended_by, voided = false
   where g.run_id = excluded.run_id;
  return 'ok';
end;
$$;
revoke execute on function public.push_games(uuid, text, text, bigint, jsonb) from public, anon;
grant execute on function public.push_games(uuid, text, text, bigint, jsonb) to authenticated;

-- The old unordered version is retired: nobody can call it
revoke execute on function public.push_games(uuid, text, text, jsonb) from public, anon, authenticated;
