begin;
select plan(8);

select ok(has_function_privilege('anon', 'public.find_variant(text)', 'execute'), 'anon can look up order numbers');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select results_eq($$select order_number, product_name, category_slug, product_slug from public.find_variant('99010 - 1')$$,
  $$values ('99010 - 1', 'Testkeil mit Dämpfung', 'moebelteile', 'testkeil-mit-daempfung')$$,
  'exact order number is found');
select results_eq($$select order_number from public.find_variant('99010-1')$$, $$values ('99010 - 1')$$,
  'spacing differences are ignored and the canonical number is returned (Review Focus 3)');
select results_eq($$select order_number from public.find_variant('  99010 -  1 ')$$, $$values ('99010 - 1')$$,
  'surrounding and repeated spaces are ignored');
select results_eq($$select order_number from public.find_variant('99300')$$, $$values ('99300')$$,
  'product without colours: the article number is the order number');
select is((select count(*) from public.find_variant('99400')), 0::bigint, 'a draft product''s number is not found');
select is((select count(*) from public.find_variant('99500')), 0::bigint, 'an archived product''s number is not found');
select is((select count(*) from public.find_variant('99010')), 0::bigint, 'a bare article number of a coloured product is not an order number');

reset role;
select * from finish();
rollback;
