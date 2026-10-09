-- Order-number lookup for the inquiry form (feature 5, spec D5). Runs with
-- the caller's rights, so RLS hides unpublished products. Whitespace is
-- compared collapsed, like search_catalog.
create function public.find_variant(q text)
returns table (order_number text, product_name text, category_slug text, product_slug text)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.order_number, p.name, c.slug, p.slug
  from public.variant v
  join public.product p on p.id = v.product_id
  join public.category c on c.id = p.category_id
  where regexp_replace(lower(v.order_number), '\s+', '', 'g')
      = regexp_replace(lower(btrim(left(q, 40))), '\s+', '', 'g')
  order by v.article_sort_order, v.color_sort_order nulls first
  limit 1
$$;

revoke execute on function public.find_variant(text) from public, anon, authenticated;
grant execute on function public.find_variant(text) to anon, authenticated;
