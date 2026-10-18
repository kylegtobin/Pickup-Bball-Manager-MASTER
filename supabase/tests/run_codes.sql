-- Checks for 20261018224155_run_codes_and_home_run. Send the migration and this file as one batch:
-- the block always ends by raising, so the whole batch rolls back and nothing is kept.
-- The error says "ALL PASSED" or names the failed check.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  v_run uuid; v_run2 uuid; v_token text; v_code text; v_code2 text; v_new_token text; j jsonb; n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.invalid', now(), now()),
         (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@example.invalid', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.runs (name) values ('Other Run') returning id, code into v_run2, v_code2;

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  insert into public.runs (name, gym) values ('Test Run', 'Made-up Gym') returning id, view_token, code into v_run, v_token, v_code;
  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'FAIL code format %', v_code; end if;
  if v_code = v_code2 then raise exception 'FAIL codes clash'; end if;
  begin
    update public.runs set is_home = true where id = v_run;
    raise exception 'FAIL owner could set home run';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.runs set code = 'AAAAAA' where id = v_run;
    raise exception 'FAIL owner could set code';
  exception when insufficient_privilege then null;
  end;

  -- Signed out
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
  perform set_config('pbm.run_token', '', true);
  select count(*) into n from public.runs; if n <> 0 then raise exception 'FAIL anon sees % runs', n; end if;
  j := public.get_run_view_by_code(lower(v_code));
  if j is null or j->>'token' <> v_token or j->'run'->>'name' <> 'Test Run' or j->'run'->>'code' <> v_code then raise exception 'FAIL code lookup %', j; end if;
  j := public.get_run_view_by_code(substr(v_code,1,3) || '-' || substr(v_code,4,3));
  if j is null then raise exception 'FAIL code with a dash'; end if;
  if public.get_run_view_by_code('ZZZZZZ') is not null and v_code <> 'ZZZZZZ' and v_code2 <> 'ZZZZZZ' then raise exception 'FAIL unknown code found a run'; end if;
  if public.get_run_view_by_code('I0O1AB') is not null then raise exception 'FAIL bad alphabet accepted'; end if;
  if public.get_run_view_by_code(null) is not null then raise exception 'FAIL null code'; end if;
  perform set_config('pbm.run_token', '', true);
  select count(*) into n from public.runs; if n <> 0 then raise exception 'FAIL lookup left runs visible (%)', n; end if;
  begin
    perform private.new_run_code();
    raise exception 'FAIL anon can make codes';
  exception when insufficient_privilege then null;
  end;

  -- Home run: none yet, then one set by an admin
  if public.get_home_run_view() is not null then raise exception 'FAIL home run before one is set'; end if;
  perform set_config('role', 'postgres', true);
  update public.runs set is_home = true where id = v_run;
  begin
    update public.runs set is_home = true where id = v_run2;
    raise exception 'FAIL two home runs';
  exception when unique_violation then null;
  end;
  perform set_config('role', 'anon', true);
  perform set_config('pbm.run_token', '', true);
  j := public.get_home_run_view();
  if j is null or j->>'token' <> v_token then raise exception 'FAIL home run view %', j; end if;

  -- Reset gives a new code and the old one stops working
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  v_new_token := public.reset_view_token(v_run);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if public.get_run_view_by_code(v_code) is not null then raise exception 'FAIL old code still works'; end if;
  j := public.get_home_run_view();
  if j->>'token' <> v_new_token or j->'run'->>'code' = v_code then raise exception 'FAIL reset did not change token and code'; end if;

  raise exception 'ALL PASSED (rolled back)';
end;
$$;
