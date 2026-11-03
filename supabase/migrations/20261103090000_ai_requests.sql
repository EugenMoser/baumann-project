-- supabase/migrations/20261103090000_ai_requests.sql
-- AI request log with the monthly cap and the hourly limit per admin
-- (feature 7, D7). Every reserved request counts, whatever the outcome.

create table public.ai_request (
  id bigint generated always as identity primary key,
  product_id bigint references public.product (id) on delete set null,
  requested_by uuid not null,
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index ai_request_created_at_idx on public.ai_request (created_at);
create index ai_request_requested_by_created_at_idx on public.ai_request (requested_by, created_at);
-- Foreign keys are not indexed automatically.
create index ai_request_product_id_idx on public.ai_request (product_id);

-- Old generations have no request.
alter table public.ai_generation
  add column request_id bigint references public.ai_request (id) on delete cascade;
create index ai_generation_request_id_idx on public.ai_generation (request_id);

-- Grants (default privileges on public are revoked for anon/authenticated).
-- anon may select like every public table; RLS returns no rows. Column grants
-- keep the log append-only: no delete, and neither created_at nor
-- requested_by can be changed, so a request cannot leave the limit windows.
grant select on public.ai_request to anon, authenticated;
grant insert (product_id, requested_by) on public.ai_request to authenticated;
grant update (status, model, input_tokens, output_tokens) on public.ai_request to authenticated;
grant usage on sequence public.ai_request_id_seq to authenticated;

alter table public.ai_request enable row level security;

create policy "admin read" on public.ai_request for select to authenticated
  using ((select private.is_admin()));
-- An admin logs requests only in their own name.
create policy "admin insert" on public.ai_request for insert to authenticated
  with check ((select private.is_admin()) and requested_by = (select auth.uid()));
create policy "admin update" on public.ai_request for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Reserves one request before any provider call. security invoker: RLS
-- applies, so a non-admin fails at the insert (42501). The advisory lock
-- serialises callers until their transaction ends; under read committed each
-- count then sees the rows of every caller before. AI001: monthly cap
-- (calendar month in Europe/Berlin), AI002: hourly limit of the caller.
create function public.reserve_ai_request(p_product_id bigint, p_monthly_cap integer, p_hourly_limit integer)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('ai_request'));

  if (select count(*) from public.ai_request
      where created_at >= date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin')
     >= p_monthly_cap then
    raise exception 'monthly AI request cap reached' using errcode = 'AI001';
  end if;

  if (select count(*) from public.ai_request
      where requested_by = (select auth.uid()) and created_at >= now() - interval '1 hour')
     >= p_hourly_limit then
    raise exception 'hourly AI request limit reached' using errcode = 'AI002';
  end if;

  insert into public.ai_request (product_id, requested_by)
  values (p_product_id, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reserve_ai_request(bigint, integer, integer) from public, anon;
grant execute on function public.reserve_ai_request(bigint, integer, integer) to authenticated;

-- remove_catalog() from 20261011090000_certificates.sql, extended by the AI
-- request log.
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
  delete from public.ai_request where true;
  delete from public.certificate_document where true;
  delete from public.certificate where true;
  return counts;
end;
$$;

revoke execute on function public.remove_catalog() from public, anon, authenticated;
grant execute on function public.remove_catalog() to service_role;
