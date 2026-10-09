-- Public catalog search (feature 4, D3). Runs with the caller's rights, so RLS
-- limits results to published products. The catalog is small (~300 articles,
-- ~600 variants): a scan of the variant view is fast enough.
create function public.search_catalog(q text, max_results integer default 50)
returns table (
  category_slug text,
  product_slug text,
  name text,
  subtitle text,
  matched_numbers text[],
  match_kind text,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      regexp_replace(lower(btrim(q)), '\s+', '', 'g') as compact,
      websearch_to_tsquery('german', q) as tsq
  ),
  pattern as (
    -- Escape LIKE wildcards so they match literally.
    select compact,
           replace(replace(replace(compact, '\', '\\'), '%', '\%'), '_', '\_') || '%' as prefix,
           tsq
    from input
  ),
  number_hits as (
    select
      v.product_id,
      case
        when regexp_replace(lower(v.article_number), '\s+', '', 'g') = p.compact then v.article_number
        else v.order_number
      end as number,
      case
        when regexp_replace(lower(v.order_number), '\s+', '', 'g') = p.compact
          or regexp_replace(lower(v.article_number), '\s+', '', 'g') = p.compact
          then 'exact_number'
        else 'number'
      end as kind
    from public.variant v
    cross join pattern p
    where p.compact <> ''
      and regexp_replace(lower(v.order_number), '\s+', '', 'g') like p.prefix
  ),
  text_hits as (
    select pr.id as product_id, ts_rank(pr.search, p.tsq, 32) as r
    from public.product pr
    cross join pattern p
    where pr.search @@ p.tsq
    union all
    select a.product_id, ts_rank(to_tsvector('german', a.name), p.tsq, 32) * 0.5
    from public.article a
    cross join pattern p
    where a.name is not null and to_tsvector('german', a.name) @@ p.tsq
  ),
  hits as (
    select product_id, kind, number,
           (case kind when 'exact_number' then 3 else 2 end)::real as r
    from number_hits
    union all
    select product_id, 'text', null, r::real from text_hits
  ),
  per_product as (
    select
      product_id,
      (array_agg(kind order by r desc))[1] as match_kind,
      max(r) as rank,
      coalesce(
        array_agg(distinct number order by number) filter (where number is not null),
        '{}'::text[]
      ) as matched_numbers
    from hits
    group by product_id
  )
  select c.slug, pr.slug, pr.name, pr.subtitle, pp.matched_numbers, pp.match_kind, pp.rank
  from per_product pp
  join public.product pr on pr.id = pp.product_id
  join public.category c on c.id = pr.category_id
  order by pp.rank desc, pr.name
  limit least(greatest(coalesce(max_results, 50), 1), 100);
$$;

revoke execute on function public.search_catalog(text, integer) from public, anon, authenticated;
grant execute on function public.search_catalog(text, integer) to anon, authenticated, service_role;
