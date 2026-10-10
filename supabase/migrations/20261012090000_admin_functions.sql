-- supabase/migrations/20261012090000_admin_functions.sql
-- Admin writes that span several tables (feature 6a, D8/D9). security invoker:
-- RLS applies; the explicit admin check gives a clear 42501 instead of a
-- silent no-op.

create function public.admin_save_article(payload jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
  v_product bigint := (payload ->> 'product_id')::bigint;
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if payload ->> 'id' is not null then
    -- The article number is never updated (numbering system, spec D8).
    update public.article set
      name = payload ->> 'name',
      description = payload ->> 'description',
      note = payload ->> 'note',
      material_id = (payload ->> 'material_id')::bigint,
      material_note = payload ->> 'material_note',
      sort_order = coalesce((payload ->> 'sort_order')::integer, 0)
    where id = (payload ->> 'id')::bigint and product_id = v_product
    returning id into v_id;
    if v_id is null then
      raise exception 'Artikel nicht gefunden.' using errcode = 'P0002';
    end if;
  else
    insert into public.article (product_id, article_number, name, description, note, material_id, material_note, sort_order)
    values (
      v_product,
      btrim(payload ->> 'article_number'),
      payload ->> 'name',
      payload ->> 'description',
      payload ->> 'note',
      (payload ->> 'material_id')::bigint,
      payload ->> 'material_note',
      coalesce((payload ->> 'sort_order')::integer, 0)
    )
    returning id into v_id;
  end if;

  delete from public.article_attribute where article_id = v_id;
  insert into public.article_attribute (article_id, attribute_id, value_decimal, value_text)
  select v_id, (a ->> 'attribute_id')::bigint, (a ->> 'value_decimal')::numeric, a ->> 'value_text'
  from jsonb_array_elements(coalesce(payload -> 'attributes', '[]'::jsonb)) as a;

  delete from public.article_packaging where article_id = v_id;
  insert into public.article_packaging (article_id, quantity, label, sort_order)
  select v_id, (p ->> 'quantity')::integer, nullif(btrim(p ->> 'label'), ''), (ord - 1)::integer
  from jsonb_array_elements(coalesce(payload -> 'packaging', '[]'::jsonb)) with ordinality as t(p, ord);

  -- "Last change" in the admin list reflects article edits.
  update public.product set updated_at = now() where id = v_product;
  return v_id;
end;
$$;

create function public.admin_set_product_colors(p_product_id bigint, payload jsonb)
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
  if not exists (select 1 from public.product where id = p_product_id) then
    raise exception 'Produkt nicht gefunden.' using errcode = 'P0002';
  end if;

  select count(*) into v_rows from jsonb_array_elements(payload);
  if (select count(distinct (e ->> 'color_id')) from jsonb_array_elements(payload) e) <> v_rows then
    raise exception 'Jede Farbe darf nur einmal zugeordnet sein.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(payload) e
    where nullif(btrim(e ->> 'suffix'), '') is not null
    group by btrim(e ->> 'suffix') having count(*) > 1
  ) then
    raise exception 'Jedes Suffix darf nur einmal vorkommen.' using errcode = '22023';
  end if;
  if v_rows > 0 and (select count(*) from jsonb_array_elements(payload) e where (e ->> 'is_default')::boolean) <> 1 then
    raise exception 'Genau eine Farbe muss Standard sein.' using errcode = '22023';
  end if;

  delete from public.product_color where product_id = p_product_id;
  insert into public.product_color (product_id, color_id, suffix, is_default, sort_order)
  select p_product_id, (e ->> 'color_id')::bigint, nullif(btrim(e ->> 'suffix'), ''),
         coalesce((e ->> 'is_default')::boolean, false), (ord - 1)::integer
  from jsonb_array_elements(payload) with ordinality as t(e, ord);

  update public.product set updated_at = now() where id = p_product_id;
end;
$$;

revoke all on function public.admin_save_article(jsonb) from public, anon;
grant execute on function public.admin_save_article(jsonb) to authenticated;
revoke all on function public.admin_set_product_colors(bigint, jsonb) from public, anon;
grant execute on function public.admin_set_product_colors(bigint, jsonb) to authenticated;

-- D10: published products are archived, never deleted (defence in depth;
-- the admin UI hides the button and the action refuses).
drop policy "admin delete" on public.product;
create policy "admin delete" on public.product for delete to authenticated
  using ((select private.is_admin()) and status <> 'published');
