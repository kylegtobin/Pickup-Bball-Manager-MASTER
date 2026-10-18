-- A game taken back with Undo is marked voided rather than removed, so nothing is ever lost
alter table public.games add column voided boolean not null default false;

-- Make tonight's game list match the courtside screen's
create or replace function public.push_games(p_run uuid, p_device text, p_night text, p_games jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_writer text;
begin
  select r.writer_device into v_writer from public.runs r where r.id = p_run;
  if not found then raise exception 'run not found'; end if;
  if v_writer is distinct from p_device then return 'taken'; end if;
  if not exists (select 1 from public.nights n where n.id = p_night and n.run_id = p_run) then
    raise exception 'night not found';
  end if;

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
grant execute on function public.push_games(uuid, text, text, jsonb) to authenticated;

-- Phones never see voided games
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
                         from (select * from public.games g where g.run_id = v_run.id and not g.voided order by g.ended_at desc limit 500) g), '[]'::jsonb),
    'serverTime', now());
end;
$$;
