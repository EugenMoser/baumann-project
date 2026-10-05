begin;
select plan(30);

-- Structure
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint, 'RLS is enabled on every public table');
select ok(
  (select coalesce('security_invoker=true' = any (reloptions), false) from pg_class where oid = 'public.variant'::regclass),
  'variant view runs with the caller''s rights');
select is(
  (select count(*) from pg_tables t
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) v(cmd)
   where t.schemaname = 'public'
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.tablename and p.cmd = v.cmd
         and coalesce(p.qual, p.with_check) like '%is_admin%')),
  0::bigint, 'every table has admin-only insert, update and delete policies');

-- Grants (defence in depth, D4). has_table_privilege is independent of the
-- role running the test, unlike information_schema views.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and (has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE')
       or has_table_privilege('anon', c.oid, 'REFERENCES') or has_table_privilege('anon', c.oid, 'TRIGGER'))),
  0::bigint, 'anon holds no privilege except SELECT on public tables and views');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and not has_table_privilege('anon', c.oid, 'SELECT')),
  0::bigint, 'anon may select every public table and view');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
       or has_table_privilege('authenticated', c.oid, 'REFERENCES')
       or has_table_privilege('authenticated', c.oid, 'TRIGGER'))),
  0::bigint, 'no TRUNCATE (bypasses RLS), REFERENCES or TRIGGER for authenticated');

-- anon
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select results_eq($$select slug from public.product order by id$$,
  $$values ('testkeil-mit-daempfung'), ('testrohrschelle'), ('testabdeckung')$$,
  'anon sees published products only');
select is((select count(*) from public.article where product_id in (4, 5)), 0::bigint, 'anon sees no articles of unpublished products');
select is((select count(*) from public.variant where product_id in (4, 5)), 0::bigint, 'anon sees no variants of unpublished products');
select is((select count(*) from public.product_color where product_id = 4), 0::bigint, 'anon sees no colours of unpublished products');
select results_eq($$select storage_path from public.media order by id$$,
  $$values ('products/testkeil-1.webp')$$, 'anon sees media of published products only');
select is((select count(*) from public.product_media where product_id = 4), 0::bigint, 'anon sees no media links of unpublished products');
select is((select count(*) from public.article_attribute where article_id = 5), 0::bigint, 'anon sees no attributes of unpublished articles');
select is((select count(*) from public.article_packaging where article_id = 5), 0::bigint, 'anon sees no pack sizes of unpublished articles');
select results_eq($$select product_id, article_id from public.product_accessory order by product_id, article_id$$,
  $$values (3::bigint, 2::bigint)$$, 'anon sees accessories only when both products are published');
select is((select count(*) from public.ai_generation), 0::bigint, 'anon sees no AI audit log');
select ok(
  (select count(*) from public.category) = 2 and (select count(*) from public.color) = 3
  and (select count(*) from public.material) = 2 and (select count(*) from public.attribute) = 3
  and (select count(*) from public.category_attribute) = 3,
  'anon reads reference data');
select throws_ok($$insert into public.category (slug, name) values ('x', 'X')$$, '42501', null, 'anon cannot insert');
select throws_ok($$update public.product set name = 'x'$$, '42501', null, 'anon cannot update');
select throws_ok($$delete from public.article$$, '42501', null, 'anon cannot delete');

reset role;

-- authenticated, not admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is((select count(*) from public.product where status <> 'published'), 0::bigint, 'non-admin sees no unpublished products');
select is((select count(*) from public.ai_generation), 0::bigint, 'non-admin sees no AI audit log');
select throws_ok($$insert into public.category (slug, name) values ('x', 'X')$$, '42501', null, 'non-admin cannot insert');
select results_eq($$with u as (update public.product set name = 'hacked' returning 1) select count(*) from u$$,
  $$values (0::bigint)$$, 'non-admin update changes no rows');
select results_eq($$with d as (delete from public.article returning 1) select count(*) from d$$,
  $$values (0::bigint)$$, 'non-admin delete removes no rows');

reset role;

-- admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","app_metadata":{"role":"admin"}}';

select is((select count(*) from public.product), 5::bigint, 'admin sees all products');
select is((select count(*) from public.ai_generation), 1::bigint, 'admin reads the AI audit log');

