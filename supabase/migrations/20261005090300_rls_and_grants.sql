-- RLS is the security boundary (ADR 0001). Visibility follows the product (D2).

-- Grants first (D4): explicit, so self-hosted defaults do not matter.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'category', 'attribute', 'category_attribute', 'material', 'product',
    'article', 'article_attribute', 'article_packaging', 'product_accessory',
    'color', 'product_color', 'media', 'product_media', 'ai_generation'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "admin insert" on public.%I for insert to authenticated with check ((select private.is_admin()))', t);
    execute format(
      'create policy "admin update" on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    execute format(
      'create policy "admin delete" on public.%I for delete to authenticated using ((select private.is_admin()))', t);
  end loop;
end;
$$;

-- Reference data: readable by everyone.
create policy "public read" on public.category for select to anon, authenticated using (true);
create policy "public read" on public.attribute for select to anon, authenticated using (true);
create policy "public read" on public.category_attribute for select to anon, authenticated using (true);
create policy "public read" on public.material for select to anon, authenticated using (true);
create policy "public read" on public.color for select to anon, authenticated using (true);

-- Products: published for everyone, everything for the admin.
create policy "read published or admin" on public.product for select to anon, authenticated
  using (status = 'published' or (select private.is_admin()));

-- Children: visible when the parent row is visible to the caller. The
-- subqueries run under the caller's RLS, so visibility cascades.
create policy "read with product" on public.article for select to anon, authenticated
  using (exists (select 1 from public.product p where p.id = article.product_id));
create policy "read with product" on public.product_color for select to anon, authenticated
  using (exists (select 1 from public.product p where p.id = product_color.product_id));
create policy "read with product" on public.product_media for select to anon, authenticated
  using (exists (select 1 from public.product p where p.id = product_media.product_id));
create policy "read with article" on public.article_attribute for select to anon, authenticated
  using (exists (select 1 from public.article a where a.id = article_attribute.article_id));
create policy "read with article" on public.article_packaging for select to anon, authenticated
  using (exists (select 1 from public.article a where a.id = article_packaging.article_id));
create policy "read with both products" on public.product_accessory for select to anon, authenticated
  using (
    exists (select 1 from public.product p where p.id = product_accessory.product_id)
    and exists (select 1 from public.article a where a.id = product_accessory.article_id)
  );
-- Media: linked to a visible product, or any media for the admin (uploads
-- exist before they are linked).
create policy "read linked or admin" on public.media for select to anon, authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.product_media pm where pm.media_id = media.id)
  );

create policy "admin read" on public.ai_generation for select to authenticated
  using ((select private.is_admin()));
