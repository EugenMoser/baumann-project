-- Category texts (feature 4, D5): the importer fills intro and SEO texts only
-- where they are empty, so edits made later (admin, feature 6) are kept.
create function private.import_categories(categories jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.category as cat (slug, name, sort_order, intro_text, seo_title, seo_description)
  select c.slug, c.name, c.sort_order, coalesce(c.intro_text, ''), c.seo_title, c.seo_description
  from jsonb_to_recordset(coalesce(categories, '[]'))
    as c(slug text, name text, sort_order integer, intro_text text, seo_title text, seo_description text)
  on conflict (slug) do update set
    name = excluded.name,
    sort_order = excluded.sort_order,
    intro_text = case when cat.intro_text = '' then excluded.intro_text else cat.intro_text end,
    seo_title = coalesce(cat.seo_title, excluded.seo_title),
    seo_description = coalesce(cat.seo_description, excluded.seo_description);
$$;

revoke execute on function private.import_categories(jsonb) from public, anon, authenticated;
-- import_catalog runs as the caller (service role), which needs the schema.
grant usage on schema private to service_role;
grant execute on function private.import_categories(jsonb) to service_role;

create or replace function public.import_catalog(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_ids bigint[];
  article_ids bigint[];
  expected integer;
  affected integer;
  deleted_products integer;
  deleted_articles integer;
  deleted_media integer;
  bad text;
begin
  if jsonb_array_length(coalesce(payload -> 'products', '[]')) = 0 then
    raise exception 'import payload contains no products';
  end if;
  if jsonb_array_length(coalesce(payload -> 'articles', '[]')) = 0 then
    raise exception 'import payload contains no articles';
  end if;

  -- 1. Stale imported rows go first, so their slugs and numbers are free.
  delete from public.product p
  where p.legacy_product_id is not null
    and p.legacy_product_id not in (
      select (x ->> 'legacy_product_id')::integer from jsonb_array_elements(payload -> 'products') x);
  get diagnostics deleted_products = row_count;

  delete from public.article a
  using public.product p
  where a.product_id = p.id
    and p.legacy_product_id is not null
    and a.article_number not in (
      select x ->> 'article_number' from jsonb_array_elements(payload -> 'articles') x);
  get diagnostics deleted_articles = row_count;

  -- Article numbers are globally unique: a payload number that already belongs
  -- to a product the import does not manage (no legacy id) must not be taken over.
  select string_agg(a.article_number, ', ' order by a.article_number) into bad
  from public.article a
  join public.product p on p.id = a.product_id
  where p.legacy_product_id is null
    and a.article_number in (
      select x ->> 'article_number' from jsonb_array_elements(payload -> 'articles') x);
  if bad is not null then
    raise exception 'article numbers belong to products not managed by the import: %', bad;
  end if;

  -- 2. Reference data by natural key. Fields the importer does not own
  --    (intro texts, SEO, alt texts once set) are not overwritten.
  perform private.import_categories(payload -> 'categories');

  insert into public.material (code, name)
  select m.code, m.name
  from jsonb_to_recordset(coalesce(payload -> 'materials', '[]')) as m(code text, name text)
  on conflict (code) do update set name = excluded.name;

  insert into public.attribute (key, label, unit, data_type, sort_order)
  select a.key, a.label, a.unit, a.data_type, a.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'attributes', '[]'))
    as a(key text, label text, unit text, data_type public.attribute_data_type, sort_order integer)
  on conflict (key) do update
    set label = excluded.label, unit = excluded.unit, data_type = excluded.data_type, sort_order = excluded.sort_order;

  insert into public.color (name, ral_reference, hex_code, family)
  select c.name, c.ral_reference, c.hex_code, c.family
  from jsonb_to_recordset(coalesce(payload -> 'colors', '[]'))
    as c(name text, ral_reference text, hex_code text, family text)
  on conflict (name, hex_code) do update set ral_reference = excluded.ral_reference, family = excluded.family;

  insert into public.media (storage_path, width, height, alt_text)
  select m.storage_path, m.width, m.height, m.alt_text
  from jsonb_to_recordset(coalesce(payload -> 'media', '[]'))
    as m(storage_path text, width integer, height integer, alt_text text)
  on conflict (storage_path) do update set width = excluded.width, height = excluded.height;

  -- 3. Products and articles. New products are published; status, SEO and
  --    origin fields of existing products are kept.
  insert into public.product
    (category_id, slug, name, subtitle, description, material_id, material_note, status, sort_order, legacy_product_id)
  select cat.id, p.slug, p.name, p.subtitle, p.description, mat.id, p.material_note, 'published', p.sort_order, p.legacy_product_id
  from jsonb_to_recordset(payload -> 'products') as p(
    legacy_product_id integer, category_slug text, slug text, name text, subtitle text,
    description text, material_code text, material_note text, sort_order integer)
  join public.category cat on cat.slug = p.category_slug
  left join public.material mat on mat.code = p.material_code
  on conflict (legacy_product_id) do update set
    category_id = excluded.category_id, slug = excluded.slug, name = excluded.name,
    subtitle = excluded.subtitle, description = excluded.description, material_id = excluded.material_id,
    material_note = excluded.material_note, sort_order = excluded.sort_order;

  select coalesce(array_agg(p.id), '{}') into product_ids
  from public.product p
  where p.legacy_product_id in (
    select (x ->> 'legacy_product_id')::integer from jsonb_array_elements(payload -> 'products') x);

  insert into public.article (product_id, article_number, name, description, note, sort_order)
  select pr.id, a.article_number, a.name, a.description, a.note, a.sort_order
  from jsonb_to_recordset(payload -> 'articles') as a(
    article_number text, legacy_product_id integer, name text, description text, note text, sort_order integer)
  join public.product pr on pr.legacy_product_id = a.legacy_product_id
  on conflict (article_number) do update set
    product_id = excluded.product_id, name = excluded.name, description = excluded.description,
    note = excluded.note, sort_order = excluded.sort_order;

  select coalesce(array_agg(a.id), '{}') into article_ids
  from public.article a
  where a.article_number in (select x ->> 'article_number' from jsonb_array_elements(payload -> 'articles') x);

  -- 4. Children are rewritten; every insert must use all payload rows.
  delete from public.article_attribute where article_id = any (article_ids);
  insert into public.article_attribute (article_id, attribute_id, value_decimal, value_text)
  select ar.id, at.id, v.value_decimal, v.value_text
  from jsonb_to_recordset(coalesce(payload -> 'article_attributes', '[]'))
    as v(article_number text, key text, value_decimal numeric, value_text text)
  join public.article ar on ar.article_number = v.article_number
  join public.attribute at on at.key = v.key;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'article_attributes', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % article attributes could be linked', affected, expected;
  end if;

  delete from public.article_packaging where article_id = any (article_ids);
  insert into public.article_packaging (article_id, quantity, sort_order)
  select ar.id, v.quantity, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'article_packaging', '[]'))
    as v(article_number text, quantity integer, sort_order integer)
  join public.article ar on ar.article_number = v.article_number;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'article_packaging', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % packaging rows could be linked', affected, expected;
  end if;

  delete from public.product_color where product_id = any (product_ids);
  insert into public.product_color (product_id, color_id, suffix, is_default, sort_order)
  select pr.id, c.id, v.suffix, v.is_default, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'product_colors', '[]'))
    as v(legacy_product_id integer, color_name text, color_hex text, suffix text, is_default boolean, sort_order integer)
  join public.product pr on pr.legacy_product_id = v.legacy_product_id
  join public.color c on c.name = v.color_name and c.hex_code = v.color_hex;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'product_colors', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % product colours could be linked', affected, expected;
  end if;

  delete from public.product_media where product_id = any (product_ids);
  insert into public.product_media (product_id, media_id, role, sort_order)
  select pr.id, m.id, v.role, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'product_media', '[]'))
    as v(legacy_product_id integer, storage_path text, role public.media_role, sort_order integer)
  join public.product pr on pr.legacy_product_id = v.legacy_product_id
  join public.media m on m.storage_path = v.storage_path;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'product_media', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % product media could be linked', affected, expected;
  end if;

  delete from public.product_accessory where product_id = any (product_ids);
  insert into public.product_accessory (product_id, article_id, sort_order)
  select pr.id, ar.id, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'product_accessories', '[]'))
    as v(legacy_product_id integer, article_number text, sort_order integer)
  join public.product pr on pr.legacy_product_id = v.legacy_product_id
  join public.article ar on ar.article_number = v.article_number;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'product_accessories', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % accessories could be linked', affected, expected;
  end if;

  delete from public.category_attribute ca
  using public.category c
  where ca.category_id = c.id
    and c.slug in (select x ->> 'slug' from jsonb_array_elements(coalesce(payload -> 'categories', '[]')) x);
  insert into public.category_attribute (category_id, attribute_id, sort_order)
  select c.id, at.id, v.sort_order
  from jsonb_to_recordset(coalesce(payload -> 'category_attributes', '[]'))
    as v(category_slug text, attribute_key text, sort_order integer)
  join public.category c on c.slug = v.category_slug
  join public.attribute at on at.key = v.attribute_key;
  get diagnostics affected = row_count;
  expected := jsonb_array_length(coalesce(payload -> 'category_attributes', '[]'));
  if affected <> expected then
    raise exception 'cross-check failed: % of % category attributes could be linked', affected, expected;
  end if;

  -- Media of the import area that no product uses any more.
  delete from public.media m
  where m.storage_path like 'products/%'
    and not exists (select 1 from public.product_media pm where pm.media_id = m.id);
  get diagnostics deleted_media = row_count;

  -- 5. Cross-checks; any failure rolls back the whole import.
  if cardinality(product_ids) <> jsonb_array_length(payload -> 'products') then
    raise exception 'cross-check failed: % of % products imported',
      cardinality(product_ids), jsonb_array_length(payload -> 'products');
  end if;
  if cardinality(article_ids) <> jsonb_array_length(payload -> 'articles') then
    raise exception 'cross-check failed: % of % articles imported',
      cardinality(article_ids), jsonb_array_length(payload -> 'articles');
  end if;

  select string_agg(p.legacy_product_id::text, ', ' order by p.legacy_product_id) into bad
  from public.product p
  where p.id = any (product_ids)
    and not exists (select 1 from public.article a where a.product_id = p.id);
  if bad is not null then
    raise exception 'cross-check failed: products without articles: %', bad;
  end if;

  select string_agg(p.legacy_product_id::text, ', ' order by p.legacy_product_id) into bad
  from public.product p
  where p.id = any (product_ids)
    and exists (select 1 from public.product_color pc where pc.product_id = p.id)
    and (select count(*) from public.product_color pc where pc.product_id = p.id and pc.is_default) <> 1;
  if bad is not null then
    raise exception 'cross-check failed: products without exactly one default colour: %', bad;
  end if;

  return jsonb_build_object(
    'products', cardinality(product_ids),
    'articles', cardinality(article_ids),
    'accessories', jsonb_array_length(coalesce(payload -> 'product_accessories', '[]')),
    'colors', jsonb_array_length(coalesce(payload -> 'colors', '[]')),
    'materials', jsonb_array_length(coalesce(payload -> 'materials', '[]')),
    'attributes', jsonb_array_length(coalesce(payload -> 'attributes', '[]')),
    'media', jsonb_array_length(coalesce(payload -> 'media', '[]')),
    'deleted_products', deleted_products,
    'deleted_articles', deleted_articles,
    'deleted_media', deleted_media);
end;
$$;