select lives_ok($$
do $body$
declare
  v_category bigint; v_material bigint; v_attribute bigint; v_product bigint;
  v_article bigint; v_color bigint; v_media bigint;
begin
  insert into public.category (slug, name) values ('neu', 'Neu') returning id into v_category;
  insert into public.material (code, name) values ('ABS', 'ABS') returning id into v_material;
  insert into public.attribute (key, label, unit, data_type) values ('width', 'Breite', 'mm', 'decimal') returning id into v_attribute;
  insert into public.category_attribute (category_id, attribute_id) values (v_category, v_attribute);
  insert into public.product (category_id, slug, name, material_id) values (v_category, 'neues-teil', 'Neues Teil', v_material) returning id into v_product;
  insert into public.article (product_id, article_number) values (v_product, '99900') returning id into v_article;
  insert into public.article_attribute (article_id, attribute_id, value_decimal) values (v_article, v_attribute, 12.5);
  insert into public.article_packaging (article_id, quantity) values (v_article, 100);
  insert into public.color (name, hex_code, family) values ('schwarz', '#000000', 'schwarz') returning id into v_color;
  insert into public.product_color (product_id, color_id, suffix, is_default) values (v_product, v_color, '5', true);
  insert into public.media (storage_path, width, height, alt_text) values ('products/neu.webp', 800, 600, 'Neues Teil') returning id into v_media;
  insert into public.product_media (product_id, media_id, role) values (v_product, v_media, 'thumbnail');
  insert into public.product_accessory (product_id, article_id) values (v_product, 1);
  insert into public.ai_generation (entity, entity_id, field, model, prompt_version, output) values ('product', v_product, 'description', 'test-model', 'v1', 'Text');
end;
$body$
$$, 'admin can insert into every table');

select lives_ok($$
do $body$
declare
  n integer;
  stmt text;
begin
  foreach stmt in array array[
    $s$update public.category set name = 'Neu 2' where slug = 'neu'$s$,
    $s$update public.material set name = 'ABS 2' where code = 'ABS'$s$,
    $s$update public.attribute set label = 'Breite 2' where key = 'width'$s$,
    $s$update public.category_attribute set sort_order = 9 where attribute_id = (select id from public.attribute where key = 'width')$s$,
    $s$update public.product set name = 'Neues Teil 2' where slug = 'neues-teil'$s$,
    $s$update public.article set name = 'Neu' where article_number = '99900'$s$,
    $s$update public.article_attribute set value_decimal = 13 where article_id = (select id from public.article where article_number = '99900')$s$,
    $s$update public.article_packaging set label = 'Karton' where article_id = (select id from public.article where article_number = '99900')$s$,
    $s$update public.color set family = 'schwarz2' where name = 'schwarz'$s$,
    $s$update public.product_color set sort_order = 9 where suffix = '5'$s$,
    $s$update public.media set alt_text = 'Neu 2' where storage_path = 'products/neu.webp'$s$,
    $s$update public.product_media set sort_order = 9 where media_id = (select id from public.media where storage_path = 'products/neu.webp')$s$,
    $s$update public.product_accessory set sort_order = 9 where product_id = (select id from public.product where slug = 'neues-teil')$s$,
    $s$update public.ai_generation set accepted_at = now() where output = 'Text'$s$
  ] loop
    execute stmt;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'expected 1 row for: %', stmt; end if;
  end loop;
end;
$body$
$$, 'admin can update every table');

select lives_ok($$
do $body$
declare
  n integer;
  stmt text;
begin
  foreach stmt in array array[
    $s$delete from public.ai_generation where output = 'Text'$s$,
    $s$delete from public.product_accessory where product_id = (select id from public.product where slug = 'neues-teil')$s$,
    $s$delete from public.product_media where media_id = (select id from public.media where storage_path = 'products/neu.webp')$s$,
    $s$delete from public.media where storage_path = 'products/neu.webp'$s$,
    $s$delete from public.product_color where suffix = '5'$s$,
    $s$delete from public.color where name = 'schwarz'$s$,
    $s$delete from public.article_packaging where article_id = (select id from public.article where article_number = '99900')$s$,
    $s$delete from public.article_attribute where article_id = (select id from public.article where article_number = '99900')$s$,
    $s$delete from public.article where article_number = '99900'$s$,
    $s$delete from public.product where slug = 'neues-teil'$s$,
    $s$delete from public.category_attribute where attribute_id = (select id from public.attribute where key = 'width')$s$,
    $s$delete from public.attribute where key = 'width'$s$,
    $s$delete from public.category where slug = 'neu'$s$,
    $s$delete from public.material where code = 'ABS'$s$
  ] loop
    execute stmt;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'expected 1 row for: %', stmt; end if;
  end loop;
end;
$body$
$$, 'admin can delete from every table');

select * from finish();
rollback;
