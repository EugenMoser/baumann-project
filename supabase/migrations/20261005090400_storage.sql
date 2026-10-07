-- Catalog images. Public bucket: files are served by public URL without a
-- select policy; listing and writes are admin-only.
insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true)
on conflict (id) do nothing;

create policy "catalog admin read" on storage.objects for select to authenticated
  using (bucket_id = 'catalog' and (select private.is_admin()));
create policy "catalog admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and (select private.is_admin()));
create policy "catalog admin update" on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and (select private.is_admin()))
  with check (bucket_id = 'catalog' and (select private.is_admin()));
create policy "catalog admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and (select private.is_admin()));
