begin;
select plan(10);

select results_eq(
  $$select order_number from public.variant where product_id = 1 order by article_sort_order, color_sort_order$$,
  $$values ('99010 - 1'), ('99010 - 2'), ('99011 - 1'), ('99011 - 2')$$,
  'article × colour with suffix');
select results_eq(
  $$select order_number from public.variant where product_id = 2 order by color_sort_order$$,
  $$values ('99211/80 - 0'), ('99211/80 - 2')$$,
  'article numbers with a slash stay unchanged');
select results_eq(
  $$select order_number from public.variant where product_id = 2 and is_default$$,
  $$values ('99211/80 - 0')$$,
  'default colour is taken from is_default');
select results_eq(
  $$select order_number, color_id, is_default from public.variant where product_id = 3$$,
  $$values ('99300', null::bigint, true)$$,
  'a product without colours yields the bare article number');
select results_eq(
  $$select order_number from public.variant where product_id = 4$$,
  $$values ('99400')$$,
  'a null suffix yields the bare article number');

select ok(
  exists (select 1 from public.product where slug = 'testkeil-mit-daempfung' and search @@ websearch_to_tsquery('german', 'Dämpfungen')),
  'German stemming finds a product by an inflected name word');
select ok(
  exists (select 1 from public.product where slug = 'testrohrschelle' and search @@ websearch_to_tsquery('german', 'Befestigung Wand')),
  'full-text search covers the description');
select has_index('public', 'product', 'product_search_idx', 'GIN index on product.search');
select has_index('public', 'article', 'article_article_number_trgm_idx', 'trigram index on article_number');
select results_eq(
  $$select article_number from public.article where article_number ilike '%211/8%'$$,
  $$values ('99211/80')$$,
  'partial article number search works');

select * from finish();
rollback;
