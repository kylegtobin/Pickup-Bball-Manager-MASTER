-- Phones can follow a run by typing a short code (like BFH34R) instead of scanning the QR code,
-- and phones that open the site with no link go to the "home" run (set by hand, never through the API).

-- Six characters from 32 letters and digits that can't be mixed up (no I, O, 0 or 1).
-- Security definer so it can check every run for clashes, not just the caller's own.
create or replace function private.new_run_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.runs r where r.code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke all on function private.new_run_code() from public, anon;
grant execute on function private.new_run_code() to authenticated;

alter table public.runs add column code text;
update public.runs set code = private.new_run_code() where code is null;
alter table public.runs alter column code set default private.new_run_code();
alter table public.runs alter column code set not null;
alter table public.runs add constraint runs_code_key unique (code);
alter table public.runs add constraint runs_code_format check (code ~ '^[A-HJ-NP-Z2-9]{6}$');

-- At most one home run. Not in the update grant, so only an admin can set it.
alter table public.runs add column is_home boolean not null default false;
create unique index runs_one_home_idx on public.runs (is_home) where is_home;

-- Lookups that only ever hand back the read-only view token, never the row
create or replace function private.token_for_code(p_code text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.view_token from public.runs r
   where p_code ~ '^[A-HJ-NP-Z2-9]{6}$' and r.code = p_code
$$;
create or replace function private.home_run_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select r.view_token from public.runs r where r.is_home limit 1 $$;
revoke all on function private.token_for_code(text) from public;
revoke all on function private.home_run_token() from public;
grant execute on function private.token_for_code(text) to anon, authenticated;
grant execute on function private.home_run_token() to anon, authenticated;

-- What phones see now includes the run's code, so anyone following can share it
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
    'run', jsonb_build_object('name', v_run.name, 'gym', v_run.gym, 'courtSeenAt', v_run.writer_seen_at, 'code', v_run.code),
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

-- The same view, found by code or as the home run. Each also returns the token so the phone can keep
-- following that run by its link.
create or replace function public.get_run_view_by_code(p_code text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_token text := private.token_for_code(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')));
begin
  if v_token is null then return null; end if;
  return public.get_run_view(v_token) || jsonb_build_object('token', v_token);
end;
$$;
create or replace function public.get_home_run_view()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_token text := private.home_run_token();
begin
  if v_token is null then return null; end if;
  return public.get_run_view(v_token) || jsonb_build_object('token', v_token);
end;
$$;
revoke all on function public.get_run_view_by_code(text) from public;
revoke all on function public.get_home_run_view() from public;
grant execute on function public.get_run_view_by_code(text) to anon, authenticated;
grant execute on function public.get_home_run_view() to anon, authenticated;

-- A new link always comes with a new code, so old codes stop working too (covers Reset link and any
-- other way the token changes). Assigning NEW.code needs no column grant, so owners still can't pick codes.
create or replace function private.new_code_with_new_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.view_token is distinct from old.view_token then
    new.code := private.new_run_code();
  end if;
  return new;
end;
$$;
revoke all on function private.new_code_with_new_link() from public, anon;
create trigger runs_new_code_with_new_link
  before update of view_token on public.runs
  for each row execute function private.new_code_with_new_link();
