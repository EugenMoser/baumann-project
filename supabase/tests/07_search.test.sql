begin;
select plan(13);

select ok(
  has_function_privilege('anon', 'public.search_catalog(text, integer)', 'execute'),
  'anon may execute search_catalog');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select results_eq(
  $$select product_slug, match_kind, matched_numbers from public.search_catalog('99010 - 1')$$,
  $$values ('testkeil-mit-daempfung'::text, 'exact_number'::text, array['99010 - 1']::text[])$$,
  'exact order number');
select results_eq(
  $$select product_slug, match_kind, matched_numbers from public.search_catalog(' 99010-1 ')$$,
  $$values ('testkeil-mit-daempfung'::text, 'exact_number'::text, array['99010 - 1']::text[])$$,
  'order number with different spacing is still exact');
select results_eq(
  $$select product_slug, match_kind, matched_numbers from public.search_catalog('99010')$$,
  $$values ('testkeil-mit-daempfung'::text, 'exact_number'::text, array['99010']::text[])$$,
  'exact article number reports the article number');
select results_eq(
  $$select product_slug, match_kind from public.search_catalog('99211/80 - 0')$$,
  $$values ('testrohrschelle'::text, 'exact_number'::text)$$,
  'order number with a slash');
select results_eq(
  $$select product_slug, match_kind from public.search_catalog('9901')$$,
  $$values ('testkeil-mit-daempfung'::text, 'number'::text)$$,
  'number prefix');
select results_eq(
  $$select product_slug, match_kind from public.search_catalog('Befestigung')$$,
  $$values ('testrohrschelle'::text, 'text'::text)$$,
  'German word from a description');
select results_eq(
  $$select product_slug from public.search_catalog('Testkeil 10')$$,
  $$values ('testkeil-mit-daempfung'::text)$$,
  'article name words find the product');
select is_empty(
  $$select 1 from public.search_catalog('99400')$$,
  'article of a draft product is not found');
select is_empty(
  $$select 1 from public.search_catalog('Entwurfsteil')$$,
  'draft product is not found by name');
select is_empty(
  $$select 1 from public.search_catalog('99%')$$,
  'LIKE wildcards in the query are literal');

select is(
  (select matched_numbers[1] from public.search_catalog('99010-1')),
  '99010 - 1',
  'the exact number comes first in matched_numbers');
select lives_ok(
  $$select * from public.search_catalog(repeat('a', 1000))$$,
  'a 1000-character query returns without error');

select * from finish();
rollback;
