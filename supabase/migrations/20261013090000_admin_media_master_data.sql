-- supabase/migrations/20261013090000_admin_media_master_data.sql
-- Admin writes of feature 6b (images, accessories, categories). security
-- invoker: RLS applies; the explicit admin check gives a clear 42501.

create function public.admin_attach_media(
  p_product_id bigint, p_storage_path text, p_width integer, p_height integer, p_alt_text text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.product where id = p_product_id) then
    raise exception 'Produkt nicht gefunden.' using errcode = 'P0002';
  end if;
  if nullif(btrim(p_alt_text), '') is null then
    raise exception 'Jedes Bild braucht einen Alt-Text.' using errcode = '22023';
  end if;

  insert into public.media (storage_path, width, height, alt_text, alt_origin)
  values (p_storage_path, p_width, p_height, btrim(p_alt_text), 'human')
  returning id into v_id;

  insert into public.product_media (product_id, media_id, role, sort_order)
  values (
    p_product_id,
    v_id,
    case when exists (
      select 1 from public.product_media where product_id = p_product_id and role = 'thumbnail'
    ) then 'gallery'::public.media_role else 'thumbnail'::public.media_role end,
    coalesce((select max(sort_order) + 1 from public.product_media where product_id = p_product_id), 0)
  );

  update public.product set updated_at = now() where id = p_product_id;
  return v_id;
end;
$$;

create function public.admin_set_product_media(p_product_id bigint, payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Ungültige Bildliste.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product where id = p_product_id) then
    raise exception 'Produkt nicht gefunden.' using errcode = 'P0002';
  end if;

  -- The payload must name exactly the product's current images (D4).
  if (select array_agg(media_id order by media_id) from public.product_media where product_id = p_product_id)
     is distinct from
     (select array_agg((e ->> 'media_id')::bigint order by (e ->> 'media_id')::bigint) from jsonb_array_elements(payload) e)
  then
    raise exception 'Die Bildliste ist veraltet. Bitte die Seite neu laden.' using errcode = '22023';
  end if;

  select count(*) into v_rows from jsonb_array_elements(payload);
  if v_rows > 0 and (select count(*) from jsonb_array_elements(payload) e where (e ->> 'is_thumbnail')::boolean) <> 1 then
    raise exception 'Genau ein Bild muss Vorschaubild sein.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(payload) e where nullif(btrim(e ->> 'alt_text'), '') is null) then
    raise exception 'Jedes Bild braucht einen Alt-Text.' using errcode = '22023';
  end if;

  -- All rows to gallery first: avoids a transient second thumbnail.
  update public.product_media set role = 'gallery' where product_id = p_product_id;
  update public.product_media pm set
    role = case when (t.e ->> 'is_thumbnail')::boolean then 'thumbnail'::public.media_role else 'gallery'::public.media_role end,
    sort_order = (t.ord - 1)::integer
  from jsonb_array_elements(payload) with ordinality as t(e, ord)
  where pm.product_id = p_product_id and pm.media_id = (t.e ->> 'media_id')::bigint;

  update public.media m set
    alt_text = btrim(e ->> 'alt_text'),
    alt_origin = (e ->> 'alt_origin')::public.content_origin
  from jsonb_array_elements(payload) e
  where m.id = (e ->> 'media_id')::bigint;

  update public.product set updated_at = now() where id = p_product_id;
end;
$$;

create function public.admin_remove_media(p_product_id bigint, p_media_id bigint)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_path text;
  v_role public.media_role;
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select m.storage_path, pm.role into v_path, v_role
  from public.product_media pm join public.media m on m.id = pm.media_id
  where pm.product_id = p_product_id and pm.media_id = p_media_id;
  if v_path is null then
    raise exception 'Bild nicht gefunden.' using errcode = 'P0002';
  end if;

  delete from public.media where id = p_media_id; -- product_media cascades

  if v_role = 'thumbnail' then
    update public.product_media set role = 'thumbnail'
    where product_id = p_product_id and media_id = (
      select media_id from public.product_media
      where product_id = p_product_id
      order by sort_order, media_id
      limit 1
    );
  end if;

  update public.product set updated_at = now() where id = p_product_id;
  return v_path;
end;
$$;

