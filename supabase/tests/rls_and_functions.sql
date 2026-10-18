-- Checks every access rule and function against the real database.
-- Runs in one block that always ends by raising, so nothing it creates is kept.
-- Paste into the SQL editor. The last line of the error says "ALL PASSED" or names the failed check.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  v_run uuid; v_run2 uuid; v_token text; v_new_token text; r record; v text; j jsonb; n int; ok text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.invalid', now(), now()),
         (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@example.invalid', now(), now());

  -- The stranger has a run of their own
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.runs (name) values ('Other Run') returning id into v_run2;

  -- As the owner
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  insert into public.runs (name, gym) values ('Test Run', 'Made-up Gym') returning id, view_token into v_run, v_token;
  if length(v_token) < 32 then raise exception 'FAIL token too short'; end if;
  select count(*) into n from public.runs; if n <> 1 then raise exception 'FAIL owner should see only own run, sees %', n; end if;
  begin
    update public.runs set owner_id = u2 where id = v_run;
    raise exception 'FAIL owner_id was editable';
  exception when insufficient_privilege then null;
  end;
  update public.runs set name = 'Test Run' where id = v_run;
  ok := ok || 'create ';

  select * into r from public.claim_run(v_run, 'deviceAAAA');
  if not r.claimed then raise exception 'FAIL claim A'; end if;
  v := public.push_night(v_run, 'deviceAAAA', 'night-1', 1, '{"playersTonight":["Arlo","Bryn"],"champions":[]}'::jsonb, now(), null);
  if v <> 'ok' then raise exception 'FAIL push v1 %', v; end if;
  v := public.push_night(v_run, 'deviceAAAA', 'night-1', 1, '{"playersTonight":["Arlo"]}'::jsonb);
  if v <> 'stale' then raise exception 'FAIL repeat v1 should be stale, got %', v; end if;
  v := public.push_night(v_run, 'deviceAAAA', 'night-1', 3, '{"playersTonight":["Arlo","Bryn","Cale"]}'::jsonb);
  if v <> 'ok' then raise exception 'FAIL push v3 %', v; end if;
  v := public.push_night(v_run, 'deviceAAAA', 'night-1', 2, '{"playersTonight":[]}'::jsonb);
  if v <> 'stale' then raise exception 'FAIL older v2 should be stale, got %', v; end if;
  select count(*) into n from public.attendance where night_id = 'night-1';
  if n <> 3 then raise exception 'FAIL attendance %', n; end if;
  ok := ok || 'ordered-pushes ';

  v := public.push_games(v_run, 'deviceAAAA', 'night-1', 1, '[{"id":"g1","n":1,"endedAt":1760000000000,"winner":"champions","winners":[{"id":"a","name":"Arlo"}],"losers":[]},{"id":"g2","n":2,"endedAt":1760000100000,"winner":"challengers","winners":[],"losers":[]}]'::jsonb);
  if v <> 'ok' then raise exception 'FAIL games %', v; end if;
  v := public.push_games(v_run, 'deviceAAAA', 'night-1', 2, '[{"id":"g1","n":1,"endedAt":1760000000000,"winner":"champions","winners":[{"id":"a","name":"Arlo"}],"losers":[]}]'::jsonb);
  select count(*) into n from public.games where night_id = 'night-1' and voided;
  if n <> 1 then raise exception 'FAIL undo should void g2, voided=%', n; end if;
  v := public.push_games(v_run, 'deviceAAAA', 'night-1', 3, '[{"id":"g1","n":1,"endedAt":1760000000000,"winner":"champions","winners":[],"losers":[]},{"id":"g2","n":2,"endedAt":1760000200000,"winner":"champions","winners":[],"losers":[]}]'::jsonb);
  select count(*) into n from public.games where night_id = 'night-1' and not voided;
  if n <> 2 then raise exception 'FAIL replayed g2 should come back, live=%', n; end if;
  v := public.push_games(v_run, 'deviceAAAA', 'night-1', 4, '[{"id":"g1","n":1,"endedAt":1760000000000,"winner":"champions","winners":[],"losers":[]}]'::jsonb);
  -- A late, older game list is refused and changes nothing
  v := public.push_games(v_run, 'deviceAAAA', 'night-1', 2, '[]'::jsonb);
  if v <> 'stale' then raise exception 'FAIL older games should be stale, got %', v; end if;
  select count(*) into n from public.games where night_id = 'night-1' and not voided;
  if n <> 1 then raise exception 'FAIL stale games push changed games'; end if;
  ok := ok || 'games+undo+order ';

  -- Writing into someone else's run is refused
  begin
    insert into public.nights (id, run_id) values ('night-x', v_run2);
    raise exception 'FAIL wrote a night into another run';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.claim_run(v_run2, 'deviceAAAA', true) c where c.claimed;
  if n <> 0 then raise exception 'FAIL claimed another run'; end if;
  ok := ok || 'other-run-blocked ';

  -- A second screen can't write until it takes over
  select * into r from public.claim_run(v_run, 'deviceBBBB');
  if r.claimed or r.writer_device <> 'deviceAAAA' then raise exception 'FAIL B claimed while A active'; end if;
  select * into r from public.claim_run(v_run, 'deviceBBBB', true);
  if not r.claimed then raise exception 'FAIL B take over'; end if;
  v := public.push_night(v_run, 'deviceAAAA', 'night-1', 9, '{}'::jsonb);
  if v <> 'taken' then raise exception 'FAIL A should be taken, got %', v; end if;
  v := public.push_games(v_run, 'deviceAAAA', 'night-1', 99, '[]'::jsonb);
  if v <> 'taken' then raise exception 'FAIL A games should be taken, got %', v; end if;
  select count(*) into n from public.games where night_id = 'night-1' and not voided;
  if n <> 1 then raise exception 'FAIL taken push changed games'; end if;
  -- A quiet screen loses its claim after two minutes
  update public.runs set writer_seen_at = now() - interval '3 minutes' where id = v_run;
  select * into r from public.claim_run(v_run, 'deviceAAAA');
  if not r.claimed then raise exception 'FAIL stale claim not released'; end if;
  ok := ok || 'one-writer ';

  -- A stranger sees nothing of this run and can't write
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  select count(*) into n from public.runs where id = v_run; if n <> 0 then raise exception 'FAIL stranger sees run'; end if;
  select count(*) into n from public.nights; if n <> 0 then raise exception 'FAIL stranger sees nights'; end if;
  select count(*) into n from public.games; if n <> 0 then raise exception 'FAIL stranger sees games'; end if;
  select count(*) into n from public.attendance; if n <> 0 then raise exception 'FAIL stranger sees attendance'; end if;
  select count(*) into n from public.claim_run(v_run, 'deviceCCCC', true) c where c.claimed; if n <> 0 then raise exception 'FAIL stranger claimed'; end if;
  begin
    v := public.push_night(v_run, 'deviceCCCC', 'night-1', 99, '{}'::jsonb);
    if v = 'ok' then raise exception 'FAIL stranger push returned ok'; end if;
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    v := public.push_games(v_run, 'deviceCCCC', 'night-1', 999, '[]'::jsonb);
    if v = 'ok' then raise exception 'FAIL stranger games push returned ok'; end if;
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.games set winner = 'challengers' where id = 'g1';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL stranger updated a game'; end if;
  begin
    perform public.reset_view_token(v_run);
    raise exception 'FAIL stranger reset the link';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  ok := ok || 'stranger-blocked ';

  -- Anyone with the link reads; without it, nothing
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
  select count(*) into n from public.runs; if n <> 0 then raise exception 'FAIL anon sees runs without link'; end if;
  select count(*) into n from public.nights; if n <> 0 then raise exception 'FAIL anon sees nights without link'; end if;
  j := public.get_run_view(v_token);
  if j is null or j #>> '{run,name}' <> 'Test Run' then raise exception 'FAIL view %', j; end if;
  if jsonb_array_length(j -> 'games') <> 1 then raise exception 'FAIL view games %', j -> 'games'; end if;
  if jsonb_array_length(j #> '{night,state,playersTonight}') <> 3 then raise exception 'FAIL view state'; end if;
  if j ? 'view_token' or j -> 'run' ? 'view_token' or j -> 'run' ? 'owner_id' then raise exception 'FAIL view leaks private fields'; end if;
  if public.get_run_view('nottherighttoken000000000000000000') is not null then raise exception 'FAIL wrong token sees run'; end if;
  if public.get_run_view('') is not null then raise exception 'FAIL empty token sees run'; end if;
  begin
    perform public.claim_run(v_run, 'deviceDDDD', true);
    raise exception 'FAIL anon could call claim_run';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.push_night(v_run, 'deviceDDDD', 'night-1', 100, '{}'::jsonb);
    raise exception 'FAIL anon could call push_night';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.push_games(v_run, 'deviceDDDD', 'night-1', 100, '[]'::jsonb);
    raise exception 'FAIL anon could call push_games';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.runs (name) values ('Anon run');
    raise exception 'FAIL anon created a run';
  exception when insufficient_privilege then null;
  end;
  ok := ok || 'link-view ';

  -- The owner resets the link; the old one stops working
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform set_config('role', 'authenticated', true);
  v_new_token := public.reset_view_token(v_run);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if public.get_run_view(v_token) is not null then raise exception 'FAIL old link still works'; end if;
  if public.get_run_view(v_new_token) is null then raise exception 'FAIL new link fails'; end if;
  ok := ok || 'reset-link ';

  -- Writes hold the run row while they check the writer (so a take-over can't land halfway)
  perform set_config('role', 'postgres', true);
  if position('for update' in pg_get_functiondef('public.push_night(uuid,text,text,bigint,jsonb,timestamptz,timestamptz)'::regprocedure)) = 0
     or position('for update' in pg_get_functiondef('public.push_games(uuid,text,text,bigint,jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL writes do not lock the run';
  end if;
  if has_function_privilege('authenticated', 'public.push_games(uuid,text,text,jsonb)', 'execute') then raise exception 'FAIL old push_games still callable'; end if;
  ok := ok || 'locks ';

  perform set_config('role', 'postgres', true);
  raise exception 'ALL PASSED (rolled back): %', ok;
end $$;
