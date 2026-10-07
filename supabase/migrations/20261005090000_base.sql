-- Extensions, helper schema, enums and helper functions for the catalog.

create extension if not exists pg_trgm with schema extensions;

-- Not exposed through the API (only `public` is in config.toml [api].schemas).
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create type public.product_status as enum ('draft', 'published', 'archived');
create type public.content_origin as enum ('human', 'ai', 'ai_edited');
create type public.attribute_data_type as enum ('decimal', 'text');
create type public.media_role as enum ('thumbnail', 'gallery');

-- True when the caller's JWT carries app_metadata.role = "admin". Only the
-- service role can write app_metadata, so users cannot grant it to themselves.
create function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

grant execute on function private.is_admin() to anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
