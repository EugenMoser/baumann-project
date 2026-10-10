-- supabase/tests/11_admin.test.sql
begin;
select plan(34);

-- Privileges
select ok(not has_function_privilege('anon', 'public.admin_save_article(jsonb)', 'execute'), 'anon cannot call admin_save_article');
select ok(has_function_privilege('authenticated', 'public.admin_save_article(jsonb)', 'execute'), 'authenticated can call admin_save_article');
select ok(not has_function_privilege('anon', 'public.admin_set_product_colors(bigint, jsonb)', 'execute'), 'anon cannot call admin_set_product_colors');
select ok(has_function_privilege('authenticated', 'public.admin_set_product_colors(bigint, jsonb)', 'execute'), 'authenticated can call admin_set_product_colors');

-- Non-admin: functions refuse
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.admin_save_article('{"product_id":1,"article_number":"99401","sort_order":0}'::jsonb)$$, '42501', null, 'non-admin cannot save articles');
select throws_ok($$select public.admin_set_product_colors(1, '[]'::jsonb)$$, '42501', null, 'non-admin cannot set colours');
reset role;

-- Admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","app_metadata":{"role":"admin"}}';

select isnt(
  public.admin_save_article($j${"product_id":4,"article_number":"99401","name":"Neu","description":null,"note":null,"material_id":null,"material_note":null,"sort_order":1,
    "attributes":[{"attribute_id":1,"value_decimal":8.5,"value_text":null}],
    "packaging":[{"quantity":25,"label":"Beutel"}]}$j$::jsonb),
  null, 'admin inserts an article');
select is((select aa.value_decimal from public.article_attribute aa join public.article a on a.id = aa.article_id where a.article_number = '99401'), 8.5::numeric, 'attribute stored');
select is((select count(*) from public.article_packaging p join public.article a on a.id = p.article_id where a.article_number = '99401'), 1::bigint, 'pack size stored');

select lives_ok($$select public.admin_save_article(jsonb_build_object(
  'id', (select id from public.article where article_number = '99401'), 'product_id', 4,
  'article_number', 'IGNORED', 'name', 'Neu 2', 'sort_order', 1,
  'attributes', '[]'::jsonb,
  'packaging', '[{"quantity":50,"label":null},{"quantity":100,"label":null}]'::jsonb))$$, 'admin updates an article');
select is((select name from public.article where article_number = '99401'), 'Neu 2', 'update changes the name and keeps the number');
select is((select count(*) from public.article where article_number = 'IGNORED'), 0::bigint, 'article number is never updated');
select is((select count(*) from public.article_attribute aa join public.article a on a.id = aa.article_id where a.article_number = '99401'), 0::bigint, 'attributes replaced');
select is((select array_agg(p.quantity order by p.sort_order) from public.article_packaging p join public.article a on a.id = p.article_id where a.article_number = '99401'), array[50, 100], 'pack sizes replaced in order');

select throws_ok($$select public.admin_save_article(jsonb_build_object(
  'id', (select id from public.article where article_number = '99401'), 'product_id', 4,
  'name', 'Kaputt', 'sort_order', 1, 'attributes', '"x"'::jsonb, 'packaging', '[]'::jsonb))$$,
  '22023', 'Ungültige Artikeldaten.', 'non-array attributes raise');
select lives_ok($$select public.admin_save_article(jsonb_build_object(
  'id', (select id from public.article where article_number = '99401'), 'product_id', 4,
  'name', 'Neu 2', 'sort_order', 1, 'attributes', 'null'::jsonb, 'packaging', 'null'::jsonb))$$,
  'JSON null lists are treated as empty');
select is((select count(*) from public.article_packaging p join public.article a on a.id = p.article_id where a.article_number = '99401'), 0::bigint, 'JSON null packaging clears the pack sizes');

select throws_ok($$select public.admin_save_article(jsonb_build_object(
  'id', (select id from public.article where article_number = '99401'), 'product_id', 4,
  'name', 'Kaputt', 'sort_order', 1,
  'attributes', '[{"attribute_id":1,"value_decimal":null,"value_text":"x"}]'::jsonb,
  'packaging', '[]'::jsonb))$$, '23514', null, 'a wrong attribute type raises');
select is((select name from public.article where article_number = '99401'), 'Neu 2', 'the failed call changed nothing');
select throws_ok($$select public.admin_save_article('{"id":999999,"product_id":4,"name":"x","sort_order":0,"attributes":[],"packaging":[]}'::jsonb)$$, 'P0002', null, 'a missing article raises not found');
select throws_ok($$select public.admin_save_article('{"product_id":4,"article_number":"99010","sort_order":0,"attributes":[],"packaging":[]}'::jsonb)$$, '23505', null, 'a taken article number raises unique violation');
select throws_ok($$update public.article set article_number = 'X' where article_number = '99010'$$, '22023', 'Die Artikelnummer kann nicht geändert werden.', 'the article number cannot be changed directly (D8)');
select lives_ok($$update public.article set sort_order = sort_order where article_number = '99010'$$, 'other article columns stay writable');

-- Colours
select lives_ok($$select public.admin_set_product_colors(1, '[{"color_id":2,"suffix":"7","is_default":true},{"color_id":1,"suffix":null,"is_default":false}]'::jsonb)$$, 'admin replaces the colour set');
select is((select array_agg(color_id order by sort_order) from public.product_color where product_id = 1), array[2::bigint, 1::bigint], 'rows replaced in display order');
select throws_ok($$select public.admin_set_product_colors(1, '[{"color_id":2,"suffix":"1","is_default":true},{"color_id":2,"suffix":"2","is_default":false}]'::jsonb)$$, '22023', 'Jede Farbe darf nur einmal zugeordnet sein.', 'duplicate colour raises');
select throws_ok($$select public.admin_set_product_colors(1, '[{"color_id":2,"suffix":"1","is_default":true},{"color_id":1,"suffix":"1","is_default":false}]'::jsonb)$$, '22023', 'Jedes Suffix darf nur einmal vorkommen.', 'duplicate suffix raises');
select throws_ok($$select public.admin_set_product_colors(1, '[{"color_id":2,"suffix":"1","is_default":false}]'::jsonb)$$, '22023', 'Genau eine Farbe muss Standard sein.', 'no default raises');
select throws_ok($$select public.admin_set_product_colors(1, null)$$, '22023', 'Ungültige Farbliste.', 'a NULL colour list raises');
select throws_ok($$select public.admin_set_product_colors(1, '{"color_id":2}'::jsonb)$$, '22023', 'Ungültige Farbliste.', 'a non-array colour list raises');
select is((select count(*) from public.product_color where product_id = 1), 2::bigint, 'failed calls keep the previous set');

-- Delete rule (D10)
select results_eq($$with d as (delete from public.product where slug = 'testkeil-mit-daempfung' returning 1) select count(*) from d$$, $$values (0::bigint)$$, 'admin cannot delete a published product');
select results_eq($$with d as (delete from public.product where slug = 'entwurfsteil' returning 1) select count(*) from d$$, $$values (1::bigint)$$, 'admin can delete a draft');
select is((select count(*) from public.article where product_id = 4) + (select count(*) from public.product_color where product_id = 4), 0::bigint, 'the cascade removed articles and colour rows');
reset role;

select * from finish();
rollback;
