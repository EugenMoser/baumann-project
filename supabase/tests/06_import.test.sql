begin;
select plan(28);

create function pg_temp.payload() returns jsonb language sql as $$
select $j${
  "categories": [{"slug": "moebel", "name": "Möbel", "sort_order": 0}],
  "materials": [{"code": "PA-6", "name": "Polyamid 6"}],
  "attributes": [{"key": "height", "label": "Höhe", "unit": "mm", "data_type": "decimal", "sort_order": 10}],
  "category_attributes": [{"category_slug": "moebel", "attribute_key": "height", "sort_order": 10}],
  "colors": [
    {"name": "testweiß", "ral_reference": "ähnlich RAL 9016", "hex_code": "#F2F5F3", "family": "weiß"},
    {"name": "testbraun", "ral_reference": null, "hex_code": "#5B3A29", "family": "braun"}],
  "media": [{"storage_path": "products/moebel/importkeil/a-98010.webp", "width": 400, "height": 300, "alt_text": "Importkeil"}],
  "products": [
    {"legacy_product_id": 9001, "category_slug": "moebel", "slug": "importkeil", "name": "Importkeil", "subtitle": "für Testschlösser", "description": "Beschreibung.", "material_code": "PA-6", "material_note": null, "sort_order": 10},
    {"legacy_product_id": 9002, "category_slug": "moebel", "slug": "importhalter", "name": "Importhalter", "subtitle": null, "description": null, "material_code": null, "material_note": "A: PA-6 / B: ABS", "sort_order": 20}],
  "articles": [
    {"article_number": "98010", "legacy_product_id": 9001, "name": null, "description": null, "note": null, "sort_order": 1},
    {"article_number": "98011/80", "legacy_product_id": 9001, "name": "Importkeil hoch", "description": null, "note": "abgesetzt", "sort_order": 2},
    {"article_number": "98020", "legacy_product_id": 9002, "name": null, "description": null, "note": null, "sort_order": 1}],
  "article_attributes": [
    {"article_number": "98010", "key": "height", "value_decimal": 8, "value_text": null},
    {"article_number": "98011/80", "key": "height", "value_decimal": 9.5, "value_text": null}],
  "article_packaging": [{"article_number": "98010", "quantity": 500, "sort_order": 0}],
  "product_colors": [
    {"legacy_product_id": 9001, "color_name": "testweiß", "color_hex": "#F2F5F3", "suffix": "0", "is_default": true, "sort_order": 0},
    {"legacy_product_id": 9001, "color_name": "testbraun", "color_hex": "#5B3A29", "suffix": "1", "is_default": false, "sort_order": 1}],
  "product_media": [{"legacy_product_id": 9001, "storage_path": "products/moebel/importkeil/a-98010.webp", "role": "thumbnail", "sort_order": 0}],
  "product_accessories": [{"legacy_product_id": 9002, "article_number": "98010", "sort_order": 0}]
}$j$::jsonb
$$;

-- Privileges (service role only)
select ok(not has_function_privilege('anon', 'public.import_catalog(jsonb)', 'execute'), 'anon cannot execute import_catalog');
select ok(not has_function_privilege('authenticated', 'public.import_catalog(jsonb)', 'execute'), 'authenticated cannot execute import_catalog');
select ok(has_function_privilege('service_role', 'public.import_catalog(jsonb)', 'execute'), 'service_role can execute import_catalog');
select ok(not has_function_privilege('anon', 'public.remove_catalog()', 'execute'), 'anon cannot execute remove_catalog');
select ok(not has_function_privilege('authenticated', 'public.remove_catalog()', 'execute'), 'authenticated cannot execute remove_catalog');
select ok(has_function_privilege('service_role', 'public.remove_catalog()', 'execute'), 'service_role can execute remove_catalog');

-- First import
set local role service_role;
select lives_ok($$select public.import_catalog(pg_temp.payload())$$, 'a valid payload imports');
reset role;

select is((select count(*) from public.product where legacy_product_id in (9001, 9002)), 2::bigint, 'two products imported');
select is((select status::text from public.product where legacy_product_id = 9001), 'published', 'new products are published');
select results_eq(
  $$select a.article_number from public.article a join public.product p on p.id = a.product_id
    where p.legacy_product_id is not null order by a.article_number$$,
  $$values ('98010'), ('98011/80'), ('98020')$$,
  'article numbers imported unchanged');
select is((select count(*) from public.product_accessory pa join public.product p on p.id = pa.product_id where p.legacy_product_id = 9002),
  1::bigint, 'shared article becomes an accessory');
