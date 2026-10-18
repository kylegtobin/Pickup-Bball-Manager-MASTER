-- Phones also learn when the courtside screen last checked in, so a quiet stretch still reads as live
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
    'run', jsonb_build_object('name', v_run.name, 'gym', v_run.gym, 'courtSeenAt', v_run.writer_seen_at),
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