create function public.admin_delete_product(p_product_id bigint)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.product_status;
  v_paths text[];
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select status into v_status from public.product where id = p_product_id;
  if v_status is null then
    raise exception 'Produkt nicht gefunden.' using errcode = 'P0002';
  end if;
  if v_status = 'published' then
    raise exception 'Veröffentlichte Produkte können nicht gelöscht werden. Bitte zuerst archivieren.' using errcode = '22023';
  end if;

  -- Images of this product only (D1); shared rows would stay.
  with own as (
    select pm.media_id from public.product_media pm
    where pm.product_id = p_product_id
      and not exists (
        select 1 from public.product_media o
        where o.media_id = pm.media_id and o.product_id <> p_product_id
      )
  ), gone as (
    delete from public.media m using own where m.id = own.media_id
    returning m.storage_path
  )
  select coalesce(array_agg(storage_path order by storage_path), '{}') into v_paths from gone;

  delete from public.product where id = p_product_id;
  if not found then
    raise exception 'Produkt nicht gefunden.' using errcode = 'P0002';
  end if;
  return v_paths;
end;
$$;

create function public.admin_set_product_accessories(p_product_id bigint, payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Ungültige Zubehörliste.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product where id = p_product_id) then
    raise exception 'Produkt nicht gefunden.' using errcode = 'P0002';
  end if;
  if (select count(distinct e ->> 'article_id') from jsonb_array_elements(payload) e)
     <> (select count(*) from jsonb_array_elements(payload)) then
    raise exception 'Jeder Artikel darf nur einmal Zubehör sein.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload) e
    join public.article a on a.id = (e ->> 'article_id')::bigint
    where a.product_id = p_product_id
  ) then
    raise exception 'Artikel des eigenen Produkts sind kein Zubehör.' using errcode = '22023';
  end if;

  delete from public.product_accessory where product_id = p_product_id;
  insert into public.product_accessory (product_id, article_id, sort_order)
  select p_product_id, (e ->> 'article_id')::bigint, (ord - 1)::integer
  from jsonb_array_elements(payload) with ordinality as t(e, ord);

  update public.product set updated_at = now() where id = p_product_id;
end;
$$;

create function public.admin_save_category(payload jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
  v_attributes jsonb := coalesce(nullif(payload -> 'attributes', 'null'::jsonb), '[]'::jsonb);
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if jsonb_typeof(v_attributes) <> 'array' then
    raise exception 'Ungültige Kategoriedaten.' using errcode = '22023';
  end if;

  if payload ->> 'id' is not null then
    update public.category set
      name = payload ->> 'name',
      slug = payload ->> 'slug',
      intro_text = coalesce(payload ->> 'intro_text', ''),
      seo_title = payload ->> 'seo_title',
      seo_description = payload ->> 'seo_description',
      sort_order = coalesce((payload ->> 'sort_order')::integer, 0)
    where id = (payload ->> 'id')::bigint
    returning id into v_id;
    if v_id is null then
      raise exception 'Kategorie nicht gefunden.' using errcode = 'P0002';
    end if;
  else
    insert into public.category (name, slug, intro_text, seo_title, seo_description, sort_order)
    values (
      payload ->> 'name',
      payload ->> 'slug',
      coalesce(payload ->> 'intro_text', ''),
      payload ->> 'seo_title',
      payload ->> 'seo_description',
      coalesce((payload ->> 'sort_order')::integer, 0)
    )
    returning id into v_id;
  end if;

  delete from public.category_attribute where category_id = v_id;
  insert into public.category_attribute (category_id, attribute_id, sort_order)
  select v_id, (a ->> 'attribute_id')::bigint, coalesce((a ->> 'sort_order')::integer, 0)
  from jsonb_array_elements(v_attributes) as a;

  return v_id;
end;
$$;

revoke all on function public.admin_attach_media(bigint, text, integer, integer, text) from public, anon;
grant execute on function public.admin_attach_media(bigint, text, integer, integer, text) to authenticated;
revoke all on function public.admin_set_product_media(bigint, jsonb) from public, anon;
grant execute on function public.admin_set_product_media(bigint, jsonb) to authenticated;
revoke all on function public.admin_remove_media(bigint, bigint) from public, anon;
grant execute on function public.admin_remove_media(bigint, bigint) to authenticated;
revoke all on function public.admin_delete_product(bigint) from public, anon;
grant execute on function public.admin_delete_product(bigint) to authenticated;
revoke all on function public.admin_set_product_accessories(bigint, jsonb) from public, anon;
grant execute on function public.admin_set_product_accessories(bigint, jsonb) to authenticated;
revoke all on function public.admin_save_category(jsonb) from public, anon;
grant execute on function public.admin_save_category(jsonb) to authenticated;
