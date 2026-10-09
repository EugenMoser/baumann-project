-- Certificates for the quality page (feature 5, spec D2/D3). Filled by
-- `pnpm certificates:import`, removed by remove_catalog(). Files live in the
-- public bucket `catalog` under certificates/.

create table public.certificate (
  id bigint generated always as identity primary key,
  standard text not null unique check (btrim(standard) <> ''),
  title text not null check (btrim(title) <> ''),
  preview_path text not null check (preview_path like 'certificates/%'),
  preview_width integer not null check (preview_width > 0),
  preview_height integer not null check (preview_height > 0),
  preview_alt text not null check (btrim(preview_alt) <> ''),
  sort_order integer not null default 0
);

create table public.certificate_document (
  certificate_id bigint not null references public.certificate (id) on delete cascade,
  language text not null check (language in ('de', 'en')),
  storage_path text not null check (storage_path like 'certificates/%'),
  primary key (certificate_id, language)
);

-- Grants (default privileges on public are revoked for anon/authenticated).
grant select on public.certificate, public.certificate_document to anon, authenticated;
grant insert, update, delete on public.certificate, public.certificate_document to authenticated;
grant usage on sequence public.certificate_id_seq to authenticated;

alter table public.certificate enable row level security;
alter table public.certificate_document enable row level security;

-- Certificates have no draft state: everyone reads every row.
create policy "public read" on public.certificate for select to anon, authenticated using (true);
create policy "public read" on public.certificate_document for select to anon, authenticated using (true);

create policy "admin insert" on public.certificate for insert to authenticated with check ((select private.is_admin()));
create policy "admin update" on public.certificate for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete" on public.certificate for delete to authenticated using ((select private.is_admin()));
create policy "admin insert" on public.certificate_document for insert to authenticated with check ((select private.is_admin()));
create policy "admin update" on public.certificate_document for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete" on public.certificate_document for delete to authenticated using ((select private.is_admin()));

-- Replaces all certificates in one transaction (spec D3). Runs as the caller
-- (service role, bypasses RLS), like import_catalog.
create function public.import_certificates(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cert jsonb;
  doc jsonb;
  new_id bigint;
  imported integer := 0;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception 'import_certificates: payload must be a non-empty array';
  end if;
  delete from public.certificate where true;
  for cert in select value from jsonb_array_elements(payload) loop
    if coalesce(jsonb_typeof(cert -> 'documents'), '') <> 'array' or jsonb_array_length(cert -> 'documents') = 0 then
      raise exception 'import_certificates: certificate % has no documents', cert ->> 'standard';
    end if;
    insert into public.certificate (standard, title, preview_path, preview_width, preview_height, preview_alt, sort_order)
    values (cert ->> 'standard', cert ->> 'title', cert ->> 'preview_path',
            (cert ->> 'preview_width')::integer, (cert ->> 'preview_height')::integer,
            cert ->> 'preview_alt', coalesce((cert ->> 'sort_order')::integer, 0))
    returning id into new_id;
    for doc in select value from jsonb_array_elements(cert -> 'documents') loop
      insert into public.certificate_document (certificate_id, language, storage_path)
      values (new_id, doc ->> 'language', doc ->> 'storage_path');
    end loop;
    imported := imported + 1;
  end loop;
  return jsonb_build_object(
    'certificates', imported,
    'documents', (select count(*) from public.certificate_document));
end;
$$;

revoke execute on function public.import_certificates(jsonb) from public, anon, authenticated;
grant execute on function public.import_certificates(jsonb) to service_role;

-- remove_catalog() from feature 3, extended by the certificate tables.
create or replace function public.remove_catalog()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  counts jsonb;
begin
  counts := jsonb_build_object(
    'products', (select count(*) from public.product),
    'articles', (select count(*) from public.article),
    'media', (select count(*) from public.media),
    'certificates', (select count(*) from public.certificate));
  -- `where true`: some setups reject DELETE without a WHERE clause.
  delete from public.product_accessory where true;
  delete from public.product_media where true;
  delete from public.product_color where true;
  delete from public.article_packaging where true;
  delete from public.article_attribute where true;
  delete from public.article where true;
  delete from public.product where true;
  delete from public.category_attribute where true;
  delete from public.category where true;
  delete from public.attribute where true;
  delete from public.material where true;
  delete from public.color where true;
  delete from public.media where true;
  delete from public.ai_generation where true;
  delete from public.certificate_document where true;
  delete from public.certificate where true;
  return counts;
end;
$$;

revoke execute on function public.remove_catalog() from public, anon, authenticated;
grant execute on function public.remove_catalog() to service_role;
