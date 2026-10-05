begin;
select plan(12);

select throws_ok(
  $$insert into public.article (product_id, article_number) values (1, '99010')$$,
  '23505', null, 'duplicate article_number is rejected');
select throws_ok(
  $$insert into public.article (product_id, article_number) values (1, '  ')$$,
  '23514', null, 'blank article_number is rejected');
select throws_ok(
  $$insert into public.product (category_id, slug, name) values (1, 'testkeil-mit-daempfung', 'Dup')$$,
  '23505', null, 'duplicate product slug in the same category is rejected');
select lives_ok(
  $$insert into public.product (category_id, slug, name) values (2, 'testkeil-mit-daempfung', 'Same slug elsewhere')$$,
  'the same product slug is allowed in another category');
select throws_ok(
  $$insert into public.product_color (product_id, color_id, suffix, is_default) values (1, 2, '3', true)$$,
  '23505', null, 'a second default colour per product is rejected');
select throws_ok(
  $$insert into public.article_attribute (article_id, attribute_id, value_text) values (4, 1, 'acht')$$,
  '23514', null, 'a decimal attribute rejects a text value');
select throws_ok(
  $$insert into public.article_attribute (article_id, attribute_id, value_decimal) values (1, 3, 1.5)$$,
  '23514', null, 'a text attribute rejects a decimal value');
select throws_ok(
  $$insert into public.article_attribute (article_id, attribute_id) values (4, 1)$$,
  '23514', null, 'an attribute row needs a value');
select lives_ok(
  $$insert into public.article_attribute (article_id, attribute_id, value_decimal) values (4, 1, 8.5)$$,
  'a matching decimal value is accepted');
select throws_ok(
  $$insert into public.article_packaging (article_id, quantity) values (1, 0)$$,
  '23514', null, 'pack size must be positive');
select throws_ok(
  $$insert into public.color (name, hex_code, family) values ('lila', 'purple', 'lila')$$,
  '23514', null, 'hex_code must be #RRGGBB');

update public.product set name = 'Testkeil mit Dämpfung' where id = 1;
select is((select updated_at from public.product where id = 1), now(), 'updated_at is refreshed on update');

select * from finish();
rollback;
