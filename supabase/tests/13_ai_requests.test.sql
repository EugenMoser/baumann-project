-- supabase/tests/13_ai_requests.test.sql
begin;
select plan(32);

-- Structure
select has_table('public', 'ai_request', 'ai_request exists');
select columns_are('public', 'ai_request', array['id', 'product_id', 'requested_by', 'status', 'model', 'input_tokens', 'output_tokens', 'created_at'], 'ai_request columns');
select has_column('public', 'ai_generation', 'request_id', 'ai_generation links its request');
select fk_ok('public', 'ai_generation', 'request_id', 'public', 'ai_request', 'id', 'request_id references ai_request');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_request'::regclass), 'RLS is enabled on ai_request');

-- Privileges: the log is append-only for admins, so a reserved request
-- keeps counting (D7).
select ok(not has_function_privilege('anon', 'public.reserve_ai_request(bigint, integer, integer)', 'execute'), 'anon cannot call reserve_ai_request');
select ok(has_function_privilege('authenticated', 'public.reserve_ai_request(bigint, integer, integer)', 'execute'), 'authenticated can call reserve_ai_request');
select ok(not has_table_privilege('authenticated', 'public.ai_request', 'DELETE'), 'authenticated cannot delete requests');
select ok(
  not has_column_privilege('authenticated', 'public.ai_request', 'created_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.ai_request', 'requested_by', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.ai_request', 'created_at', 'INSERT'),
  'authenticated cannot set created_at or change requested_by');

-- anon
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*) from public.ai_request), 0::bigint, 'anon sees no requests');
select throws_ok($$insert into public.ai_request (requested_by) values ('00000000-0000-0000-0000-0000000000ad')$$, '42501', null, 'anon cannot insert requests');
select throws_ok($$select public.reserve_ai_request(1, 100, 100)$$, '42501', null, 'anon cannot reserve');
reset role;

-- authenticated, not admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.reserve_ai_request(1, 100, 100)$$, '42501', 'admin only', 'non-admin cannot reserve (admin check before the lock)');
select throws_ok($$insert into public.ai_request (requested_by) values ('00000000-0000-0000-0000-0000000000a1')$$, '42501', null, 'non-admin cannot insert requests');
reset role;
select is((select count(*) from public.ai_request where requested_by = '00000000-0000-0000-0000-0000000000a1'), 0::bigint, 'the non-admin path inserted nothing');

-- An older row of a fellow admin: outside the hour and the month.
insert into public.ai_request (requested_by, created_at) values (
  '00000000-0000-0000-0000-0000000000b0',
  date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin' - interval '1 second');

-- admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","app_metadata":{"role":"admin"}}';
select isnt(public.reserve_ai_request(1, 100, 100), null, 'admin reserves a request');
select results_eq(
  $$select product_id, requested_by, status, model, input_tokens, output_tokens from public.ai_request where requested_by = auth.uid()$$,
  $$values (1::bigint, '00000000-0000-0000-0000-0000000000ad'::uuid, 'started'::text, null::text, null::integer, null::integer)$$,
  'the reservation is a started row of the caller');
select throws_ok($$insert into public.ai_request (requested_by) values ('00000000-0000-0000-0000-0000000000ae')$$, '42501', null, 'admin cannot log a request for someone else');
select throws_ok($$select public.reserve_ai_request(1, null, 100)$$, '22023', null, 'a missing monthly cap fails closed');
select throws_ok($$select public.reserve_ai_request(1, 100, -1)$$, '22023', null, 'a negative hourly limit fails closed');

-- Monthly cap: the cap is relative to this month's rows, so leftovers of an
-- aborted integration run do not break the test. The row of last month
-- does not count.
select isnt(
  public.reserve_ai_request(2, (select count(*) from public.ai_request where created_at >= date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')::int + 1, 100),
  null, 'a reservation below the monthly cap passes (earlier months do not count)');
select throws_ok(
  $$select public.reserve_ai_request(2, (select count(*) from public.ai_request where created_at >= date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')::int, 100)$$,
  'AI001', null, 'a reservation at the monthly cap raises AI001');
select is((select count(*) from public.ai_request where requested_by = auth.uid()), 2::bigint, 'the refused reservation inserted nothing');
reset role;

-- Hourly limit per admin: a row older than one hour does not count.
insert into public.ai_request (requested_by, created_at) values ('00000000-0000-0000-0000-0000000000ae', now() - interval '61 minutes');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ae","role":"authenticated","app_metadata":{"role":"admin"}}';
select isnt(public.reserve_ai_request(1, 100000, 1), null, 'first request of the hour passes the hourly limit 1');
select throws_ok($$select public.reserve_ai_request(1, 100000, 1)$$, 'AI002', null, 'second request of the hour raises AI002');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000af","role":"authenticated","app_metadata":{"role":"admin"}}';
select isnt(public.reserve_ai_request(1, 100000, 1), null, 'another admin is not limited by the first admin''s hour');
select lives_ok(
  $$update public.ai_request set status = 'succeeded', model = 'test-model', input_tokens = 10, output_tokens = 20 where requested_by = auth.uid()$$,
  'admin finishes a request');
select is((select status from public.ai_request where requested_by = auth.uid()), 'succeeded', 'the status is stored');
reset role;

-- A deleted product keeps its requests counting.
delete from public.product where id = 2;
select is((select count(*) from public.ai_request where requested_by = '00000000-0000-0000-0000-0000000000ad' and product_id is null), 1::bigint, 'deleting a product keeps its requests');

-- remove_catalog() (D7)
insert into public.ai_generation (entity, entity_id, field, model, prompt_version, output, request_id)
  values ('product', 1, 'description', 'test-model', 'product-copy-v1', 'Text', (select max(id) from public.ai_request));
select lives_ok($$select public.remove_catalog()$$, 'remove_catalog runs');
select is((select count(*) from public.ai_request), 0::bigint, 'remove_catalog empties ai_request');
select is((select count(*) from public.ai_generation), 0::bigint, 'remove_catalog empties ai_generation');

select * from finish();
rollback;
