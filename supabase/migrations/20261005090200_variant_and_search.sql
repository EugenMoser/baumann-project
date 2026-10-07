-- The single place where order numbers are built (docs/data-model.md).
-- security_invoker: the caller's RLS applies to article and product_color;
-- without it the view would run as its owner and leak unpublished variants.
create view public.variant
with (security_invoker = true)
as
select
  a.id as article_id,
  a.product_id,
  a.article_number,
  pc.color_id,
  pc.suffix,
  coalesce(pc.is_default, true) as is_default,
  a.article_number || coalesce(' - ' || pc.suffix, '') as order_number,
  a.sort_order as article_sort_order,
  pc.sort_order as color_sort_order
from public.article a
left join public.product_color pc on pc.product_id = a.product_id;

alter table public.product
  add column search tsvector generated always as (
    setweight(to_tsvector('german', coalesce(name, '')), 'A')
    || setweight(to_tsvector('german', coalesce(subtitle, '')), 'B')
    || setweight(to_tsvector('german', coalesce(description, '')), 'C')
  ) stored;

create index product_search_idx on public.product using gin (search);
create index article_article_number_trgm_idx
  on public.article using gin (article_number extensions.gin_trgm_ops);
