begin;
select plan(7);

insert into storage.objects (bucket_id, name) values ('catalog', 'products/seeded.webp');

select ok((select public from storage.buckets where id = 'catalog'), 'catalog bucket is public');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$insert into storage.objects (bucket_id, name) values ('catalog', 'anon.webp')$$,
  '42501', null, 'anon cannot upload');
select is((select count(*) from storage.objects where bucket_id = 'catalog'), 0::bigint,
  'anon cannot list objects (public URLs work without a select policy)');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$insert into storage.objects (bucket_id, name) values ('catalog', 'user.webp')$$,
  '42501', null, 'non-admin cannot upload');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","app_metadata":{"role":"admin"}}';
select lives_ok($$insert into storage.objects (bucket_id, name) values ('catalog', 'products/admin.webp')$$,
  'admin can upload');
select ok((select count(*) from storage.objects where bucket_id = 'catalog') >= 2, 'admin can list objects');
reset role;

-- Direct SQL deletes on storage.objects may be blocked by a storage trigger,
-- so the delete/update rules are checked structurally.
select is(
  (select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE')
     and qual like '%catalog%' and qual like '%is_admin%'),
  2::bigint, 'update and delete on catalog objects are admin-only');

select * from finish();
rollback;
