-- Damim Note: rollback-only RLS verification after schema.sql is applied.
-- Target selected by user: zskqtnweoiskgbdnraue (Nice).
-- Run the ENTIRE script in one SQL Editor execution as postgres.
-- Do not execute isolated INSERTs. Successful completion ends in ROLLBACK.
-- If a tool stops on an assertion error, run ROLLBACK on that same connection.
-- Synthetic auth rows have UUIDs only: no email, password, identity or session.
-- Refuse custom triggers/rules to avoid invoking arbitrary side effects.
-- No existing workspace/user is changed. This does not test Auth or REST.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $preflight$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  missing_user uuid := gen_random_uuid();
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.teacher_workspaces'::regclass
      and relrowsecurity
  ) then
    raise exception 'FAIL: teacher_workspaces RLS is disabled';
  end if;
  if exists (
    select 1 from pg_roles
    where rolname in ('authenticated', 'anon') and (rolsuper or rolbypassrls)
  ) then
    raise exception 'FAIL: test client roles bypass RLS';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgrelid in ('auth.users'::regclass, 'public.teacher_workspaces'::regclass)
      and not tgisinternal and tgenabled <> 'D'
  ) or exists (
    select 1 from pg_rewrite
    where ev_class in ('auth.users'::regclass, 'public.teacher_workspaces'::regclass)
      and rulename <> '_RETURN'
  ) then
    raise exception 'STOP: inspect custom auth/workspace triggers or rules before testing';
  end if;
  if a = b or a = missing_user or b = missing_user
     or exists (select 1 from auth.users where id in (a, b, missing_user)) then
    raise exception 'STOP: synthetic UUID collision; retry with fresh identifiers';
  end if;
  if has_table_privilege('anon', 'public.teacher_workspaces', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('authenticated', 'public.teacher_workspaces', 'TRUNCATE') then
    raise exception 'FAIL: excess table privilege';
  end if;
  perform set_config('test.rls_a', a::text, true);
  perform set_config('test.rls_b', b::text, true);
  perform set_config('test.rls_missing', missing_user::text, true);
  insert into auth.users (id) values (a), (b);
end
$preflight$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.rls_a'), true),
       set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls_a'), 'role', 'authenticated')::text, true);

do $owner_a$
declare
  a uuid := current_setting('test.rls_a')::uuid;
  b uuid := current_setting('test.rls_b')::uuid;
  affected integer;
begin
  if current_user <> 'authenticated' or auth.uid() is distinct from a then
    raise exception 'FAIL: owner A role/claims were not applied';
  end if;
  insert into public.teacher_workspaces (user_id, data) values (a, '{"test":"owner-a"}');
  if (select count(*) from public.teacher_workspaces where user_id = a and data->>'test' = 'owner-a' and updated_at is not null) <> 1 then
    raise exception 'FAIL: owner A create/read/default timestamp';
  end if;
  update public.teacher_workspaces set data = '{"test":"owner-a-updated"}' where user_id = a;
  get diagnostics affected = row_count;
  if affected <> 1 or not exists (select 1 from public.teacher_workspaces where user_id = a and data->>'test' = 'owner-a-updated') then
    raise exception 'FAIL: owner A update';
  end if;
  begin
    insert into public.teacher_workspaces (user_id, data) values (a, '{}');
    raise exception 'FAIL: duplicate owner was accepted';
  exception when unique_violation then null;
  end;
  begin
    update public.teacher_workspaces set user_id = b where user_id = a;
    raise exception 'FAIL: ownership reassignment was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.teacher_workspaces set data = '[]'::jsonb where user_id = a;
    raise exception 'FAIL: non-object workspace was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.teacher_workspaces set data = null where user_id = a;
    raise exception 'FAIL: SQL-null workspace was accepted';
  exception when not_null_violation then null;
  end;
  begin
    update public.teacher_workspaces set data = 'null'::jsonb where user_id = a;
    raise exception 'FAIL: JSON-null workspace was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.teacher_workspaces set data = jsonb_build_object('padding', repeat('x', 2097152)) where user_id = a;
    raise exception 'FAIL: oversized workspace was accepted';
  exception when check_violation then null;
  end;
end
$owner_a$;

select set_config('request.jwt.claim.sub', current_setting('test.rls_b'), true),
       set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls_b'), 'role', 'authenticated')::text, true);

do $user_b$
declare
  a uuid := current_setting('test.rls_a')::uuid;
  b uuid := current_setting('test.rls_b')::uuid;
  affected integer;
begin
  if auth.uid() is distinct from b then raise exception 'FAIL: user B claims'; end if;
  if exists (select 1 from public.teacher_workspaces where user_id = a) then
    raise exception 'FAIL: user B can read A';
  end if;
  update public.teacher_workspaces set data = '{"test":"intrusion"}' where user_id = a;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: user B can update A'; end if;
  delete from public.teacher_workspaces where user_id = a;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: user B can delete A'; end if;
  begin
    insert into public.teacher_workspaces (user_id, data) values (a, '{}');
    raise exception 'FAIL: user B can insert for A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.teacher_workspaces (user_id, data) values (a, '{}')
      on conflict (user_id) do update set data = excluded.data;
    raise exception 'FAIL: user B can upsert A';
  exception when insufficient_privilege then null;
  end;
  insert into public.teacher_workspaces (user_id, data) values (b, '{"test":"owner-b"}');
  if (select count(*) from public.teacher_workspaces where user_id in (a, b)) <> 1 then
    raise exception 'FAIL: user B sees incorrect number of test workspaces';
  end if;
  delete from public.teacher_workspaces where user_id = b;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: owner B delete'; end if;
end
$user_b$;

-- A valid database role with no subject also must not access another user.
select set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $missing_subject$
begin
  if auth.uid() is not null then raise exception 'FAIL: empty-subject setup'; end if;
  if exists (select 1 from public.teacher_workspaces where user_id = current_setting('test.rls_a')::uuid) then
    raise exception 'FAIL: missing subject can read A';
  end if;
  begin
    insert into public.teacher_workspaces (user_id, data) values (current_setting('test.rls_b')::uuid, '{}');
    raise exception 'FAIL: missing subject can write';
  exception when insufficient_privilege then null;
  end;
end
$missing_subject$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $anonymous_access$
begin
  if current_user <> 'anon' then raise exception 'FAIL: anonymous role setup'; end if;
  begin
    perform 1 from public.teacher_workspaces where user_id = current_setting('test.rls_a')::uuid;
    raise exception 'FAIL: anonymous SELECT was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.teacher_workspaces (user_id, data) values (current_setting('test.rls_b')::uuid, '{}');
    raise exception 'FAIL: anonymous INSERT was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.teacher_workspaces set data = '{}' where user_id = current_setting('test.rls_a')::uuid;
    raise exception 'FAIL: anonymous UPDATE was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.teacher_workspaces where user_id = current_setting('test.rls_a')::uuid;
    raise exception 'FAIL: anonymous DELETE was allowed';
  exception when insufficient_privilege then null;
  end;
end
$anonymous_access$;

reset role;
do $foreign_key$
begin
  begin
    insert into public.teacher_workspaces (user_id, data) values (current_setting('test.rls_missing')::uuid, '{}');
    raise exception 'FAIL: unknown Auth user was accepted';
  exception when foreign_key_violation then null;
  end;
  if not exists (select 1 from public.teacher_workspaces where user_id = current_setting('test.rls_a')::uuid and data->>'test' = 'owner-a-updated') then
    raise exception 'FAIL: denied operations changed A';
  end if;
end
$foreign_key$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.rls_a'), true),
       set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls_a'), 'role', 'authenticated')::text, true);
do $owner_a_delete$
declare affected integer;
begin
  delete from public.teacher_workspaces where user_id = current_setting('test.rls_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: owner A delete'; end if;
end
$owner_a_delete$;
reset role;

select 'PASS: owner CRUD, cross-user denial, missing-subject denial, anonymous denial, constraints; all synthetic rows rolled back by following ROLLBACK' as result;
rollback;