select is((select aa.value_decimal from public.article_attribute aa join public.article a on a.id = aa.article_id where a.article_number = '98011/80'),
  9.5::numeric, 'attribute value imported');
select is((select count(*) from public.product_color pc join public.product p on p.id = pc.product_id where p.legacy_product_id = 9001 and pc.is_default),
  1::bigint, 'exactly one default colour');

-- Idempotent: same payload, same ids, no new rows
create temp table first_ids as
  select 'product'::text as t, id from public.product
  union all select 'article', id from public.article
  union all select 'media', id from public.media
  union all select 'color', id from public.color;
set local role service_role;
select lives_ok($$select public.import_catalog(pg_temp.payload())$$, 'the same payload imports again');
reset role;
select set_eq(
  $$select 'product'::text, id from public.product
    union all select 'article', id from public.article
    union all select 'media', id from public.media
    union all select 'color', id from public.color$$,
  $$select t, id from first_ids$$,
  'second run keeps all ids and adds no rows');

-- Rows without legacy_product_id (seed) are untouched
select is((select count(*) from public.product where legacy_product_id is null), 5::bigint, 'seed products survive');

-- Invalid payloads roll back
set local role service_role;
select throws_ok(
  $$select public.import_catalog(jsonb_set(jsonb_set(pg_temp.payload(),
      '{articles}', (pg_temp.payload() -> 'articles') - 2),
      '{product_accessories}', '[]'))$$,
  'P0001', 'cross-check failed: products without articles: 9002',
  'a product without articles fails the cross-check');
reset role;
select is((select count(*) from public.article where article_number in ('98010', '98011/80', '98020')), 3::bigint,
  'the failed import left the articles unchanged');

set local role service_role;
select throws_ok(
  $$select public.import_catalog(jsonb_set(pg_temp.payload(), '{product_colors,1,is_default}', 'true'))$$,
  '23505', 'duplicate key value violates unique constraint "product_color_one_default_idx"',
  'two default colours are rejected');
select throws_ok(
  $$select public.import_catalog(jsonb_set(jsonb_set(pg_temp.payload(), '{product_colors,0,is_default}', 'false'),
      '{product_colors,1,is_default}', 'false'))$$,
  'P0001', 'cross-check failed: products without exactly one default colour: 9001',
  'zero default colours fail the cross-check');
select throws_ok(
  $$select public.import_catalog(jsonb_set(pg_temp.payload(), '{articles}', '[]'))$$,
  'P0001', 'import payload contains no articles', 'a payload without articles is rejected');

-- An article number owned by a seed product (no legacy id) is not taken over
select throws_ok(
  $$select public.import_catalog(jsonb_set(pg_temp.payload(), '{articles,0,article_number}', '"99010"'))$$,
  'P0001', 'article numbers belong to products not managed by the import: 99010',
  'a seed article number in the payload is rejected');
reset role;
select is((select p.legacy_product_id is null from public.article a join public.product p on p.id = a.product_id where a.article_number = '99010'),
  true, 'the seed article keeps its product');

-- A product missing from the next payload is deleted with its children
set local role service_role;
select lives_ok(
  $$select public.import_catalog(jsonb_set(jsonb_set(jsonb_set(pg_temp.payload(),
      '{products}', (pg_temp.payload() -> 'products') - 1),
      '{articles}', (pg_temp.payload() -> 'articles') - 2),
      '{product_accessories}', '[]'))$$,
  'a smaller payload imports');
reset role;
select is((select count(*) from public.product where legacy_product_id = 9002), 0::bigint, 'the missing product is deleted');
select is((select count(*) from public.article where article_number = '98020'), 0::bigint, 'its articles are deleted too');

-- Removal
set local role service_role;
select lives_ok($$select public.remove_catalog()$$, 'remove_catalog runs');
reset role;
select is(
  (select (select count(*) from public.category) + (select count(*) from public.attribute)
        + (select count(*) from public.category_attribute) + (select count(*) from public.material)
        + (select count(*) from public.product) + (select count(*) from public.article)
        + (select count(*) from public.article_attribute) + (select count(*) from public.article_packaging)
        + (select count(*) from public.product_accessory) + (select count(*) from public.color)
        + (select count(*) from public.product_color) + (select count(*) from public.media)
        + (select count(*) from public.product_media) + (select count(*) from public.ai_generation)),
  0::bigint, 'every catalog table is empty after removal');

select * from finish();
rollback;
