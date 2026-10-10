# Admin: images & master data (feature 6b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin maintains product images (upload, alt text, thumbnail, order, removal), accessories, categories (incl. attribute assignment), colours and materials; Storage never keeps files of removed images or deleted products.

**Architecture:** Same layering as 6a: Server Actions in `app/admin/(protected)/…` → `adminWrite` (session check, revalidation, logging) → data access in `lib/admin/*` with the cookie session client → Postgres with RLS and `security invoker` functions. Uploads are validated from the bytes with `image-size` and written to the public bucket `catalog` with the admin session; a failed DB write removes the uploaded file. `pnpm media:prune` (service role) removes orphans.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript strict, Supabase (Postgres, Storage, `@supabase/ssr`), Zod 4, shadcn/ui, Vitest + Testing Library, pgTAP, Playwright.

**Spec:** `docs/specs/2026-10-10-admin-media-master-data-design.md` (FR-1 … FR-15, D1 … D11). Read it before any task.

## Global Constraints

- Code, identifiers, comments, commit messages: English. UI texts and validation messages: German.
- TypeScript `strict`; no `any`; Zod for all form input; `Result` from `lib/result.ts` for fallible data access.
- Every admin write goes through `adminWrite` (`lib/admin/write.ts`) via the `runWrite` helper pattern of `app/admin/(protected)/produkte/actions.ts`; revalidation only after success.
- Logging: context string plus PG code or storage error text only — never form values, alt texts, file names supplied by the user, or e-mail addresses.
- New SQL functions: `language plpgsql security invoker set search_path = ''`, explicit `private.is_admin()` check raising `42501`, `revoke all … from public, anon; grant execute … to authenticated`.
- Upload limits: 5 MiB (`5 * 1024 * 1024` bytes), JPEG/PNG/WebP detected from the bytes, 1–8000 px per side, alt text 1–250 characters after trim.
- New storage paths: `products/{product_id}/{uuid}.{ext}` (`ext` ∈ `jpg`, `png`, `webp`); `upsert: false`.
- `next.config.ts`: `experimental.serverActions.bodySizeLimit: "6mb"`.
- `image-size` moves from `devDependencies` to `dependencies`; no other new dependency.
- Never commit image files. Test images are generated in code (`tests/fixtures/images.ts`).
- Never remove the demo banner or `noindex`.
- Next.js 16: read `node_modules/next/dist/docs/` before using an API you have not used in this repo (`bodySizeLimit`, `File` in Server Actions).
- Commands: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:test` (stack running), `pnpm e2e` (see CLAUDE.md), `pnpm build`.
- After a migration: `pnpm db:reset && pnpm db:types` and commit `lib/supabase/database.types.ts`.
- Commits: Conventional Commits, WIP commits on the feature branch are fine.

## Review Focus

1. **Upload form submitted without choosing a file** (browsers send an empty `File` with `size 0` and name `""`) → field error "Bitte eine Bilddatei wählen.", nothing uploaded. Test in Task 3 (`readUpload`).
2. **Accessory numbers typed with surrounding spaces or twice** (`" 99010 "`, `99010` in two rows) → trimmed exact match resolves; duplicate rows give a row error before any DB call. Test in Task 5.
3. **Lower-case hex codes** (`#a1b2c3`) → accepted and stored as typed; `#abc` or `a1b2c3` rejected. Test in Task 8.
4. **Removing the last image, then uploading again** → product has no images in between (public placeholder), the next upload becomes the thumbnail. pgTAP in Task 1 and e2e in Task 10.
5. **E2E runs leave no orphan files** → teardown deletes media rows and Storage files of `e2e-` products before deleting them. Implemented and exercised in Task 10.

---

### Task 1: Migration, pgTAP tests, DB types and error messages

**Files:**

- Create: `supabase/migrations/20261013090000_admin_media_master_data.sql`
- Create: `supabase/tests/12_admin_media.test.sql`
- Modify: `lib/supabase/database.types.ts` (regenerated)
- Modify: `lib/admin/errors.ts`
- Test: `lib/admin/errors.test.ts`

**Interfaces:**

- Produces (SQL, all `security invoker`, executable by `authenticated` only):
  - `public.admin_attach_media(p_product_id bigint, p_storage_path text, p_width integer, p_height integer, p_alt_text text) returns bigint`
  - `public.admin_set_product_media(p_product_id bigint, payload jsonb) returns void` — payload `[{media_id, alt_text, alt_origin, is_thumbnail}]`, array order = `sort_order`
  - `public.admin_remove_media(p_product_id bigint, p_media_id bigint) returns text` (storage path)
  - `public.admin_delete_product(p_product_id bigint) returns text[]` (storage paths)
  - `public.admin_set_product_accessories(p_product_id bigint, payload jsonb) returns void` — payload `[{article_id}]`, array order = `sort_order`
  - `public.admin_save_category(payload jsonb) returns bigint` — payload `{id?, name, slug, intro_text, seo_title, seo_description, sort_order, attributes: [{attribute_id, sort_order}]}`
- Produces (TS, `lib/admin/errors.ts`): exported constants `INVALID_MEDIA_LIST`, `STALE_MEDIA_LIST`, `NEEDS_ONE_THUMBNAIL`, `ALT_TEXT_REQUIRED`, `INVALID_ACCESSORY_LIST`, `OWN_ARTICLE_ACCESSORY`, `DUPLICATE_ACCESSORY`, `INVALID_CATEGORY_DATA`, `CATEGORY_IN_USE`, `COLOR_IN_USE`, `MATERIAL_IN_USE`, `UPLOAD_FAILED`; the SQL-raised ones are in `KNOWN_DB_MESSAGES`. `DELETE_PUBLISHED` moves from `product-rules.ts` to `errors.ts` (re-exported from `product-rules.ts`) and is in `KNOWN_DB_MESSAGES`.

- [ ] **Step 1: Check the branch**

Run: `git status --short && git branch --show-current`
Expected: on `feat/admin-media-master-data`, spec, plan and roadmap committed.

- [ ] **Step 2: Write the failing pgTAP test**

Create `supabase/tests/12_admin_media.test.sql`. Seed facts used: product 1 published with media 1 (thumbnail), product 3 published without media, product 4 draft with media 2 (`products/entwurfsteil-1.webp`), article 1/2 on product 1, article 3 on product 2, article 4 on product 3; category 1 has products; attributes 1–3.

```sql
-- supabase/tests/12_admin_media.test.sql
begin;
select plan(42);

-- Privileges (SC-13)
select ok(not has_function_privilege('anon', 'public.admin_attach_media(bigint, text, integer, integer, text)', 'execute'), 'anon cannot attach media');
select ok(not has_function_privilege('anon', 'public.admin_set_product_media(bigint, jsonb)', 'execute'), 'anon cannot set media');
select ok(not has_function_privilege('anon', 'public.admin_remove_media(bigint, bigint)', 'execute'), 'anon cannot remove media');
select ok(not has_function_privilege('anon', 'public.admin_delete_product(bigint)', 'execute'), 'anon cannot delete products');
select ok(not has_function_privilege('anon', 'public.admin_set_product_accessories(bigint, jsonb)', 'execute'), 'anon cannot set accessories');
select ok(not has_function_privilege('anon', 'public.admin_save_category(jsonb)', 'execute'), 'anon cannot save categories');

-- Non-admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.admin_attach_media(3, 'products/3/x.png', 10, 10, 'x')$$, '42501', null, 'non-admin cannot attach media');
select throws_ok($$select public.admin_delete_product(4)$$, '42501', null, 'non-admin cannot delete products');
select throws_ok($$select public.admin_save_category('{"name":"x","slug":"x","intro_text":"","sort_order":0,"attributes":[]}'::jsonb)$$, '42501', null, 'non-admin cannot save categories');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","app_metadata":{"role":"admin"}}';

-- Attach (SC-3)
select isnt(public.admin_attach_media(3, 'products/3/a.png', 40, 30, ' Bild A '), null, 'admin attaches an image');
select is((select pm.role::text from public.product_media pm join public.media m on m.id = pm.media_id where m.storage_path = 'products/3/a.png'), 'thumbnail', 'the first image becomes the thumbnail');
select is((select alt_text from public.media where storage_path = 'products/3/a.png'), 'Bild A', 'alt text is trimmed');
select lives_ok($$select public.admin_attach_media(3, 'products/3/b.png', 40, 30, 'Bild B')$$, 'admin attaches a second image');
select is((select pm.role::text || ':' || pm.sort_order from public.product_media pm join public.media m on m.id = pm.media_id where m.storage_path = 'products/3/b.png'), 'gallery:1', 'the next image is gallery with a higher sort order');
select throws_ok($$select public.admin_attach_media(3, 'products/3/c.png', 40, 30, '  ')$$, '22023', 'Jedes Bild braucht einen Alt-Text.', 'an empty alt text raises');

-- Set (SC-4)
select lives_ok($$select public.admin_set_product_media(3, jsonb_build_array(
  jsonb_build_object('media_id', (select id from public.media where storage_path = 'products/3/b.png'), 'alt_text', 'Bild B', 'alt_origin', 'human', 'is_thumbnail', true),
  jsonb_build_object('media_id', (select id from public.media where storage_path = 'products/3/a.png'), 'alt_text', 'Bild A neu', 'alt_origin', 'ai_edited', 'is_thumbnail', false)))$$,
  'admin moves the thumbnail and reorders');
select is((select m.storage_path from public.product_media pm join public.media m on m.id = pm.media_id where pm.product_id = 3 and pm.role = 'thumbnail'), 'products/3/b.png', 'the thumbnail moved');
select is((select alt_text || ':' || alt_origin from public.media where storage_path = 'products/3/a.png'), 'Bild A neu:ai_edited', 'alt text and origin written');
select is((select array_agg(m.storage_path order by pm.sort_order) from public.product_media pm join public.media m on m.id = pm.media_id where pm.product_id = 3), array['products/3/b.png', 'products/3/a.png'], 'sort order follows the array');
select throws_ok($$select public.admin_set_product_media(3, jsonb_build_array(
  jsonb_build_object('media_id', (select id from public.media where storage_path = 'products/3/b.png'), 'alt_text', 'B', 'alt_origin', 'human', 'is_thumbnail', true)))$$,
  '22023', 'Die Bildliste ist veraltet. Bitte die Seite neu laden.', 'a missing image raises');
select throws_ok($$select public.admin_set_product_media(3, jsonb_build_array(
  jsonb_build_object('media_id', (select id from public.media where storage_path = 'products/3/b.png'), 'alt_text', 'B', 'alt_origin', 'human', 'is_thumbnail', true),
  jsonb_build_object('media_id', (select id from public.media where storage_path = 'products/3/a.png'), 'alt_text', 'A', 'alt_origin', 'human', 'is_thumbnail', true)))$$,
  '22023', 'Genau ein Bild muss Vorschaubild sein.', 'two thumbnails raise');
select throws_ok($$select public.admin_set_product_media(3, jsonb_build_array(
  jsonb_build_object('media_id', (select id from public.media where storage_path = 'products/3/b.png'), 'alt_text', 'B', 'alt_origin', 'human', 'is_thumbnail', true),
  jsonb_build_object('media_id', (select id from public.media where storage_path = 'products/3/a.png'), 'alt_text', ' ', 'alt_origin', 'human', 'is_thumbnail', false)))$$,
  '22023', 'Jedes Bild braucht einen Alt-Text.', 'an empty alt text raises');
select is((select alt_text from public.media where storage_path = 'products/3/a.png'), 'Bild A neu', 'failed calls keep the previous rows');

-- Remove (SC-6)
select is(public.admin_remove_media(3, (select id from public.media where storage_path = 'products/3/b.png')), 'products/3/b.png', 'remove returns the storage path');
select is((select m.storage_path from public.product_media pm join public.media m on m.id = pm.media_id where pm.product_id = 3 and pm.role = 'thumbnail'), 'products/3/a.png', 'the next image becomes the thumbnail');
select throws_ok($$select public.admin_remove_media(1, (select id from public.media where storage_path = 'products/3/a.png'))$$, 'P0002', null, 'an image of another product raises not found');
select lives_ok($$select public.admin_remove_media(3, (select id from public.media where storage_path = 'products/3/a.png'))$$, 'the last image can be removed');
select isnt(public.admin_attach_media(3, 'products/3/d.png', 40, 30, 'Bild D'), null, 'upload after removing the last image');
select is((select pm.role::text from public.product_media pm join public.media m on m.id = pm.media_id where m.storage_path = 'products/3/d.png'), 'thumbnail', 'it becomes the thumbnail (Review Focus 4)');

-- Delete product (SC-6)
select throws_ok($$select public.admin_delete_product(1)$$, '22023', 'Veröffentlichte Produkte können nicht gelöscht werden. Bitte zuerst archivieren.', 'a published product cannot be deleted');
select is(public.admin_delete_product(4), array['products/entwurfsteil-1.webp'], 'deleting a draft returns its image paths');
select is((select count(*) from public.media where storage_path = 'products/entwurfsteil-1.webp') + (select count(*) from public.product where id = 4), 0::bigint, 'product and its media rows are gone');

-- Accessories (SC-9)
select lives_ok($$select public.admin_set_product_accessories(3, '[{"article_id":3},{"article_id":1}]'::jsonb)$$, 'admin replaces the accessory set');
select is((select array_agg(article_id order by sort_order) from public.product_accessory where product_id = 3), array[3::bigint, 1::bigint], 'rows replaced in display order');
select throws_ok($$select public.admin_set_product_accessories(3, '[{"article_id":4}]'::jsonb)$$, '22023', 'Artikel des eigenen Produkts sind kein Zubehör.', 'an own article raises');
select throws_ok($$select public.admin_set_product_accessories(3, '[{"article_id":1},{"article_id":1}]'::jsonb)$$, '22023', 'Jeder Artikel darf nur einmal Zubehör sein.', 'a duplicate raises');

-- Categories (SC-10)
select isnt(public.admin_save_category('{"name":"Neue Kategorie","slug":"neue-kategorie","intro_text":"Text","seo_title":null,"seo_description":null,"sort_order":5,"attributes":[{"attribute_id":1,"sort_order":0},{"attribute_id":2,"sort_order":1}]}'::jsonb), null, 'admin creates a category with attributes');
select is((select count(*) from public.category_attribute ca join public.category c on c.id = ca.category_id where c.slug = 'neue-kategorie'), 2::bigint, 'attributes assigned');
select lives_ok($$select public.admin_save_category(jsonb_build_object('id', (select id from public.category where slug = 'neue-kategorie'), 'name', 'Umbenannt', 'slug', 'neue-kategorie', 'intro_text', '', 'sort_order', 5, 'attributes', '[{"attribute_id":3,"sort_order":0}]'::jsonb))$$, 'admin updates a category');
select is((select array_agg(ca.attribute_id) from public.category_attribute ca join public.category c on c.id = ca.category_id where c.slug = 'neue-kategorie'), array[3::bigint], 'attributes replaced');
select throws_ok($$select public.admin_save_category('{"name":"Doppelt","slug":"sanitaer","intro_text":"","sort_order":0,"attributes":[]}'::jsonb)$$, '23505', null, 'a taken slug raises unique violation');
select throws_ok($$delete from public.category where id = 1$$, '23503', null, 'a category with products cannot be deleted');
reset role;

select * from finish();
rollback;
```

`plan(42)` equals the number of assertions above; recount if you change any.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm db:reset && pnpm exec supabase test db`
Expected: FAIL — `function public.admin_attach_media(...) does not exist`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261013090000_admin_media_master_data.sql`:

```sql
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
```

If `04_rls.test.sql` or `01_schema.test.sql` enumerate functions and fail on the new ones, extend their expectations (do not weaken them).

- [ ] **Step 5: Run the DB tests**

Run: `pnpm db:reset && pnpm exec supabase test db`
Expected: all files PASS, including `12_admin_media.test.sql`.

- [ ] **Step 6: Regenerate types**

Run: `pnpm db:types && pnpm typecheck`
Expected: `lib/supabase/database.types.ts` contains the six new functions under `Functions`; typecheck exit 0.

- [ ] **Step 7: Write the failing error-mapping tests**

Append to `lib/admin/errors.test.ts`:

```ts
import {
  ALT_TEXT_REQUIRED,
  DELETE_PUBLISHED,
  DUPLICATE_ACCESSORY,
  fromPg,
  NEEDS_ONE_THUMBNAIL,
  OWN_ARTICLE_ACCESSORY,
  STALE_MEDIA_LIST,
} from "./errors";

describe("fromPg — 6b function messages (SC-13)", () => {
  it.each([
    STALE_MEDIA_LIST,
    NEEDS_ONE_THUMBNAIL,
    ALT_TEXT_REQUIRED,
    OWN_ARTICLE_ACCESSORY,
    DUPLICATE_ACCESSORY,
    DELETE_PUBLISHED,
  ])("passes on %s as invalid", (message) => {
    expect(fromPg({ code: "22023", message })).toEqual({
      kind: "invalid",
      message,
    });
  });
});
```

Merge the import into the file's existing import block instead of adding a second one.

- [ ] **Step 8: Run to verify it fails**

Run: `pnpm vitest run lib/admin/errors.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 9: Add the constants**

In `lib/admin/errors.ts`, after `ARTICLE_NUMBER_FIXED`:

```ts
export const INVALID_MEDIA_LIST = "Ungültige Bildliste.";
export const STALE_MEDIA_LIST =
  "Die Bildliste ist veraltet. Bitte die Seite neu laden.";
export const NEEDS_ONE_THUMBNAIL = "Genau ein Bild muss Vorschaubild sein.";
export const ALT_TEXT_REQUIRED = "Jedes Bild braucht einen Alt-Text.";
export const INVALID_ACCESSORY_LIST = "Ungültige Zubehörliste.";
export const OWN_ARTICLE_ACCESSORY =
  "Artikel des eigenen Produkts sind kein Zubehör.";
export const DUPLICATE_ACCESSORY =
  "Jeder Artikel darf nur einmal Zubehör sein.";
export const INVALID_CATEGORY_DATA = "Ungültige Kategoriedaten.";
export const DELETE_PUBLISHED =
  "Veröffentlichte Produkte können nicht gelöscht werden. Bitte zuerst archivieren.";
```

Add all of them to `KNOWN_DB_MESSAGES`. Below `STALE_SELECTION` add the app-side messages:

```ts
// 23503 on deleting master data that is still referenced (D7, D8).
export const CATEGORY_IN_USE = "Die Kategorie enthält noch Produkte.";
export const COLOR_IN_USE = "Die Farbe ist noch Produkten zugeordnet.";
export const MATERIAL_IN_USE = "Das Material wird noch verwendet.";
// Storage upload failed (D2); details go to the log only.
export const UPLOAD_FAILED = "Das Bild konnte nicht hochgeladen werden.";
```

In `lib/admin/product-rules.ts` replace the `DELETE_PUBLISHED` definition with `export { DELETE_PUBLISHED } from "./errors";` and import it where it is used inside that file.

- [ ] **Step 10: Run tests**

Run: `pnpm vitest run lib/admin && pnpm typecheck`
Expected: PASS, exit 0.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/20261013090000_admin_media_master_data.sql supabase/tests/12_admin_media.test.sql lib/supabase/database.types.ts lib/admin/errors.ts lib/admin/errors.test.ts lib/admin/product-rules.ts
git commit -m "feat(db): admin functions for images, accessories and categories"
```

---

### Task 2: Image validation and upload configuration

**Files:**

- Create: `tests/fixtures/images.ts`
- Create: `lib/admin/image-check.ts`
- Test: `lib/admin/image-check.test.ts`
- Modify: `package.json` (move `image-size` to `dependencies`), `pnpm-lock.yaml`
- Modify: `next.config.ts`

**Interfaces:**

- Produces: `makePng(width: number, height: number): Uint8Array` (real, decodable PNG), `jpegHeader(width, height): Uint8Array`, `webpHeader(width, height): Uint8Array`, `gifHeader(): Uint8Array` in `tests/fixtures/images.ts`.
- Produces in `lib/admin/image-check.ts`:
  - `MAX_IMAGE_BYTES = 5 * 1024 * 1024`, `MAX_IMAGE_SIDE = 8000`, `MAX_ALT_TEXT = 250`
  - `type CheckedImage = { extension: "jpg" | "png" | "webp"; contentType: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number }`
  - `checkImage(bytes: Uint8Array): Result<CheckedImage, string>`
  - `IMAGE_MESSAGES = { missing, tooLarge, type, dimensions }` (German strings)

- [ ] **Step 1: Write the fixture builders**

```ts
// tests/fixtures/images.ts
// Test images are generated, never committed (project rule).
import { crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A real, decodable grey RGB PNG. */
export function makePng(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3, 0x88);
  row[0] = 0; // filter: none
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}

/** JPEG header up to the SOF0 marker — enough for dimension detection. */
export function jpegHeader(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
    0xff,
    0xd9,
  ]);
}

/** Extended WebP (VP8X) header — enough for dimension detection. */
export function webpHeader(width: number, height: number): Uint8Array {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(22, 4);
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return new Uint8Array(b);
}

export function gifHeader(): Uint8Array {
  return new Uint8Array(
    Buffer.from("GIF89a\x0a\x00\x0a\x00\x00\x00\x00", "latin1")
  );
}
```

If `image-size` does not detect the JPEG or WebP header, adjust the builder (not the validator) until `imageSize()` returns the given dimensions; keep them header-only.

- [ ] **Step 2: Write the failing validator tests**

```ts
// lib/admin/image-check.test.ts
import { describe, expect, it } from "vitest";
import {
  gifHeader,
  jpegHeader,
  makePng,
  webpHeader,
} from "@/tests/fixtures/images";
import { checkImage, IMAGE_MESSAGES, MAX_IMAGE_BYTES } from "./image-check";

describe("checkImage (SC-1)", () => {
  it("accepts PNG, JPEG and WebP with their dimensions", () => {
    expect(checkImage(makePng(40, 30))).toEqual({
      ok: true,
      value: {
        extension: "png",
        contentType: "image/png",
        width: 40,
        height: 30,
      },
    });
    expect(checkImage(jpegHeader(640, 480))).toMatchObject({
      ok: true,
      value: {
        extension: "jpg",
        contentType: "image/jpeg",
        width: 640,
        height: 480,
      },
    });
    expect(checkImage(webpHeader(300, 200))).toMatchObject({
      ok: true,
      value: {
        extension: "webp",
        contentType: "image/webp",
        width: 300,
        height: 200,
      },
    });
  });

  it("rejects an empty file", () => {
    expect(checkImage(new Uint8Array())).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.missing,
    });
  });

  it("rejects a file over 5 MiB", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(makePng(1, 1));
    expect(checkImage(big)).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.tooLarge,
    });
  });

  it("rejects GIF and text renamed to .jpg", () => {
    expect(checkImage(gifHeader())).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.type,
    });
    expect(checkImage(new TextEncoder().encode("not an image"))).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.type,
    });
  });

  it("rejects an image wider than 8000 px", () => {
    expect(checkImage(makePng(8001, 1))).toEqual({
      ok: false,
      error: IMAGE_MESSAGES.dimensions,
    });
  });
});
```

If the `@/tests/…` alias does not resolve (check `tsconfig.json` `paths`), use a relative import `../../tests/fixtures/images`.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run lib/admin/image-check.test.ts`
Expected: FAIL — module `./image-check` not found.

- [ ] **Step 4: Implement**

```ts
// lib/admin/image-check.ts
import { imageSize } from "image-size";
import { err, ok, type Result } from "@/lib/result";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8000;
export const MAX_ALT_TEXT = 250;

export const IMAGE_MESSAGES = {
  missing: "Bitte eine Bilddatei wählen.",
  tooLarge: "Das Bild ist größer als 5 MB.",
  type: "Nur JPEG, PNG oder WebP.",
  dimensions: "Das Bild darf höchstens 8000 × 8000 Pixel groß sein.",
} as const;

export type CheckedImage = {
  extension: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};

const TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;
const isKnown = (t: string | undefined): t is keyof typeof TYPES =>
  t === "jpg" || t === "png" || t === "webp";

// D2: the type comes from the bytes; MIME type and file name are ignored.
export function checkImage(bytes: Uint8Array): Result<CheckedImage, string> {
  if (bytes.length === 0) return err(IMAGE_MESSAGES.missing);
  if (bytes.length > MAX_IMAGE_BYTES) return err(IMAGE_MESSAGES.tooLarge);
  let size: ReturnType<typeof imageSize>;
  try {
    size = imageSize(bytes);
  } catch {
    return err(IMAGE_MESSAGES.type);
  }
  if (!isKnown(size.type)) return err(IMAGE_MESSAGES.type);
  const { width, height } = size;
  if (!width || !height || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE)
    return err(IMAGE_MESSAGES.dimensions);
  return ok({
    extension: size.type,
    contentType: TYPES[size.type],
    width,
    height,
  });
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run lib/admin/image-check.test.ts`
Expected: PASS.

- [ ] **Step 6: Move the dependency and set the body limit**

Run: `pnpm remove image-size && pnpm add image-size@^2.0.4`
Expected: `image-size` listed under `dependencies` only.

In `next.config.ts` add to `nextConfig` (read `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md` first):

```ts
  experimental: {
    serverActions: {
      // 5 MiB images plus multipart overhead (spec D2).
      bodySizeLimit: "6mb",
    },
  },
```

- [ ] **Step 7: Verify build config**

Run: `pnpm typecheck && pnpm lint`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add tests/fixtures/images.ts lib/admin/image-check.ts lib/admin/image-check.test.ts package.json pnpm-lock.yaml next.config.ts
git commit -m "feat(admin): validate uploaded images from their bytes"
```

---

### Task 3: Media data access, flows and actions

**Files:**

- Create: `lib/admin/media.ts` (data access)
- Create: `lib/admin/media-flow.ts` (upload / remove orchestration, storage port)
- Create: `lib/admin/media-schema.ts` (form parsing, origin per image)
- Create: `app/admin/(protected)/produkte/media-actions.ts`
- Modify: `lib/admin/products.ts` (`deleteProduct` → `admin_delete_product`)
- Modify: `app/admin/(protected)/produkte/actions.ts` (`deleteProductAction` removes files)
- Test: `lib/admin/media-flow.test.ts`, `lib/admin/media-schema.test.ts`, extend the existing `deleteProduct` unit/integration tests if they assert the old query

**Interfaces:**

- Consumes: `checkImage`, `CheckedImage`, `MAX_ALT_TEXT`, `IMAGE_MESSAGES` (Task 2); `UPLOAD_FAILED` (Task 1); `nextOrigin` (`lib/admin/origin.ts`); `adminWrite`, `writeDeps`, `errorState`, `FormState`, `idleState`.
- Produces:
  - `lib/admin/media.ts`:
    - `type MediaItem = { mediaId: number; storagePath: string; width: number; height: number; altText: string; altOrigin: ContentOrigin; isThumbnail: boolean; sortOrder: number }`
    - `listProductMedia(client: AdminClient, productId: number): Promise<Result<MediaItem[], AdminError>>` — thumbnail first, then `sort_order`
    - `attachMedia(client, input: { productId: number; storagePath: string; width: number; height: number; altText: string }): Promise<Result<number, AdminError>>`
    - `setProductMedia(client, productId: number, rows: { mediaId: number; altText: string; altOrigin: ContentOrigin; isThumbnail: boolean }[]): Promise<Result<null, AdminError>>`
    - `removeMediaRow(client, productId: number, mediaId: number): Promise<Result<string, AdminError>>`
  - `lib/admin/media-flow.ts`:
    - `type MediaStorage = { upload(path: string, body: Uint8Array, options: { upsert: false; contentType: string }): Promise<{ error: { message: string } | null }>; remove(paths: string[]): Promise<{ error: { message: string } | null }> }`
    - `type FileLog = (context: string, detail: string) => void`
    - `newImagePath(productId: number, extension: CheckedImage["extension"], uuid: string): string`
    - `storeImage(deps: { storage: MediaStorage; attach: (input: AttachInput) => Promise<Result<number, AdminError>>; uuid: () => string; log: FileLog }, input: { productId: number; image: CheckedImage; bytes: Uint8Array; altText: string }): Promise<Result<number, AdminError>>`
    - `removeFiles(storage: MediaStorage, paths: readonly string[], log: FileLog): Promise<void>`
  - `lib/admin/media-schema.ts`:
    - `type UploadValues = { productId: string; altText: string }`
    - `readUpload(formData: FormData): { values: UploadValues; file: File | null }`
    - `parseUploadMeta(values: UploadValues): { ok: true; value: { productId: number; altText: string } } | { ok: false; fieldErrors: FieldErrors }`
    - `type MediaValues = { productId: string; rows: { mediaId: string; altText: string }[]; thumbnailId: string }`
    - `readMediaForm(formData: FormData): MediaValues`
    - `parseMedia(values: MediaValues): { ok: true; value: { productId: number; rows: { mediaId: number; altText: string; isThumbnail: boolean }[] } } | { ok: false; fieldErrors: FieldErrors }`
    - `withAltOrigins(current: MediaItem[], rows: { mediaId: number; altText: string; isThumbnail: boolean }[]): { mediaId: number; altText: string; altOrigin: ContentOrigin; isThumbnail: boolean }[]`
    - `mediaValuesFrom(productId: number, items: MediaItem[]): MediaValues`
  - Actions (`media-actions.ts`): `uploadImageAction(prev: FormState<UploadValues>, formData)`, `saveMediaAction(prev: FormState<MediaValues>, formData)`, `removeImageAction(prev: FormState<null>, formData)`.
  - `deleteProduct(client, id): Promise<Result<string[], AdminError>>` (returns removed storage paths).

- [ ] **Step 1: Write the failing flow tests**

```ts
// lib/admin/media-flow.test.ts
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import { UPLOAD_FAILED } from "./errors";
import {
  newImagePath,
  removeFiles,
  storeImage,
  type MediaStorage,
} from "./media-flow";

const image = {
  extension: "png",
  contentType: "image/png",
  width: 40,
  height: 30,
} as const;
const bytes = new Uint8Array([1, 2, 3]);

function fakeStorage(overrides: Partial<MediaStorage> = {}) {
  const upload = vi.fn<MediaStorage["upload"]>(async () => ({ error: null }));
  const remove = vi.fn<MediaStorage["remove"]>(async () => ({ error: null }));
  return { upload, remove, ...overrides };
}

describe("newImagePath (D1)", () => {
  it("builds products/{id}/{uuid}.{ext}", () => {
    expect(newImagePath(7, "webp", "abc")).toBe("products/7/abc.webp");
  });
});

describe("storeImage (SC-2)", () => {
  it("uploads without upsert, then attaches", async () => {
    const storage = fakeStorage();
    const attach = vi.fn(async () => ok(11));
    const result = await storeImage(
      { storage, attach, uuid: () => "u1", log: vi.fn() },
      { productId: 3, image, bytes, altText: "Bild" }
    );
    expect(result).toEqual(ok(11));
    expect(storage.upload).toHaveBeenCalledWith("products/3/u1.png", bytes, {
      upsert: false,
      contentType: "image/png",
    });
    expect(attach).toHaveBeenCalledWith({
      productId: 3,
      storagePath: "products/3/u1.png",
      width: 40,
      height: 30,
      altText: "Bild",
    });
  });

  it("does not attach when the upload fails", async () => {
    const storage = fakeStorage({
      upload: vi.fn(async () => ({ error: { message: "boom" } })),
    });
    const attach = vi.fn(async () => ok(11));
    const log = vi.fn();
    const result = await storeImage(
      { storage, attach, uuid: () => "u1", log },
      { productId: 3, image, bytes, altText: "Bild" }
    );
    expect(result).toEqual(err({ kind: "invalid", message: UPLOAD_FAILED }));
    expect(attach).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[admin] upload image", "boom");
  });

  it("removes the uploaded file when attaching fails", async () => {
    const storage = fakeStorage();
    const failure = err({ kind: "db_error" as const, code: "XX000" });
    const result = await storeImage(
      {
        storage,
        attach: vi.fn(async () => failure),
        uuid: () => "u1",
        log: vi.fn(),
      },
      { productId: 3, image, bytes, altText: "Bild" }
    );
    expect(result).toEqual(failure);
    expect(storage.remove).toHaveBeenCalledWith(["products/3/u1.png"]);
  });
});

describe("removeFiles (SC-6)", () => {
  it("skips an empty list", async () => {
    const storage = fakeStorage();
    await removeFiles(storage, [], vi.fn());
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("logs a failed removal without throwing", async () => {
    const storage = fakeStorage({
      remove: vi.fn(async () => ({ error: { message: "gone" } })),
    });
    const log = vi.fn();
    await expect(
      removeFiles(storage, ["products/1/a.png"], log)
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[admin] remove files", "gone");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/admin/media-flow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `media-flow.ts`**

```ts
// lib/admin/media-flow.ts
import { err, type Result } from "@/lib/result";
import { UPLOAD_FAILED, type AdminError } from "./errors";
import type { CheckedImage } from "./image-check";

type StorageError = { message: string } | null;
/** The part of a supabase-js storage bucket the admin uses. */
export type MediaStorage = {
  upload(
    path: string,
    body: Uint8Array,
    options: { upsert: false; contentType: string }
  ): Promise<{ error: StorageError }>;
  remove(paths: string[]): Promise<{ error: StorageError }>;
};
// Context plus storage error text; never user-supplied values (D11).
export type FileLog = (context: string, detail: string) => void;
export type AttachInput = {
  productId: number;
  storagePath: string;
  width: number;
  height: number;
  altText: string;
};

export const newImagePath = (
  productId: number,
  extension: CheckedImage["extension"],
  uuid: string
) => `products/${productId}/${uuid}.${extension}`;

// D2 steps 3–5: upload, attach, compensate.
export async function storeImage(
  deps: {
    storage: MediaStorage;
    attach: (input: AttachInput) => Promise<Result<number, AdminError>>;
    uuid: () => string;
    log: FileLog;
  },
  input: {
    productId: number;
    image: CheckedImage;
    bytes: Uint8Array;
    altText: string;
  }
): Promise<Result<number, AdminError>> {
  const path = newImagePath(
    input.productId,
    input.image.extension,
    deps.uuid()
  );
  const uploaded = await deps.storage.upload(path, input.bytes, {
    upsert: false,
    contentType: input.image.contentType,
  });
  if (uploaded.error) {
    deps.log("[admin] upload image", uploaded.error.message);
    return err({ kind: "invalid", message: UPLOAD_FAILED });
  }
  const attached = await deps.attach({
    productId: input.productId,
    storagePath: path,
    width: input.image.width,
    height: input.image.height,
    altText: input.altText,
  });
  if (!attached.ok) await removeFiles(deps.storage, [path], deps.log);
  return attached;
}

// D5: DB first, files second; a failed removal is left to media:prune.
export async function removeFiles(
  storage: MediaStorage,
  paths: readonly string[],
  log: FileLog
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await storage.remove([...paths]);
  if (error) log("[admin] remove files", error.message);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run lib/admin/media-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing schema tests**

```ts
// lib/admin/media-schema.test.ts
import { describe, expect, it } from "vitest";
import { NEEDS_ONE_THUMBNAIL } from "./errors";
import { IMAGE_MESSAGES } from "./image-check";
import type { MediaItem } from "./media";
import {
  parseMedia,
  parseUploadMeta,
  readUpload,
  withAltOrigins,
} from "./media-schema";

const item = (patch: Partial<MediaItem>): MediaItem => ({
  mediaId: 1,
  storagePath: "products/1/a.png",
  width: 10,
  height: 10,
  altText: "Alt",
  altOrigin: "human",
  isThumbnail: true,
  sortOrder: 0,
  ...patch,
});

describe("readUpload (Review Focus 1)", () => {
  it("treats an empty file part as no file", () => {
    const fd = new FormData();
    fd.set("productId", "3");
    fd.set("altText", "Bild");
    fd.set("file", new File([], ""));
    expect(readUpload(fd).file).toBeNull();
  });

  it("returns a chosen file", () => {
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([1])], "a.png"));
    expect(readUpload(fd).file?.name).toBe("a.png");
  });
});

describe("parseUploadMeta (SC-1)", () => {
  it("trims the alt text", () => {
    expect(parseUploadMeta({ productId: "3", altText: " Bild " })).toEqual({
      ok: true,
      value: { productId: 3, altText: "Bild" },
    });
  });
  it("rejects an empty or over-long alt text", () => {
    expect(parseUploadMeta({ productId: "3", altText: "  " })).toMatchObject({
      ok: false,
      fieldErrors: { altText: "Bitte einen Alt-Text eingeben." },
    });
    expect(
      parseUploadMeta({ productId: "3", altText: "x".repeat(251) })
    ).toMatchObject({
      ok: false,
      fieldErrors: { altText: "Höchstens 250 Zeichen." },
    });
  });
  it("exposes the missing-file message for the action", () => {
    expect(IMAGE_MESSAGES.missing).toBe("Bitte eine Bilddatei wählen.");
  });
});

describe("parseMedia (SC-4)", () => {
  it("keeps the display order and marks one thumbnail", () => {
    const result = parseMedia({
      productId: "3",
      rows: [
        { mediaId: "8", altText: "B" },
        { mediaId: "7", altText: "A" },
      ],
      thumbnailId: "7",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        productId: 3,
        rows: [
          { mediaId: 8, altText: "B", isThumbnail: false },
          { mediaId: 7, altText: "A", isThumbnail: true },
        ],
      },
    });
  });
  it("reports an empty alt text per row and a missing thumbnail", () => {
    const result = parseMedia({
      productId: "3",
      rows: [{ mediaId: "8", altText: " " }],
      thumbnailId: "",
    });
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        "rows.0.altText": "Bitte einen Alt-Text eingeben.",
        media: NEEDS_ONE_THUMBNAIL,
      },
    });
  });
});

describe("withAltOrigins (SC-4, origin rule)", () => {
  const rows = (altText: string) => [
    { mediaId: 1, altText, isThumbnail: true },
  ];
  it.each([
    ["human", "Alt", "human"],
    ["human", "Neu", "human"],
    ["ai", "Alt", "ai"],
    ["ai", "Neu", "ai_edited"],
    ["ai_edited", "Neu", "ai_edited"],
  ] as const)("%s + %s → %s", (prev, text, expected) => {
    expect(
      withAltOrigins([item({ altOrigin: prev })], rows(text))[0]?.altOrigin
    ).toBe(expected);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm vitest run lib/admin/media-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `media.ts` and `media-schema.ts`**

```ts
// lib/admin/media.ts
import type { ContentOrigin } from "@/lib/catalog/types";
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { fromPg, type AdminError } from "./errors";
import type { AttachInput } from "./media-flow";

export type MediaItem = {
  mediaId: number;
  storagePath: string;
  width: number;
  height: number;
  altText: string;
  altOrigin: ContentOrigin;
  isThumbnail: boolean;
  sortOrder: number;
};

export async function listProductMedia(
  client: AdminClient,
  productId: number
): Promise<Result<MediaItem[], AdminError>> {
  const { data, error } = await client
    .from("product_media")
    .select(
      "role, sort_order, media(id, storage_path, width, height, alt_text, alt_origin)"
    )
    .eq("product_id", productId);
  if (error) return err(fromPg(error));
  const items = data.map((r) => ({
    mediaId: r.media.id,
    storagePath: r.media.storage_path,
    width: r.media.width,
    height: r.media.height,
    altText: r.media.alt_text,
    altOrigin: r.media.alt_origin,
    isThumbnail: r.role === "thumbnail",
    sortOrder: r.sort_order,
  }));
  // Same order as the public gallery: thumbnail first, then sort order.
  items.sort(
    (a, b) =>
      Number(b.isThumbnail) - Number(a.isThumbnail) ||
      a.sortOrder - b.sortOrder ||
      a.mediaId - b.mediaId
  );
  return ok(items);
}

export async function attachMedia(
  client: AdminClient,
  input: AttachInput
): Promise<Result<number, AdminError>> {
  const { data, error } = await client.rpc("admin_attach_media", {
    p_product_id: input.productId,
    p_storage_path: input.storagePath,
    p_width: input.width,
    p_height: input.height,
    p_alt_text: input.altText,
  });
  if (error) return err(fromPg(error));
  return ok(data);
}

export async function setProductMedia(
  client: AdminClient,
  productId: number,
  rows: {
    mediaId: number;
    altText: string;
    altOrigin: ContentOrigin;
    isThumbnail: boolean;
  }[]
): Promise<Result<null, AdminError>> {
  const { error } = await client.rpc("admin_set_product_media", {
    p_product_id: productId,
    payload: rows.map((r) => ({
      media_id: r.mediaId,
      alt_text: r.altText,
      alt_origin: r.altOrigin,
      is_thumbnail: r.isThumbnail,
    })),
  });
  if (error) return err(fromPg(error));
  return ok(null);
}

export async function removeMediaRow(
  client: AdminClient,
  productId: number,
  mediaId: number
): Promise<Result<string, AdminError>> {
  const { data, error } = await client.rpc("admin_remove_media", {
    p_product_id: productId,
    p_media_id: mediaId,
  });
  if (error) return err(fromPg(error));
  return ok(data);
}
```

If the generated types make `media` nullable or an array in the embed, narrow with a guard instead of a cast.

```ts
// lib/admin/media-schema.ts
import type { ContentOrigin } from "@/lib/catalog/types";
import { NEEDS_ONE_THUMBNAIL } from "./errors";
import type { FieldErrors } from "./form";
import { MAX_ALT_TEXT } from "./image-check";
import type { MediaItem } from "./media";
import { nextOrigin } from "./origin";

const ID = /^[1-9]\d{0,9}$/;
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
const ALT_REQUIRED = "Bitte einen Alt-Text eingeben.";
const ALT_TOO_LONG = `Höchstens ${MAX_ALT_TEXT} Zeichen.`;

function altError(text: string): string | null {
  const t = text.trim();
  if (t === "") return ALT_REQUIRED;
  if (t.length > MAX_ALT_TEXT) return ALT_TOO_LONG;
  return null;
}

export type UploadValues = { productId: string; altText: string };

export function readUpload(formData: FormData): {
  values: UploadValues;
  file: File | null;
} {
  const file = formData.get("file");
  return {
    values: {
      productId: str(formData.get("productId")),
      altText: str(formData.get("altText")),
    },
    // Browsers send an empty part when no file was chosen (Review Focus 1).
    file: file instanceof File && file.size > 0 ? file : null,
  };
}

export function parseUploadMeta(
  values: UploadValues
):
  | { ok: true; value: { productId: number; altText: string } }
  | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!ID.test(values.productId)) errors.form = "Ungültiges Produkt.";
  const alt = altError(values.altText);
  if (alt) errors.altText = alt;
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      productId: Number(values.productId),
      altText: values.altText.trim(),
    },
  };
}

export type MediaValues = {
  productId: string;
  rows: { mediaId: string; altText: string }[];
  thumbnailId: string;
};

export function readMediaForm(formData: FormData): MediaValues {
  const ids = formData.getAll("mediaId").map(str);
  const alts = formData.getAll("altText").map(str);
  return {
    productId: str(formData.get("productId")),
    rows: ids.map((mediaId, i) => ({ mediaId, altText: alts[i] ?? "" })),
    thumbnailId: str(formData.get("thumbnail")),
  };
}

export function parseMedia(values: MediaValues):
  | {
      ok: true;
      value: {
        productId: number;
        rows: { mediaId: number; altText: string; isThumbnail: boolean }[];
      };
    }
  | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!ID.test(values.productId)) errors.form = "Ungültiges Produkt.";
  const rows = values.rows.map((row, i) => {
    if (!ID.test(row.mediaId)) errors.form = "Ungültige Anfrage.";
    const alt = altError(row.altText);
    if (alt) errors[`rows.${i}.altText`] = alt;
    return {
      mediaId: Number(row.mediaId),
      altText: row.altText.trim(),
      isThumbnail: row.mediaId === values.thumbnailId,
    };
  });
  if (rows.length > 0 && rows.filter((r) => r.isThumbnail).length !== 1)
    errors.media = NEEDS_ONE_THUMBNAIL;
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { productId: Number(values.productId), rows } };
}

// D4: alt_origin per image follows the 6a origin rule.
export function withAltOrigins(
  current: MediaItem[],
  rows: { mediaId: number; altText: string; isThumbnail: boolean }[]
): {
  mediaId: number;
  altText: string;
  altOrigin: ContentOrigin;
  isThumbnail: boolean;
}[] {
  const byId = new Map(current.map((m) => [m.mediaId, m]));
  return rows.map((r) => {
    const prev = byId.get(r.mediaId);
    return {
      ...r,
      altOrigin: prev
        ? nextOrigin(prev.altOrigin, prev.altText !== r.altText)
        : "human",
    };
  });
}

export function mediaValuesFrom(
  productId: number,
  items: MediaItem[]
): MediaValues {
  return {
    productId: String(productId),
    rows: items.map((m) => ({
      mediaId: String(m.mediaId),
      altText: m.altText,
    })),
    thumbnailId: String(
      items.find((m) => m.isThumbnail)?.mediaId ?? items[0]?.mediaId ?? ""
    ),
  };
}
```

A stale id in the payload (unknown to `current`) gets `"human"`; the SQL function then rejects the stale list.

- [ ] **Step 8: Run tests**

Run: `pnpm vitest run lib/admin/media-schema.test.ts lib/admin/media-flow.test.ts`
Expected: PASS.

- [ ] **Step 9: Switch `deleteProduct` to `admin_delete_product`**

In `lib/admin/products.ts` replace the body of `deleteProduct` after the published check:

```ts
export async function deleteProduct(
  client: AdminClient,
  id: number
): Promise<Result<string[], AdminError>> {
  const { data: row, error: readError } = await client
    .from("product")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readError) return err(fromPg(readError));
  if (row === null) return err({ kind: "not_found" });
  if (row.status === "published")
    return err({ kind: "invalid", message: DELETE_PUBLISHED });
  // D5: product, its rows and its media rows in one transaction; returns
  // the storage paths the caller removes afterwards.
  const { data, error } = await client.rpc("admin_delete_product", {
    p_product_id: id,
  });
  if (error) return err(fromPg(error));
  return ok(data);
}
```

Update existing tests that assert the old `.delete()` call (search `deleteProduct` in `lib/` and `tests/integration/`); the integration test must now also assert that `deleteProduct` returns `[]` for a product without images.

- [ ] **Step 10: Write the actions**

Create `app/admin/(protected)/produkte/media-actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/admin/auth";
import type { AdminError } from "@/lib/admin/errors";
import { errorState, type FormState } from "@/lib/admin/form";
import {
  checkImage,
  IMAGE_MESSAGES,
  MAX_IMAGE_BYTES,
} from "@/lib/admin/image-check";
import {
  attachMedia,
  listProductMedia,
  removeMediaRow,
  setProductMedia,
} from "@/lib/admin/media";
import { removeFiles, storeImage, type FileLog } from "@/lib/admin/media-flow";
import {
  parseMedia,
  parseUploadMeta,
  readMediaForm,
  readUpload,
  withAltOrigins,
  type MediaValues,
  type UploadValues,
} from "@/lib/admin/media-schema";
import { writeDeps } from "@/lib/admin/server";
import { adminWrite } from "@/lib/admin/write";
import type { Result } from "@/lib/result";
import {
  createSessionSupabase,
  type AdminClient,
} from "@/lib/supabase/session";

const log: FileLog = (context, detail) => console.error(context, detail);
const bucket = (client: AdminClient) => client.storage.from("catalog");
const invalid = <V>(values: V): FormState<V> => ({
  status: "error",
  values,
  fieldErrors: {},
  formError: "Ungültige Anfrage.",
});

async function runWrite<T, V>(
  values: V,
  context: string,
  write: (client: AdminClient) => Promise<Result<T, AdminError>>
): Promise<{ state: FormState<V> } | { value: T }> {
  const client = await createSessionSupabase();
  const outcome = await adminWrite(writeDeps(client), context, () =>
    write(client)
  );
  if (outcome.kind === "anonymous") redirect(LOGIN_PATH);
  if (!outcome.result.ok)
    return { state: errorState(values, outcome.result.error) };
  return { value: outcome.result.value };
}

export async function uploadImageAction(
  _prev: FormState<UploadValues>,
  formData: FormData
): Promise<FormState<UploadValues>> {
  const { values, file } = readUpload(formData);
  const meta = parseUploadMeta(values);
  const fieldErrors = meta.ok ? {} : { ...meta.fieldErrors };
  if (file === null) fieldErrors.file = IMAGE_MESSAGES.missing;
  else if (file.size > MAX_IMAGE_BYTES)
    fieldErrors.file = IMAGE_MESSAGES.tooLarge;
  if (fieldErrors.form) return invalid(values);
  if (!meta.ok || file === null || Object.keys(fieldErrors).length > 0)
    return { status: "error", values, fieldErrors, formError: null };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = checkImage(bytes);
  if (!image.ok)
    return {
      status: "error",
      values,
      fieldErrors: { file: image.error },
      formError: null,
    };
  const done = await runWrite(values, "[admin] upload image", (client) =>
    storeImage(
      {
        storage: bucket(client),
        attach: (input) => attachMedia(client, input),
        uuid: () => crypto.randomUUID(),
        log,
      },
      {
        productId: meta.value.productId,
        image: image.value,
        bytes,
        altText: meta.value.altText,
      }
    )
  );
  if ("state" in done) return done.state;
  return {
    status: "saved",
    values: { productId: values.productId, altText: "" },
    fieldErrors: {},
    formError: null,
  };
}

export async function saveMediaAction(
  _prev: FormState<MediaValues>,
  formData: FormData
): Promise<FormState<MediaValues>> {
  const values = readMediaForm(formData);
  const parsed = parseMedia(values);
  if (!parsed.ok) {
    if (parsed.fieldErrors.form) return invalid(values);
    return {
      status: "error",
      values,
      fieldErrors: parsed.fieldErrors,
      formError: null,
    };
  }
  const { productId, rows } = parsed.value;
  const done = await runWrite(values, "[admin] save images", async (client) => {
    const current = await listProductMedia(client, productId);
    if (!current.ok) return current;
    return setProductMedia(
      client,
      productId,
      withAltOrigins(current.value, rows)
    );
  });
  if ("state" in done) return done.state;
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

const idFrom = (formData: FormData, name: string): number | null => {
  const raw = formData.get(name);
  return typeof raw === "string" && /^[1-9]\d{0,9}$/.test(raw)
    ? Number(raw)
    : null;
};

export async function removeImageAction(
  _prev: FormState<null>,
  formData: FormData
): Promise<FormState<null>> {
  const productId = idFrom(formData, "productId");
  const mediaId = idFrom(formData, "mediaId");
  if (productId === null || mediaId === null) return invalid(null);
  const done = await runWrite(null, "[admin] remove image", async (client) => {
    const removed = await removeMediaRow(client, productId, mediaId);
    if (removed.ok) await removeFiles(bucket(client), [removed.value], log);
    return removed;
  });
  if ("state" in done) return done.state;
  return { status: "saved", values: null, fieldErrors: {}, formError: null };
}
```

In `app/admin/(protected)/produkte/actions.ts`, change `deleteProductAction`'s write to remove the files after a successful delete:

```ts
const done = await runWrite(null, "[admin] delete product", async (client) => {
  const deleted = await deleteProduct(client, id);
  if (deleted.ok)
    await removeFiles(
      client.storage.from("catalog"),
      deleted.value,
      (context, detail) => console.error(context, detail)
    );
  return deleted;
});
```

(import `removeFiles` from `@/lib/admin/media-flow`).

- [ ] **Step 11: Write the failing action-level revalidation test (SC-13)**

The existing `lib/admin/write.test.ts` covers revalidation for `adminWrite`. Add a test proving that the remove flow logs a failed file removal but stays successful — via `adminWrite` with fake deps:

```ts
// append to lib/admin/media-flow.test.ts
import { adminWrite } from "./write";

describe("remove flow through adminWrite (SC-6, SC-13)", () => {
  it("revalidates after the row is gone even if the file removal fails", async () => {
    const revalidate = vi.fn();
    const log = vi.fn();
    const storage = fakeStorage({
      remove: vi.fn(async () => ({ error: { message: "x" } })),
    });
    const outcome = await adminWrite(
      {
        check: async () => ({
          kind: "admin" as const,
          userId: "u1",
          email: "a@example.test",
        }),
        revalidate,
        logError: vi.fn(),
      },
      "[admin] remove image",
      async () => {
        const removed = ok("products/1/a.png");
        await removeFiles(storage, [removed.value], log);
        return removed;
      }
    );
    expect(outcome).toEqual({ kind: "done", result: ok("products/1/a.png") });
    expect(revalidate).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("[admin] remove files", "x");
  });
});
```

- [ ] **Step 12: Run all checks**

Run: `pnpm vitest run lib/admin && pnpm typecheck && pnpm lint`
Expected: PASS, exit 0.

- [ ] **Step 13: Commit**

```bash
git add lib/admin/media.ts lib/admin/media-flow.ts lib/admin/media-flow.test.ts lib/admin/media-schema.ts lib/admin/media-schema.test.ts lib/admin/products.ts "app/admin/(protected)/produkte/media-actions.ts" "app/admin/(protected)/produkte/actions.ts" tests/integration
git commit -m "feat(admin): upload, edit and remove product images"
```

---

### Task 4: Image section on the product page

**Files:**

- Create: `components/admin/image-section.tsx`
- Create: `components/admin/upload-form.tsx`
- Create: `components/admin/remove-image-button.tsx`
- Test: `components/admin/image-section.test.tsx`, `components/admin/upload-form.test.tsx`
- Modify: `app/admin/(protected)/produkte/[id]/page.tsx`

**Interfaces:**

- Consumes: `MediaItem`, `listProductMedia` (Task 3); `mediaValuesFrom`, `MediaValues`, `UploadValues` (Task 3); actions `uploadImageAction`, `saveMediaAction`, `removeImageAction`; `publicMediaUrl` (`lib/catalog/media.ts`); `MAX_IMAGE_BYTES`, `IMAGE_MESSAGES` (Task 2).
- Produces: `<ImageSection productId saveAction uploadAction removeAction items />`.

- [ ] **Step 1: Write the failing component tests**

```tsx
// components/admin/image-section.test.tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/lib/admin/media";
import { ImageSection } from "./image-section";

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => (
    <img alt={props.alt} src={props.src} />
  ),
}));

const item = (id: number, alt: string, thumb: boolean): MediaItem => ({
  mediaId: id,
  storagePath: `products/1/${id}.png`,
  width: 10,
  height: 10,
  altText: alt,
  altOrigin: "human",
  isThumbnail: thumb,
  sortOrder: id,
});
const noop = vi.fn(async (prev: never) => prev);

function renderSection(items: MediaItem[]) {
  return render(
    <ImageSection
      productId={1}
      items={items}
      saveAction={noop}
      uploadAction={noop}
      removeAction={noop}
    />
  );
}

describe("ImageSection (SC-5)", () => {
  it("moves an image down and keeps the hidden order in sync", () => {
    renderSection([item(1, "Eins", true), item(2, "Zwei", false)]);
    fireEvent.click(screen.getByRole("button", { name: "Bild 1 nach unten" }));
    const ids = screen
      .getAllByTestId("media-id")
      .map((el) => (el as HTMLInputElement).value);
    expect(ids).toEqual(["2", "1"]);
  });

  it("marks exactly one thumbnail", () => {
    renderSection([item(1, "Eins", true), item(2, "Zwei", false)]);
    const radios = screen.getAllByRole("radio", { name: "Vorschaubild" });
    fireEvent.click(radios[1]!);
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(
      1
    );
    expect((radios[1] as HTMLInputElement).checked).toBe(true);
  });

  it("shows an empty state without images", () => {
    renderSection([]);
    expect(screen.getByText("Noch keine Bilder.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Bilder speichern" })
    ).toBeNull();
  });
});
```

```tsx
// components/admin/upload-form.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/admin/image-check";
import { UploadForm } from "./upload-form";

describe("UploadForm (SC-5)", () => {
  it("rejects a file over 5 MB before submitting", () => {
    const action = vi.fn(async (prev: never) => prev);
    render(<UploadForm productId={1} action={action} />);
    const input = screen.getByLabelText("Bilddatei");
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.png", {
      type: "image/png",
    });
    fireEvent.change(input, { target: { files: [big] } });
    expect(
      screen.getByText("Das Bild ist größer als 5 MB.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bild hochladen" })
    ).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run components/admin/image-section.test.tsx components/admin/upload-form.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `upload-form.tsx`**

```tsx
// components/admin/upload-form.tsx
"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type FormState } from "@/lib/admin/form";
import { IMAGE_MESSAGES, MAX_IMAGE_BYTES } from "@/lib/admin/image-check";
import type { UploadValues } from "@/lib/admin/media-schema";
import { describedBy, Field } from "./field";

type UploadAction = (
  prev: FormState<UploadValues>,
  formData: FormData
) => Promise<FormState<UploadValues>>;

export function UploadForm({
  productId,
  action,
}: {
  productId: number;
  action: UploadAction;
}) {
  const run: UploadAction = async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.status === "saved") toast.success("Bild hochgeladen.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState<UploadValues>({ productId: String(productId), altText: "" })
  );
  // Quick client-side check (D2); the server check is authoritative.
  const [sizeError, setSizeError] = useState<string | null>(null);
  const fileError = sizeError ?? state.fieldErrors.file;
  const altError = state.fieldErrors.altText;
  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-md border p-4"
      noValidate
    >
      <h3 className="font-medium">Bild hochladen</h3>
      <input type="hidden" name="productId" value={productId} />
      <Field
        id="upload-file"
        label="Bilddatei"
        error={fileError}
        hint="JPEG, PNG oder WebP, höchstens 5 MB."
      >
        <Input
          id="upload-file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={Boolean(fileError)}
          aria-describedby={describedBy("upload-file", fileError, "hint")}
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            setSizeError(
              file && file.size > MAX_IMAGE_BYTES
                ? IMAGE_MESSAGES.tooLarge
                : null
            );
          }}
        />
      </Field>
      <Field id="upload-alt" label="Alt-Text" error={altError}>
        <Input
          id="upload-alt"
          name="altText"
          defaultValue={state.values.altText}
          key={state.status === "saved" ? "reset" : "keep"}
          maxLength={250}
          aria-invalid={Boolean(altError)}
          aria-describedby={describedBy("upload-alt", altError)}
        />
      </Field>
      {state.formError ? (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending || sizeError !== null}
        className="justify-self-start"
      >
        Bild hochladen
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Implement `remove-image-button.tsx`**

```tsx
// components/admin/remove-image-button.tsx
"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { idleState, type FormState } from "@/lib/admin/form";

type RemoveAction = (
  prev: FormState<null>,
  formData: FormData
) => Promise<FormState<null>>;

export function RemoveImageButton(props: {
  action: RemoveAction;
  productId: number;
  mediaId: number;
  label: string;
}) {
  const run: RemoveAction = async (prev, formData) => {
    const next = await props.action(prev, formData);
    if (next.status === "saved") toast.success("Bild entfernt.");
    return next;
  };
  const [state, formAction, pending] = useActionState(run, idleState(null));
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${props.label} entfernen`}
        >
          Entfernen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bild entfernen?</AlertDialogTitle>
          <AlertDialogDescription>
            Das Bild wird vom Produkt entfernt und die Datei gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.formError ? (
          <p role="alert" className="text-sm text-destructive">
            {state.formError}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          {/* Rendered in a portal: not nested in the image form. */}
          <form action={formAction}>
            <input type="hidden" name="productId" value={props.productId} />
            <input type="hidden" name="mediaId" value={props.mediaId} />
            <Button type="submit" variant="destructive" disabled={pending}>
              Endgültig entfernen
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Implement `image-section.tsx`**

```tsx
// components/admin/image-section.tsx
"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type FormState } from "@/lib/admin/form";
import type { MediaItem } from "@/lib/admin/media";
import {
  mediaValuesFrom,
  type MediaValues,
  type UploadValues,
} from "@/lib/admin/media-schema";
import { publicMediaUrl } from "@/lib/catalog/media";
import { describedBy, Field } from "./field";
import { RemoveImageButton } from "./remove-image-button";
import { UploadForm } from "./upload-form";

type SaveAction = (
  prev: FormState<MediaValues>,
  formData: FormData
) => Promise<FormState<MediaValues>>;
type UploadAction = (
  prev: FormState<UploadValues>,
  formData: FormData
) => Promise<FormState<UploadValues>>;
type RemoveAction = (
  prev: FormState<null>,
  formData: FormData
) => Promise<FormState<null>>;

type Props = {
  productId: number;
  items: MediaItem[];
  saveAction: SaveAction;
  uploadAction: UploadAction;
  removeAction: RemoveAction;
};

export function ImageSection({
  productId,
  items,
  saveAction,
  uploadAction,
  removeAction,
}: Props) {
  const run: SaveAction = async (prev, formData) => {
    const next = await saveAction(prev, formData);
    if (next.status === "saved") toast.success("Bilder gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState(mediaValuesFrom(productId, items))
  );
  const [rows, setRows] = useState(state.values.rows);
  const [thumbnailId, setThumbnailId] = useState(state.values.thumbnailId);
  const [syncedState, setSyncedState] = useState(state);
  if (syncedState !== state) {
    setSyncedState(state);
    setRows(state.values.rows);
    setThumbnailId(state.values.thumbnailId);
  }
  const byId = new Map(items.map((m) => [String(m.mediaId), m]));
  const e = state.fieldErrors;
  const move = (from: number, to: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(from, 1);
      if (row) next.splice(to, 0, row);
      return next;
    });

  return (
    <section aria-labelledby="images-heading" className="mt-10 grid gap-4">
      <h2 id="images-heading" className="text-xl font-semibold">
        Bilder
      </h2>
      <p className="text-sm text-muted-foreground">
        Das Vorschaubild erscheint in Kacheln und als erstes Bild auf der
        Produktseite.
      </p>
      {rows.length === 0 ? (
        <p>Noch keine Bilder.</p>
      ) : (
        <form action={formAction} className="grid gap-4" noValidate>
          <input type="hidden" name="productId" value={productId} />
          {rows.map((row, i) => {
            const media = byId.get(row.mediaId);
            const aid = `alt-${row.mediaId}`;
            const tid = `thumb-${row.mediaId}`;
            const label = `Bild ${i + 1}`;
            return (
              <fieldset
                key={row.mediaId}
                className="grid grid-cols-[96px_1fr_auto] items-end gap-3"
              >
                <legend className="sr-only">{label}</legend>
                <input
                  type="hidden"
                  name="mediaId"
                  value={row.mediaId}
                  data-testid="media-id"
                />
                {media ? (
                  <Image
                    src={publicMediaUrl(media.storagePath)}
                    alt=""
                    width={media.width}
                    height={media.height}
                    sizes="96px"
                    className="h-24 w-24 rounded border object-contain"
                  />
                ) : (
                  <span className="h-24 w-24 rounded border" aria-hidden />
                )}
                <Field id={aid} label="Alt-Text" error={e[`rows.${i}.altText`]}>
                  <Input
                    id={aid}
                    name="altText"
                    value={row.altText}
                    maxLength={250}
                    aria-invalid={Boolean(e[`rows.${i}.altText`])}
                    aria-describedby={describedBy(aid, e[`rows.${i}.altText`])}
                    onChange={(ev) =>
                      setRows((rs) =>
                        rs.map((r, j) =>
                          j === i ? { ...r, altText: ev.target.value } : r
                        )
                      )
                    }
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  <input
                    id={tid}
                    type="radio"
                    name="thumbnail"
                    value={row.mediaId}
                    checked={thumbnailId === row.mediaId}
                    onChange={() => setThumbnailId(row.mediaId)}
                  />
                  <label htmlFor={tid} className="text-sm">
                    Vorschaubild
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${label} nach oben`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${label} nach unten`}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    ↓
                  </Button>
                  <RemoveImageButton
                    action={removeAction}
                    productId={productId}
                    mediaId={Number(row.mediaId)}
                    label={label}
                  />
                </div>
              </fieldset>
            );
          })}
          {e.media ? (
            <p role="alert" className="text-sm text-destructive">
              {e.media}
            </p>
          ) : null}
          {state.formError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
            >
              {state.formError}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={pending}
            className="justify-self-start"
          >
            Bilder speichern
          </Button>
        </form>
      )}
      <UploadForm productId={productId} action={uploadAction} />
    </section>
  );
}
```

Note: the `RemoveImageButton` trigger sits inside the image form; its dialog content (with its own form) renders in a portal, so forms are not nested in the DOM. If axe or React warns about nesting, move the trigger column out of the `<form>` and associate inputs with `form="images-form"`.

- [ ] **Step 6: Wire the page**

In `app/admin/(protected)/produkte/[id]/page.tsx`:

- extend `loadEditor` to `Promise.all([getProductEditor(client, id), loadEditorOptions(client), listProductMedia(client, id)])` and return `media: unwrapAdmin(media, "product media")`;
- render after `<ColorSection …/>`:

```tsx
<ImageSection
  // Remount when the set of images changes (upload, removal).
  key={media.map((m) => m.mediaId).join("-")}
  productId={product.id}
  items={media}
  saveAction={saveMediaAction}
  uploadAction={uploadImageAction}
  removeAction={removeImageAction}
/>
```

with imports from `../media-actions`, `@/components/admin/image-section` and `@/lib/admin/media`.

- [ ] **Step 7: Run tests and checks**

Run: `pnpm vitest run components/admin && pnpm typecheck && pnpm lint`
Expected: PASS, exit 0.

- [ ] **Step 8: Commit**

```bash
git add components/admin/image-section.tsx components/admin/image-section.test.tsx components/admin/upload-form.tsx components/admin/upload-form.test.tsx components/admin/remove-image-button.tsx "app/admin/(protected)/produkte/[id]/page.tsx"
git commit -m "feat(admin): image section on the product page"
```

---

### Task 5: Accessories

**Files:**

- Create: `lib/admin/accessories.ts`, `lib/admin/accessory-schema.ts`
- Create: `app/admin/(protected)/produkte/accessory-actions.ts`
- Create: `components/admin/accessory-section.tsx`
- Test: `lib/admin/accessory-schema.test.ts`, `components/admin/accessory-section.test.tsx`, `tests/integration/admin-accessories.test.ts`
- Modify: `app/admin/(protected)/produkte/[id]/page.tsx`

**Interfaces:**

- Produces:
  - `type AccessoryItem = { articleNumber: string; articleName: string | null; productName: string }`
  - `listAccessories(client, productId): Promise<Result<AccessoryItem[], AdminError>>` (by `sort_order`)
  - `resolveArticleNumbers(client, numbers: string[]): Promise<Result<Map<string, number>, AdminError>>`
  - `setAccessories(client, productId: number, articleIds: number[]): Promise<Result<null, AdminError>>`
  - `type AccessoryValues = { productId: string; rows: { articleNumber: string }[] }`
  - `readAccessoryForm(formData): AccessoryValues`
  - `parseAccessories(values): { ok: true; value: { productId: number; numbers: string[] } } | { ok: false; fieldErrors: FieldErrors }`
  - `unknownNumberErrors(numbers: string[], resolved: Map<string, number>): FieldErrors`
  - `accessoryValuesFrom(productId, items: AccessoryItem[]): AccessoryValues`
  - `saveAccessoriesAction(prev: FormState<AccessoryValues>, formData)`
  - `<AccessorySection productId items action />`

- [ ] **Step 1: Write the failing schema tests**

```ts
// lib/admin/accessory-schema.test.ts
import { describe, expect, it } from "vitest";
import { parseAccessories, unknownNumberErrors } from "./accessory-schema";

describe("parseAccessories (SC-9, Review Focus 2)", () => {
  it("trims numbers and drops empty rows", () => {
    expect(
      parseAccessories({
        productId: "3",
        rows: [{ articleNumber: " 99010 " }, { articleNumber: "" }],
      })
    ).toEqual({
      ok: true,
      value: { productId: 3, numbers: ["99010"], rows: [0] },
    });
  });
  it("reports a duplicate row", () => {
    expect(
      parseAccessories({
        productId: "3",
        rows: [{ articleNumber: "99010" }, { articleNumber: " 99010" }],
      })
    ).toEqual({
      ok: false,
      fieldErrors: {
        "rows.1.articleNumber": "Dieser Artikel steht schon in der Liste.",
      },
    });
  });
  it("keeps slashes in article numbers", () => {
    expect(
      parseAccessories({
        productId: "3",
        rows: [{ articleNumber: "99211/80" }],
      })
    ).toMatchObject({
      ok: true,
      value: { numbers: ["99211/80"] },
    });
  });
});

describe("unknownNumberErrors (SC-9)", () => {
  it("marks unknown numbers on their row", () => {
    expect(
      unknownNumberErrors(["99010", "nope"], new Map([["99010", 1]]))
    ).toEqual({
      "rows.1.articleNumber": "Diese Artikelnummer gibt es nicht.",
    });
  });
});
```

Errors use the original row index (empty rows are skipped but keep their position), so they land on the visible input.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/admin/accessory-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement schema and data access**

```ts
// lib/admin/accessory-schema.ts
import type { AccessoryItem } from "./accessories";
import type { FieldErrors } from "./form";

const ID = /^[1-9]\d{0,9}$/;
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export type AccessoryValues = {
  productId: string;
  rows: { articleNumber: string }[];
};

export function readAccessoryForm(formData: FormData): AccessoryValues {
  return {
    productId: str(formData.get("productId")),
    rows: formData
      .getAll("articleNumber")
      .map((v) => ({ articleNumber: str(v) })),
  };
}

// Numbers keep their original row index so errors land on the visible row.
export function parseAccessories(values: AccessoryValues):
  | {
      ok: true;
      value: { productId: number; numbers: string[]; rows: number[] };
    }
  | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!ID.test(values.productId)) errors.form = "Ungültiges Produkt.";
  const numbers: string[] = [];
  const rows: number[] = [];
  values.rows.forEach((row, i) => {
    const n = row.articleNumber.trim();
    if (n === "") return;
    if (n.length > 40)
      errors[`rows.${i}.articleNumber`] = "Höchstens 40 Zeichen.";
    else if (numbers.includes(n))
      errors[`rows.${i}.articleNumber`] =
        "Dieser Artikel steht schon in der Liste.";
    else {
      numbers.push(n);
      rows.push(i);
    }
  });
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: { productId: Number(values.productId), numbers, rows },
  };
}

export function unknownNumberErrors(
  numbers: string[],
  resolved: Map<string, number>,
  rows: number[] = numbers.map((_, i) => i)
): FieldErrors {
  const errors: FieldErrors = {};
  numbers.forEach((n, i) => {
    if (!resolved.has(n))
      errors[`rows.${rows[i] ?? i}.articleNumber`] =
        "Diese Artikelnummer gibt es nicht.";
  });
  return errors;
}

export function accessoryValuesFrom(
  productId: number,
  items: AccessoryItem[]
): AccessoryValues {
  return {
    productId: String(productId),
    rows: items.map((a) => ({ articleNumber: a.articleNumber })),
  };
}
```

```ts
// lib/admin/accessories.ts
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import { fromPg, STALE_SELECTION, type AdminError } from "./errors";

export type AccessoryItem = {
  articleNumber: string;
  articleName: string | null;
  productName: string;
};

export async function listAccessories(
  client: AdminClient,
  productId: number
): Promise<Result<AccessoryItem[], AdminError>> {
  const { data, error } = await client
    .from("product_accessory")
    .select(
      "sort_order, article(article_number, name, product!article_product_id_fkey(name))"
    )
    .eq("product_id", productId)
    .order("sort_order");
  if (error) return err(fromPg(error));
  return ok(
    data.map((r) => ({
      articleNumber: r.article.article_number,
      articleName: r.article.name,
      productName: r.article.product.name,
    }))
  );
}

export async function resolveArticleNumbers(
  client: AdminClient,
  numbers: string[]
): Promise<Result<Map<string, number>, AdminError>> {
  if (numbers.length === 0) return ok(new Map());
  const { data, error } = await client
    .from("article")
    .select("id, article_number")
    .in("article_number", numbers);
  if (error) return err(fromPg(error));
  return ok(new Map(data.map((a) => [a.article_number, a.id])));
}

export async function setAccessories(
  client: AdminClient,
  productId: number,
  articleIds: number[]
): Promise<Result<null, AdminError>> {
  const { error } = await client.rpc("admin_set_product_accessories", {
    p_product_id: productId,
    payload: articleIds.map((id) => ({ article_id: id })),
  });
  // 23503: an article was deleted between resolving and saving.
  if (error) return err(fromPg(error, {}, STALE_SELECTION));
  return ok(null);
}
```

If the `article` embed comes back typed as nullable, guard it (`r.article === null` → skip).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run lib/admin/accessory-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the action**

```ts
// app/admin/(protected)/produkte/accessory-actions.ts
"use server";

import { redirect } from "next/navigation";
import { resolveArticleNumbers, setAccessories } from "@/lib/admin/accessories";
import {
  parseAccessories,
  readAccessoryForm,
  unknownNumberErrors,
  type AccessoryValues,
} from "@/lib/admin/accessory-schema";
import { LOGIN_PATH } from "@/lib/admin/auth";
import { errorState, type FormState } from "@/lib/admin/form";
import { writeDeps } from "@/lib/admin/server";
import { adminWrite } from "@/lib/admin/write";
import { createSessionSupabase } from "@/lib/supabase/session";

export async function saveAccessoriesAction(
  _prev: FormState<AccessoryValues>,
  formData: FormData
): Promise<FormState<AccessoryValues>> {
  const values = readAccessoryForm(formData);
  const parsed = parseAccessories(values);
  if (!parsed.ok) {
    if (parsed.fieldErrors.form)
      return {
        status: "error",
        values,
        fieldErrors: {},
        formError: "Ungültige Anfrage.",
      };
    return {
      status: "error",
      values,
      fieldErrors: parsed.fieldErrors,
      formError: null,
    };
  }
  const { productId, numbers, rows } = parsed.value;
  const client = await createSessionSupabase();
  // Read-only lookup first; only the save goes through adminWrite, so an
  // unknown number neither writes nor revalidates. RLS limits what a
  // non-admin could look up to published articles anyway.
  const resolved = await resolveArticleNumbers(client, numbers);
  if (!resolved.ok) return errorState(values, resolved.error);
  const unknown = unknownNumberErrors(numbers, resolved.value, rows);
  if (Object.keys(unknown).length > 0)
    return { status: "error", values, fieldErrors: unknown, formError: null };
  const ids = numbers.flatMap((n) => {
    const id = resolved.value.get(n);
    return id === undefined ? [] : [id];
  });
  const outcome = await adminWrite(
    writeDeps(client),
    "[admin] save accessories",
    () => setAccessories(client, productId, ids)
  );
  if (outcome.kind === "anonymous") redirect(LOGIN_PATH);
  if (!outcome.result.ok) return errorState(values, outcome.result.error);
  return { status: "saved", values, fieldErrors: {}, formError: null };
}
```

- [ ] **Step 6: Write the failing component test**

```tsx
// components/admin/accessory-section.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessorySection } from "./accessory-section";

describe("AccessorySection (SC-9)", () => {
  it("adds, moves and removes rows", () => {
    render(
      <AccessorySection
        productId={3}
        items={[
          {
            articleNumber: "99010",
            articleName: "Testkeil 8 mm",
            productName: "Testkeil",
          },
        ]}
        action={vi.fn(async (prev: never) => prev)}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Zubehör hinzufügen" }));
    const inputs = () =>
      screen.getAllByLabelText("Artikelnummer") as HTMLInputElement[];
    fireEvent.change(inputs()[1]!, { target: { value: "99211/80" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Zubehör 2 nach oben" })
    );
    expect(inputs().map((i) => i.value)).toEqual(["99211/80", "99010"]);
    fireEvent.click(
      screen.getByRole("button", { name: "Zubehör 1 entfernen" })
    );
    expect(inputs().map((i) => i.value)).toEqual(["99010"]);
    expect(screen.getByText(/Testkeil 8 mm/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Implement `accessory-section.tsx`**

```tsx
// components/admin/accessory-section.tsx
"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessoryItem } from "@/lib/admin/accessories";
import {
  accessoryValuesFrom,
  type AccessoryValues,
} from "@/lib/admin/accessory-schema";
import { idleState, type FormState } from "@/lib/admin/form";
import { describedBy, Field } from "./field";

type SaveAction = (
  prev: FormState<AccessoryValues>,
  formData: FormData
) => Promise<FormState<AccessoryValues>>;

export function AccessorySection(props: {
  productId: number;
  items: AccessoryItem[];
  action: SaveAction;
}) {
  const { productId, items } = props;
  const run: SaveAction = async (prev, formData) => {
    const next = await props.action(prev, formData);
    if (next.status === "saved") toast.success("Zubehör gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(
    run,
    idleState(accessoryValuesFrom(productId, items))
  );
  const [rows, setRows] = useState(state.values.rows);
  const [syncedState, setSyncedState] = useState(state);
  if (syncedState !== state) {
    setSyncedState(state);
    setRows(state.values.rows);
  }
  const names = new Map(
    items.map((a) => [a.articleNumber, a.articleName ?? a.productName])
  );
  const e = state.fieldErrors;
  const move = (from: number, to: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(from, 1);
      if (row) next.splice(to, 0, row);
      return next;
    });
  return (
    <section aria-labelledby="accessories-heading" className="mt-10 grid gap-4">
      <h2 id="accessories-heading" className="text-xl font-semibold">
        Zubehör
      </h2>
      <p className="text-sm text-muted-foreground">
        Artikel anderer Produkte, die auf der Produktseite als „Passendes
        Zubehör“ erscheinen.
      </p>
      <form action={formAction} className="grid gap-3" noValidate>
        <input type="hidden" name="productId" value={productId} />
        {rows.map((row, i) => {
          const id = `accessory-${i}`;
          const error = e[`rows.${i}.articleNumber`];
          const label = `Zubehör ${i + 1}`;
          const name = names.get(row.articleNumber.trim());
          return (
            <fieldset
              key={i}
              className="grid grid-cols-[1fr_auto] items-end gap-2"
            >
              <legend className="sr-only">{label}</legend>
              <Field id={id} label="Artikelnummer" error={error} hint={name}>
                <Input
                  id={id}
                  name="articleNumber"
                  value={row.articleNumber}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy(id, error, name)}
                  onChange={(ev) =>
                    setRows((rs) =>
                      rs.map((r, j) =>
                        j === i ? { articleNumber: ev.target.value } : r
                      )
                    )
                  }
                />
              </Field>
              <div className="flex gap-2 pb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${label} nach oben`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${label} nach unten`}
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`${label} entfernen`}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                >
                  Entfernen
                </Button>
              </div>
            </fieldset>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => setRows((rs) => [...rs, { articleNumber: "" }])}
        >
          Zubehör hinzufügen
        </Button>
        {state.formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
          >
            {state.formError}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="justify-self-start">
          Zubehör speichern
        </Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 8: Integration test against the local stack**

```ts
// tests/integration/admin-accessories.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  listAccessories,
  resolveArticleNumbers,
  setAccessories,
} from "@/lib/admin/accessories";
import { deleteUser, sessionClient } from "./admin-session";

const ADMIN = "int-admin-accessories@example.test";
let admin: SupabaseClient<Database>;

beforeAll(async () => {
  admin = await sessionClient(ADMIN, true);
});
afterAll(async () => {
  // Restore the seed: product 3 has article 2 as its only accessory.
  await setAccessories(admin, 3, [2]);
  await deleteUser(ADMIN);
});

describe("accessories (SC-9)", () => {
  it("resolves numbers exactly and saves the set in order", async () => {
    const resolved = await resolveArticleNumbers(admin, [
      "99211/80",
      "99010",
      "nope",
    ]);
    expect(resolved.ok && [...resolved.value.keys()].sort()).toEqual([
      "99010",
      "99211/80",
    ]);
    if (!resolved.ok) return;
    const saved = await setAccessories(admin, 3, [
      resolved.value.get("99211/80")!,
      resolved.value.get("99010")!,
    ]);
    expect(saved.ok).toBe(true);
    const list = await listAccessories(admin, 3);
    expect(list.ok && list.value.map((a) => a.articleNumber)).toEqual([
      "99211/80",
      "99010",
    ]);
  });

  it("maps an own article to the function message", async () => {
    const result = await setAccessories(admin, 3, [4]);
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "invalid",
        message: "Artikel des eigenen Produkts sind kein Zubehör.",
      },
    });
  });
});
```

- [ ] **Step 9: Wire the page**

In `[id]/page.tsx` add `listAccessories(client, id)` to `loadEditor`'s `Promise.all` and render after the image section:

```tsx
<AccessorySection
  key={accessories.map((a) => a.articleNumber).join("|")}
  productId={product.id}
  items={accessories}
  action={saveAccessoriesAction}
/>
```

- [ ] **Step 10: Run checks**

Run: `pnpm vitest run lib/admin components/admin && pnpm typecheck && pnpm lint && pnpm db:test`
Expected: PASS, exit 0.

- [ ] **Step 11: Commit**

```bash
git add lib/admin/accessories.ts lib/admin/accessory-schema.ts lib/admin/accessory-schema.test.ts components/admin/accessory-section.tsx components/admin/accessory-section.test.tsx "app/admin/(protected)/produkte/accessory-actions.ts" "app/admin/(protected)/produkte/[id]/page.tsx" tests/integration/admin-accessories.test.ts
git commit -m "feat(admin): maintain accessories of a product"
```

---

### Task 6: Alt-text review hint

**Files:**

- Create: `lib/admin/alt-review.ts`
- Test: `lib/admin/alt-review.test.ts`, extend `lib/admin/filter.test.ts`, extend `tests/integration/admin-products.test.ts`
- Modify: `lib/admin/filter.ts`, `lib/admin/products.ts` (`listProducts`, `ProductListItem`), `components/admin/product-list.tsx`

**Interfaces:**

- Produces: `needsAltReview(productName: string, altTexts: readonly string[]): boolean`; `ProductFilter.altReview: boolean` (param `alt=pruefen`); `ProductListItem.altReview: boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/admin/alt-review.test.ts
import { describe, expect, it } from "vitest";
import { needsAltReview } from "./alt-review";

describe("needsAltReview (SC-8)", () => {
  it("matches an alt text equal to the name, ignoring case and outer spaces", () => {
    expect(needsAltReview("Testkeil", [" testkeil "])).toBe(true);
  });
  it("does not match other texts or products without images", () => {
    expect(needsAltReview("Testkeil", ["Testkeil, Seitenansicht"])).toBe(false);
    expect(needsAltReview("Testkeil", [])).toBe(false);
  });
});
```

Append to `lib/admin/filter.test.ts`:

```ts
it("reads the alt-text filter (SC-8)", () => {
  expect(parseFilter({ alt: "pruefen" }).altReview).toBe(true);
  expect(parseFilter({ alt: "x" }).altReview).toBe(false);
  expect(parseFilter({}).altReview).toBe(false);
});
```

Append to `tests/integration/admin-products.test.ts` inside the list describe (seed: media 2 of product 4 has alt text "Entwurfsteil" = its name; media 1 differs from its product name):

```ts
it("filters products whose alt text needs review (SC-8)", async () => {
  const result = await listProducts(admin, {
    categoryId: null,
    status: null,
    q: null,
    altReview: true,
  });
  expect(result.ok && result.value.map((p) => p.slug)).toEqual([
    "entwurfsteil",
  ]);
});
```

Add `altReview: false` to every existing `listProducts(…, { … })` call in that file.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run lib/admin/alt-review.test.ts lib/admin/filter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/admin/alt-review.ts
// D10: the import set every alt text to the product name.
export function needsAltReview(
  productName: string,
  altTexts: readonly string[]
): boolean {
  const name = productName.trim().toLocaleLowerCase("de");
  return altTexts.some((alt) => alt.trim().toLocaleLowerCase("de") === name);
}
```

In `lib/admin/filter.ts`: add `altReview: boolean` to `ProductFilter`, and in `parseFilter` return `altReview: first(params.alt) === "pruefen"`.

In `lib/admin/products.ts`:

- `ProductListItem` gets `altReview: boolean`;
- the list select adds `, product_media(media(alt_text))`;
- map `altReview: needsAltReview(p.name, p.product_media.map((m) => m.media.alt_text))`;
- after mapping, `return ok(filter.altReview ? items.filter((i) => i.altReview) : items)`.

In `components/admin/product-list.tsx`:

- add a checkbox to the filter form:

```tsx
<div className="flex items-center gap-2 pb-2">
  <input
    id="filter-alt"
    type="checkbox"
    name="alt"
    value="pruefen"
    defaultChecked={filter.altReview}
  />
  <Label htmlFor="filter-alt">Nur „Alt-Text prüfen“</Label>
</div>
```

- in the name cell, after the link: `{item.altReview ? <Badge variant="outline" className="ml-2">Alt-Text prüfen</Badge> : null}` (import `Badge` from `@/components/ui/badge`).

- [ ] **Step 4: Run tests and checks**

Run: `pnpm vitest run lib/admin && pnpm typecheck && pnpm lint && pnpm db:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/alt-review.ts lib/admin/alt-review.test.ts lib/admin/filter.ts lib/admin/filter.test.ts lib/admin/products.ts components/admin/product-list.tsx tests/integration/admin-products.test.ts
git commit -m "feat(admin): flag products whose alt texts need review"
```

---

### Task 7: Categories

**Files:**

- Create: `lib/admin/category-schema.ts`, `lib/admin/categories.ts`
- Create: `app/admin/(protected)/kategorien/page.tsx`, `kategorien/neu/page.tsx`, `kategorien/[id]/page.tsx`, `kategorien/actions.ts`
- Create: `components/admin/category-form.tsx`, `components/admin/delete-record-button.tsx`
- Modify: `lib/admin/form.ts` (`errorState` takes optional conflict messages)
- Test: `lib/admin/category-schema.test.ts`, `components/admin/category-form.test.tsx`, `tests/integration/admin-categories.test.ts`

**Interfaces:**

- Consumes: `slugify`, `SLUG_PATTERN` (`lib/catalog/slug.ts`); `optionalText`, `requiredText`, `integer` (`lib/admin/schemas.ts`); `AttributeOption`, `loadEditorOptions` (`lib/admin/products.ts`); `CATEGORY_IN_USE`, `INVALID_CATEGORY_DATA` (Task 1).
- Produces:
  - `errorState<V>(values: V, error: AdminError, messages: Record<string, string> = CONFLICT_MESSAGES): FormState<V>`
  - `CATEGORY_FIELDS`, `type CategoryValues = Record<CategoryField, string> & { attributes: { attributeId: string; sortOrder: string }[] }`, `emptyCategoryValues()`, `readCategoryForm(formData)`, `categorySchema`, `type CategoryInput`, `withDefaultCategorySlug(values)`, `CATEGORY_CONFLICTS = { slug: "Dieser Slug ist schon vergeben." }`
  - `type CategoryListItem = { id: number; name: string; slug: string; sortOrder: number; productCount: number }`
  - `listCategories(client)`, `getCategory(client, id): Result<{ id: number; productCount: number; values: CategoryValues }, AdminError>`, `saveCategory(client, id: number | null, input: CategoryInput): Result<{ id: number }, AdminError>`, `deleteCategory(client, id): Result<null, AdminError>`
  - Actions: `saveCategoryAction(prev: FormState<CategoryValues>, formData)`, `deleteCategoryAction(prev: FormState<null>, formData)`
  - `<DeleteRecordButton action id title description buttonLabel />` (generic, reused in Task 8)

- [ ] **Step 1: Write the failing schema tests**

```ts
// lib/admin/category-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  categorySchema,
  emptyCategoryValues,
  readCategoryForm,
  withDefaultCategorySlug,
} from "./category-schema";

const valid = {
  ...emptyCategoryValues(),
  name: "Neue Kategorie",
  slug: "neue-kategorie",
};

describe("categorySchema (SC-10)", () => {
  it("accepts valid input and parses attributes", () => {
    const parsed = categorySchema.parse({
      ...valid,
      attributes: [{ attributeId: "2", sortOrder: "1" }],
    });
    expect(parsed).toMatchObject({
      name: "Neue Kategorie",
      slug: "neue-kategorie",
      introText: "",
      seoTitle: null,
      sortOrder: 0,
      attributes: [{ attributeId: 2, sortOrder: 1 }],
    });
  });
  it("rejects empty name, invalid slug and long SEO title with German messages", () => {
    const result = categorySchema.safeParse({
      ...valid,
      name: " ",
      slug: "Groß",
      seoTitle: "x".repeat(71),
    });
    expect(result.success).toBe(false);
    const messages = result.success
      ? []
      : result.error.issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Bitte einen Namen eingeben.",
        "Nur Kleinbuchstaben, Ziffern und Bindestriche.",
        "Höchstens 70 Zeichen.",
      ])
    );
  });
  it("fills the slug from the name", () => {
    expect(
      withDefaultCategorySlug({ ...valid, slug: "", name: "Möbel & Türen" })
        .slug
    ).toBe("moebel-tueren");
  });
});

describe("readCategoryForm", () => {
  it("reads checked attributes with their sort order", () => {
    const fd = new FormData();
    fd.set("name", "X");
    fd.append("attributeId", "1");
    fd.append("attributeId", "3");
    fd.set("attrSort-1", "0");
    fd.set("attrSort-3", "2");
    fd.set("attrSort-2", "5"); // unchecked: ignored
    expect(readCategoryForm(fd).attributes).toEqual([
      { attributeId: "1", sortOrder: "0" },
      { attributeId: "3", sortOrder: "2" },
    ]);
  });
});
```

Check `slugify("Möbel & Türen")` output in `lib/catalog/slug.test.ts` and use the real value in the assertion.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/admin/category-schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the schema**

```ts
// lib/admin/category-schema.ts
import { z } from "zod";
import { SLUG_PATTERN, slugify } from "@/lib/catalog/slug";
import { integer, optionalText, requiredText } from "./schemas";

export const CATEGORY_FIELDS = [
  "name",
  "slug",
  "introText",
  "seoTitle",
  "seoDescription",
  "sortOrder",
] as const;
type CategoryField = (typeof CATEGORY_FIELDS)[number];
export type CategoryValues = Record<CategoryField, string> & {
  attributes: { attributeId: string; sortOrder: string }[];
};

export const CATEGORY_CONFLICTS: Record<string, string> = {
  slug: "Dieser Slug ist schon vergeben.",
};

export const emptyCategoryValues = (): CategoryValues => ({
  name: "",
  slug: "",
  introText: "",
  seoTitle: "",
  seoDescription: "",
  sortOrder: "0",
  attributes: [],
});

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export function readCategoryForm(formData: FormData): CategoryValues {
  const values = emptyCategoryValues();
  for (const field of CATEGORY_FIELDS) values[field] = str(formData.get(field));
  values.attributes = formData.getAll("attributeId").map((v) => {
    const attributeId = str(v);
    return {
      attributeId,
      sortOrder: str(formData.get(`attrSort-${attributeId}`)) || "0",
    };
  });
  return values;
}

export const categorySchema = z.object({
  name: requiredText(120, "Bitte einen Namen eingeben."),
  slug: z
    .string()
    .trim()
    .max(120, "Höchstens 120 Zeichen.")
    .regex(SLUG_PATTERN, "Nur Kleinbuchstaben, Ziffern und Bindestriche."),
  introText: z.string().trim().max(10_000, "Höchstens 10000 Zeichen."),
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
  sortOrder: integer,
  attributes: z
    .array(
      z.object({
        attributeId: z
          .string()
          .regex(/^[1-9]\d{0,9}$/, "Ungültige Auswahl.")
          .transform(Number),
        sortOrder: integer,
      })
    )
    .refine(
      (rows) => new Set(rows.map((r) => r.attributeId)).size === rows.length,
      "Ungültige Auswahl."
    ),
});
export type CategoryInput = z.output<typeof categorySchema>;

export function withDefaultCategorySlug(
  values: CategoryValues
): CategoryValues {
  return values.slug.trim() === ""
    ? { ...values, slug: slugify(values.name) }
    : values;
}
```

- [ ] **Step 4: Extend `errorState`**

In `lib/admin/form.ts`:

```ts
export function errorState<V>(
  values: V,
  error: AdminError,
  messages: Record<string, string> = CONFLICT_MESSAGES
): FormState<V> {
  if (error.kind === "conflict")
    return {
      status: "error",
      values,
      fieldErrors: {
        [error.field]: messages[error.field] ?? "Wert schon vergeben.",
      },
      formError: null,
    };
  return {
    status: "error",
    values,
    fieldErrors: {},
    formError: formErrorFor(error),
  };
}
```

- [ ] **Step 5: Implement data access**

```ts
// lib/admin/categories.ts
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import type { CategoryInput, CategoryValues } from "./category-schema";
import { CATEGORY_IN_USE, fromPg, type AdminError } from "./errors";

export type CategoryListItem = {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  productCount: number;
};

const countOf = (embed: unknown): number => {
  if (!Array.isArray(embed)) return 0;
  const row: unknown = embed[0];
  return typeof row === "object" &&
    row !== null &&
    "count" in row &&
    typeof row.count === "number"
    ? row.count
    : 0;
};

export async function listCategories(
  client: AdminClient
): Promise<Result<CategoryListItem[], AdminError>> {
  const { data, error } = await client
    .from("category")
    .select("id, name, slug, sort_order, product(count)")
    .order("sort_order")
    .order("name");
  if (error) return err(fromPg(error));
  return ok(
    data.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      sortOrder: c.sort_order,
      productCount: countOf(c.product),
    }))
  );
}

export async function getCategory(
  client: AdminClient,
  id: number
): Promise<
  Result<
    { id: number; productCount: number; values: CategoryValues },
    AdminError
  >
> {
  const { data, error } = await client
    .from("category")
    .select(
      "id, name, slug, intro_text, seo_title, seo_description, sort_order, product(count), category_attribute(attribute_id, sort_order)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return err(fromPg(error));
  if (data === null) return err({ kind: "not_found" });
  return ok({
    id: data.id,
    productCount: countOf(data.product),
    values: {
      name: data.name,
      slug: data.slug,
      introText: data.intro_text,
      seoTitle: data.seo_title ?? "",
      seoDescription: data.seo_description ?? "",
      sortOrder: String(data.sort_order),
      attributes: [...data.category_attribute]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((a) => ({
          attributeId: String(a.attribute_id),
          sortOrder: String(a.sort_order),
        })),
    },
  });
}

export async function saveCategory(
  client: AdminClient,
  id: number | null,
  input: CategoryInput
): Promise<Result<{ id: number }, AdminError>> {
  const { data, error } = await client.rpc("admin_save_category", {
    payload: {
      ...(id === null ? {} : { id }),
      name: input.name,
      slug: input.slug,
      intro_text: input.introText,
      seo_title: input.seoTitle,
      seo_description: input.seoDescription,
      sort_order: input.sortOrder,
      attributes: input.attributes.map((a) => ({
        attribute_id: a.attributeId,
        sort_order: a.sortOrder,
      })),
    },
  });
  if (error) return err(fromPg(error, { category_slug_key: "slug" }));
  return ok({ id: data });
}

export async function deleteCategory(
  client: AdminClient,
  id: number
): Promise<Result<null, AdminError>> {
  const { data, error } = await client
    .from("category")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return err(fromPg(error, {}, CATEGORY_IN_USE));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}
```

Check the real unique-constraint name with `\d public.category` (`supabase db` psql via `docker exec`) — expected `category_slug_key`.

- [ ] **Step 6: Integration test**

```ts
// tests/integration/admin-categories.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  deleteCategory,
  getCategory,
  saveCategory,
} from "@/lib/admin/categories";
import {
  categorySchema,
  emptyCategoryValues,
} from "@/lib/admin/category-schema";
import { deleteUser, sessionClient } from "./admin-session";

const ADMIN = "int-admin-categories@example.test";
let admin: SupabaseClient<Database>;
const service = () =>
  createClient<Database>(
    process.env.IMPORT_SUPABASE_URL ?? "",
    process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

beforeAll(async () => {
  await service().from("category").delete().like("slug", "int-%");
  admin = await sessionClient(ADMIN, true);
});
afterAll(async () => {
  await service().from("category").delete().like("slug", "int-%");
  await deleteUser(ADMIN);
});

describe("categories (SC-10)", () => {
  it("creates, reads and deletes an empty category", async () => {
    const input = categorySchema.parse({
      ...emptyCategoryValues(),
      name: "Int Kategorie",
      slug: "int-kategorie",
      attributes: [{ attributeId: "1", sortOrder: "0" }],
    });
    const saved = await saveCategory(admin, null, input);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const read = await getCategory(admin, saved.value.id);
    expect(read.ok && read.value.values.attributes).toEqual([
      { attributeId: "1", sortOrder: "0" },
    ]);
    expect((await deleteCategory(admin, saved.value.id)).ok).toBe(true);
  });

  it("maps a taken slug and a used category", async () => {
    const input = categorySchema.parse({
      ...emptyCategoryValues(),
      name: "X",
      slug: "sanitaer",
    });
    expect(await saveCategory(admin, null, input)).toEqual({
      ok: false,
      error: { kind: "conflict", field: "slug" },
    });
    expect(await deleteCategory(admin, 1)).toEqual({
      ok: false,
      error: {
        kind: "invalid",
        message: "Die Kategorie enthält noch Produkte.",
      },
    });
  });
});
```

- [ ] **Step 7: Generic delete button**

```tsx
// components/admin/delete-record-button.tsx
"use client";

import { useActionState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { idleState, type FormState } from "@/lib/admin/form";

type Props = {
  action: (
    prev: FormState<null>,
    formData: FormData
  ) => Promise<FormState<null>>;
  id: number;
  title: string;
  description: string;
  buttonLabel: string;
};

// Master data deletion (D7, D8): confirmation, then the DB guard decides.
export function DeleteRecordButton({
  action,
  id,
  title,
  description,
  buttonLabel,
}: Props) {
  const [state, formAction, pending] = useActionState(action, idleState(null));
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {state.formError ? (
          <p role="alert" className="text-sm text-destructive">
            {state.formError}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="destructive" disabled={pending}>
              Endgültig löschen
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 8: Actions**

```ts
// app/admin/(protected)/kategorien/actions.ts
"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/admin/auth";
import { deleteCategory, saveCategory } from "@/lib/admin/categories";
import {
  CATEGORY_CONFLICTS,
  categorySchema,
  readCategoryForm,
  withDefaultCategorySlug,
  type CategoryValues,
} from "@/lib/admin/category-schema";
import { errorState, zodFieldErrors, type FormState } from "@/lib/admin/form";
import { writeDeps } from "@/lib/admin/server";
import { adminWrite } from "@/lib/admin/write";
import { createSessionSupabase } from "@/lib/supabase/session";

const ID = /^[1-9]\d{0,9}$/;

export async function saveCategoryAction(
  _prev: FormState<CategoryValues>,
  formData: FormData
): Promise<FormState<CategoryValues>> {
  const values = withDefaultCategorySlug(readCategoryForm(formData));
  const parsed = categorySchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      values,
      fieldErrors: zodFieldErrors(parsed.error),
      formError: null,
    };
  const rawId = formData.get("id");
  const id = typeof rawId === "string" && ID.test(rawId) ? Number(rawId) : null;
  if (id === null && typeof rawId === "string" && rawId !== "")
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  const client = await createSessionSupabase();
  const outcome = await adminWrite(
    writeDeps(client),
    "[admin] save category",
    () => saveCategory(client, id, parsed.data)
  );
  if (outcome.kind === "anonymous") redirect(LOGIN_PATH);
  if (!outcome.result.ok)
    return errorState(values, outcome.result.error, CATEGORY_CONFLICTS);
  if (id === null) redirect(`/admin/kategorien/${outcome.result.value.id}`);
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

export async function deleteCategoryAction(
  _prev: FormState<null>,
  formData: FormData
): Promise<FormState<null>> {
  const raw = formData.get("id");
  if (typeof raw !== "string" || !ID.test(raw))
    return {
      status: "error",
      values: null,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  const client = await createSessionSupabase();
  const outcome = await adminWrite(
    writeDeps(client),
    "[admin] delete category",
    () => deleteCategory(client, Number(raw))
  );
  if (outcome.kind === "anonymous") redirect(LOGIN_PATH);
  if (!outcome.result.ok) return errorState(null, outcome.result.error);
  redirect("/admin/kategorien");
}
```

A zod issue on `attributes` (tampered checkbox value) yields a field error keyed `attributes…`; render it as a form-level alert in the form.

- [ ] **Step 9: Write the failing form test**

```tsx
// components/admin/category-form.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyCategoryValues } from "@/lib/admin/category-schema";
import { CategoryForm } from "./category-form";

const attributes = [
  {
    id: 1,
    key: "height",
    label: "Höhe",
    unit: "mm",
    dataType: "decimal" as const,
    sortOrder: 0,
  },
  {
    id: 3,
    key: "surface",
    label: "Oberfläche",
    unit: null,
    dataType: "text" as const,
    sortOrder: 2,
  },
];

describe("CategoryForm (SC-10)", () => {
  it("renders one checkbox per attribute with the assigned ones checked", () => {
    render(
      <CategoryForm
        action={vi.fn(async (prev: never) => prev)}
        initial={{
          ...emptyCategoryValues(),
          name: "X",
          slug: "x",
          attributes: [{ attributeId: "3", sortOrder: "0" }],
        }}
        attributes={attributes}
        categoryId={5}
      />
    );
    expect(
      screen.getByRole("checkbox", { name: "Höhe (mm)" })
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Oberfläche" })).toBeChecked();
    expect(
      screen.getByText(/ändert die URLs der Kategorie und aller ihrer Produkte/)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Implement `category-form.tsx`**

Follow `components/admin/product-form.tsx` for field markup, `useActionState`, toast ("Gespeichert.") and slug auto-fill on create. Required elements:

```tsx
// components/admin/category-form.tsx
"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryValues } from "@/lib/admin/category-schema";
import { idleState, type FormState } from "@/lib/admin/form";
import type { AttributeOption } from "@/lib/admin/products";
import { slugify } from "@/lib/catalog/slug";
import { describedBy, Field } from "./field";

type SaveAction = (
  prev: FormState<CategoryValues>,
  formData: FormData
) => Promise<FormState<CategoryValues>>;

type Props = {
  action: SaveAction;
  initial: CategoryValues;
  attributes: AttributeOption[];
  categoryId: number | null;
};

export function CategoryForm({
  action,
  initial,
  attributes,
  categoryId,
}: Props) {
  const run: SaveAction = async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.status === "saved") toast.success("Gespeichert.");
    return next;
  };
  const [state, formAction, pending] = useActionState(run, idleState(initial));
  const v = state.values;
  const e = state.fieldErrors;
  const [slug, setSlug] = useState(v.slug);
  const [slugTouched, setSlugTouched] = useState(categoryId !== null);
  const assigned = new Map(
    v.attributes.map((a) => [a.attributeId, a.sortOrder])
  );
  const attributeError = Object.entries(e).find(([k]) =>
    k.startsWith("attributes")
  )?.[1];
  const text = (name: keyof CategoryValues, label: string, max?: number) => (
    <Field id={name} label={label} error={e[name]}>
      <Input
        id={name}
        name={name}
        defaultValue={v[name] as string}
        maxLength={max}
        aria-invalid={Boolean(e[name])}
        aria-describedby={describedBy(name, e[name])}
      />
    </Field>
  );
  return (
    <form action={formAction} className="mt-6 grid max-w-3xl gap-4" noValidate>
      {categoryId !== null ? (
        <input type="hidden" name="id" value={categoryId} />
      ) : null}
      <Field id="name" label="Name" error={e.name}>
        <Input
          id="name"
          name="name"
          defaultValue={v.name}
          aria-invalid={Boolean(e.name)}
          aria-describedby={describedBy("name", e.name)}
          onChange={(ev) => {
            if (!slugTouched) setSlug(slugify(ev.target.value));
          }}
        />
      </Field>
      <Field
        id="slug"
        label="Slug"
        error={e.slug}
        hint={
          categoryId !== null
            ? "Eine Änderung ändert die URLs der Kategorie und aller ihrer Produkte."
            : undefined
        }
      >
        <Input
          id="slug"
          name="slug"
          value={slug}
          aria-invalid={Boolean(e.slug)}
          aria-describedby={describedBy(
            "slug",
            e.slug,
            categoryId !== null ? "hint" : undefined
          )}
          onChange={(ev) => {
            setSlugTouched(true);
            setSlug(ev.target.value);
          }}
        />
      </Field>
      <Field id="introText" label="Intro-Text (Markdown)" error={e.introText}>
        <Textarea
          id="introText"
          name="introText"
          rows={6}
          defaultValue={v.introText}
          aria-invalid={Boolean(e.introText)}
          aria-describedby={describedBy("introText", e.introText)}
        />
      </Field>
      {text("seoTitle", "SEO-Titel", 70)}
      {text("seoDescription", "SEO-Beschreibung", 160)}
      {text("sortOrder", "Reihenfolge")}
      <fieldset className="grid gap-2 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">
          Attribute im Artikel-Dialog
        </legend>
        {attributes.map((a) => {
          const cid = `attr-${a.id}`;
          const sid = `attrSort-${a.id}`;
          const label = a.unit ? `${a.label} (${a.unit})` : a.label;
          return (
            <div
              key={a.id}
              className="grid grid-cols-[auto_1fr_8rem] items-center gap-3"
            >
              <input
                id={cid}
                type="checkbox"
                name="attributeId"
                value={a.id}
                defaultChecked={assigned.has(String(a.id))}
              />
              <label htmlFor={cid} className="text-sm">
                {label}
              </label>
              <Input
                id={sid}
                name={sid}
                aria-label={`Reihenfolge ${a.label}`}
                inputMode="numeric"
                defaultValue={assigned.get(String(a.id)) ?? String(a.sortOrder)}
              />
            </div>
          );
        })}
      </fieldset>
      {attributeError ? (
        <p role="alert" className="text-sm text-destructive">
          {attributeError}
        </p>
      ) : null}
      {state.formError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
        >
          {state.formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {categoryId === null ? "Kategorie anlegen" : "Speichern"}
      </Button>
    </form>
  );
}
```

Adjust the test's hint matcher to the exact hint text above ("Eine Änderung ändert die URLs der Kategorie und aller ihrer Produkte.").

- [ ] **Step 11: Pages**

- `kategorien/page.tsx`: server component; `listCategories` via `unwrapAdmin`; heading "Kategorien"; link "Kategorie anlegen" → `/admin/kategorien/neu`; shadcn `Table` with columns Name (link to `/admin/kategorien/{id}`), Slug, Produkte, Reihenfolge. `export const metadata = { title: "Kategorien" }`.
- `kategorien/neu/page.tsx`: loads `loadEditorOptions(client)` for `attributes`; renders `<CategoryForm action={saveCategoryAction} initial={emptyCategoryValues()} attributes={options.attributes} categoryId={null} />`.
- `kategorien/[id]/page.tsx`: validates id with `/^[1-9]\d{0,9}$/` (else `notFound()`), loads `getCategory` + options, renders the form and, only when `productCount === 0`, `<DeleteRecordButton action={deleteCategoryAction} id={id} title="Kategorie löschen?" description="Die Kategorie wird endgültig gelöscht." buttonLabel="Kategorie löschen" />`; otherwise a muted note "Löschen ist nur ohne Produkte möglich (N Produkte)."

All pages live under `(protected)`, so the layout's `checkAdmin()` applies.

- [ ] **Step 12: Run checks**

Run: `pnpm vitest run lib/admin components/admin && pnpm typecheck && pnpm lint && pnpm db:test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add lib/admin/category-schema.ts lib/admin/category-schema.test.ts lib/admin/categories.ts lib/admin/form.ts components/admin/category-form.tsx components/admin/category-form.test.tsx components/admin/delete-record-button.tsx "app/admin/(protected)/kategorien" tests/integration/admin-categories.test.ts
git commit -m "feat(admin): maintain categories and their attributes"
```

---

### Task 8: Colours, materials and admin navigation

**Files:**

- Create: `lib/admin/master-schema.ts`, `lib/admin/master-data.ts`
- Create: `app/admin/(protected)/farben/{page.tsx,actions.ts}`, `app/admin/(protected)/materialien/{page.tsx,actions.ts}`
- Create: `components/admin/color-dialog.tsx`, `components/admin/material-dialog.tsx`
- Modify: `components/admin/admin-header.tsx`
- Test: `lib/admin/master-schema.test.ts`, `components/admin/admin-header.test.tsx`, `tests/integration/admin-master-data.test.ts`

**Interfaces:**

- Consumes: `requiredText`, `optionalText` (`lib/admin/schemas.ts`); `COLOR_IN_USE`, `MATERIAL_IN_USE`; `errorState` with messages (Task 7); `DeleteRecordButton` (Task 7).
- Produces:
  - `COLOR_FIELDS = ["name", "ralReference", "hexCode", "family"]`, `type ColorMasterValues`, `colorSchema`, `emptyColorValues()`
  - `MATERIAL_FIELDS = ["code", "name"]`, `type MaterialValues`, `materialSchema`, `emptyMaterialValues()`, `MATERIAL_CONFLICTS = { code: "Dieses Kürzel gibt es schon." }`
  - `type ColorListItem = { id; name; ralReference: string | null; hexCode; family; productCount }`, `listColors`, `saveColor(client, id | null, input)`, `deleteColor(client, id)`
  - `type MaterialListItem = { id; code; name; productCount; articleCount }`, `listMaterials`, `saveMaterial`, `deleteMaterial`
  - Actions: `saveColorAction`, `deleteColorAction`, `saveMaterialAction`, `deleteMaterialAction`

- [ ] **Step 1: Write the failing schema tests**

```ts
// lib/admin/master-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  colorSchema,
  emptyColorValues,
  emptyMaterialValues,
  materialSchema,
} from "./master-schema";

describe("colorSchema (SC-11, Review Focus 3)", () => {
  const valid = {
    ...emptyColorValues(),
    name: "weiß",
    hexCode: "#F4F4F4",
    family: "weiß",
  };
  it("accepts upper- and lower-case hex codes as typed", () => {
    expect(colorSchema.parse(valid).hexCode).toBe("#F4F4F4");
    expect(colorSchema.parse({ ...valid, hexCode: "#a1b2c3" }).hexCode).toBe(
      "#a1b2c3"
    );
  });
  it.each(["#abc", "a1b2c3", "#GGGGGG", ""])("rejects %s", (hexCode) => {
    const r = colorSchema.safeParse({ ...valid, hexCode });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0]?.message).toBe(
      "Bitte einen Farbcode wie #A1B2C3 eingeben."
    );
  });
  it("rejects an empty name and family; RAL is optional", () => {
    const r = colorSchema.safeParse({ ...valid, name: " ", family: "" });
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toEqual([
      "Bitte einen Namen eingeben.",
      "Bitte eine Farbfamilie eingeben.",
    ]);
    expect(colorSchema.parse(valid).ralReference).toBeNull();
  });
});

describe("materialSchema (SC-11)", () => {
  it("rejects an empty code", () => {
    const r = materialSchema.safeParse({
      ...emptyMaterialValues(),
      name: "Polyamid",
    });
    expect(r.success ? "" : r.error.issues[0]?.message).toBe(
      "Bitte ein Kürzel eingeben."
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/admin/master-schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schemas**

```ts
// lib/admin/master-schema.ts
import { z } from "zod";
import { optionalText, requiredText } from "./schemas";

export const COLOR_FIELDS = [
  "name",
  "ralReference",
  "hexCode",
  "family",
] as const;
export type ColorMasterValues = Record<(typeof COLOR_FIELDS)[number], string>;
export const emptyColorValues = (): ColorMasterValues => ({
  name: "",
  ralReference: "",
  hexCode: "#",
  family: "",
});

export const colorSchema = z.object({
  name: requiredText(60, "Bitte einen Namen eingeben."),
  ralReference: optionalText(60),
  hexCode: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Bitte einen Farbcode wie #A1B2C3 eingeben."),
  family: requiredText(40, "Bitte eine Farbfamilie eingeben."),
});
export type ColorMasterInput = z.output<typeof colorSchema>;

export const MATERIAL_FIELDS = ["code", "name"] as const;
export type MaterialValues = Record<(typeof MATERIAL_FIELDS)[number], string>;
export const emptyMaterialValues = (): MaterialValues => ({
  code: "",
  name: "",
});

export const materialSchema = z.object({
  code: requiredText(20, "Bitte ein Kürzel eingeben."),
  name: requiredText(120, "Bitte einen Namen eingeben."),
});
export type MaterialInput = z.output<typeof materialSchema>;

export const MATERIAL_CONFLICTS: Record<string, string> = {
  code: "Dieses Kürzel gibt es schon.",
};
```

`emptyColorValues().hexCode` is `"#"` as an input aid; the regex rejects it, so the expectation in Step 1 (`""` rejected) still holds.

- [ ] **Step 4: Implement data access**

```ts
// lib/admin/master-data.ts
import { err, ok, type Result } from "@/lib/result";
import type { AdminClient } from "@/lib/supabase/session";
import {
  COLOR_IN_USE,
  fromPg,
  MATERIAL_IN_USE,
  type AdminError,
} from "./errors";
import type { ColorMasterInput, MaterialInput } from "./master-schema";

const countOf = (embed: unknown): number => {
  if (!Array.isArray(embed)) return 0;
  const row: unknown = embed[0];
  return typeof row === "object" &&
    row !== null &&
    "count" in row &&
    typeof row.count === "number"
    ? row.count
    : 0;
};

export type ColorListItem = {
  id: number;
  name: string;
  ralReference: string | null;
  hexCode: string;
  family: string;
  productCount: number;
};

export async function listColors(
  client: AdminClient
): Promise<Result<ColorListItem[], AdminError>> {
  const { data, error } = await client
    .from("color")
    .select("id, name, ral_reference, hex_code, family, product_color(count)")
    .order("family")
    .order("name");
  if (error) return err(fromPg(error));
  return ok(
    data.map((c) => ({
      id: c.id,
      name: c.name,
      ralReference: c.ral_reference,
      hexCode: c.hex_code,
      family: c.family,
      productCount: countOf(c.product_color),
    }))
  );
}

export async function saveColor(
  client: AdminClient,
  id: number | null,
  input: ColorMasterInput
): Promise<Result<null, AdminError>> {
  const row = {
    name: input.name,
    ral_reference: input.ralReference,
    hex_code: input.hexCode,
    family: input.family,
  };
  const { data, error } =
    id === null
      ? await client.from("color").insert(row).select("id")
      : await client.from("color").update(row).eq("id", id).select("id");
  if (error) return err(fromPg(error));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}

export async function deleteColor(
  client: AdminClient,
  id: number
): Promise<Result<null, AdminError>> {
  const { data, error } = await client
    .from("color")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return err(fromPg(error, {}, COLOR_IN_USE));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}

export type MaterialListItem = {
  id: number;
  code: string;
  name: string;
  productCount: number;
  articleCount: number;
};

export async function listMaterials(
  client: AdminClient
): Promise<Result<MaterialListItem[], AdminError>> {
  const { data, error } = await client
    .from("material")
    .select("id, code, name, product(count), article(count)")
    .order("code");
  if (error) return err(fromPg(error));
  return ok(
    data.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      productCount: countOf(m.product),
      articleCount: countOf(m.article),
    }))
  );
}

export async function saveMaterial(
  client: AdminClient,
  id: number | null,
  input: MaterialInput
): Promise<Result<null, AdminError>> {
  const row = { code: input.code, name: input.name };
  const { data, error } =
    id === null
      ? await client.from("material").insert(row).select("id")
      : await client.from("material").update(row).eq("id", id).select("id");
  if (error) return err(fromPg(error, { material_code_key: "code" }));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}

export async function deleteMaterial(
  client: AdminClient,
  id: number
): Promise<Result<null, AdminError>> {
  const { data, error } = await client
    .from("material")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return err(fromPg(error, {}, MATERIAL_IN_USE));
  if (data.length === 0) return err({ kind: "not_found" });
  return ok(null);
}
```

If PostgREST cannot disambiguate `product(count)`/`article(count)` from `material`, use the FK hint form (`product!product_material_id_fkey(count)`, `article!article_material_id_fkey(count)`).

`fromPg` maps `23514` (check constraint, e.g. hex code) to the attribute-type message; Zod rejects those values first, so this path is unreachable from the form.

- [ ] **Step 5: Integration test**

```ts
// tests/integration/admin-master-data.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  deleteColor,
  deleteMaterial,
  listColors,
  listMaterials,
  saveColor,
  saveMaterial,
} from "@/lib/admin/master-data";
import { colorSchema, materialSchema } from "@/lib/admin/master-schema";
import { deleteUser, sessionClient } from "./admin-session";

const ADMIN = "int-admin-master@example.test";
let admin: SupabaseClient<Database>;
const service = () =>
  createClient<Database>(
    process.env.IMPORT_SUPABASE_URL ?? "",
    process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
const cleanup = async () => {
  await service().from("color").delete().like("name", "Int %");
  await service().from("material").delete().like("code", "INT-%");
};

beforeAll(async () => {
  await cleanup();
  admin = await sessionClient(ADMIN, true);
});
afterAll(async () => {
  await cleanup();
  await deleteUser(ADMIN);
});

describe("colours and materials (SC-11)", () => {
  it("creates and deletes an unused colour; refuses a used one", async () => {
    const input = colorSchema.parse({
      name: "Int Rot",
      ralReference: "",
      hexCode: "#aa0000",
      family: "rot",
    });
    expect((await saveColor(admin, null, input)).ok).toBe(true);
    const list = await listColors(admin);
    const created = list.ok
      ? list.value.find((c) => c.name === "Int Rot")
      : undefined;
    expect(created?.productCount).toBe(0);
    expect((await deleteColor(admin, created!.id)).ok).toBe(true);
    expect(await deleteColor(admin, 1)).toEqual({
      ok: false,
      error: {
        kind: "invalid",
        message: "Die Farbe ist noch Produkten zugeordnet.",
      },
    });
  });

  it("maps a taken code and a used material", async () => {
    expect(
      await saveMaterial(
        admin,
        null,
        materialSchema.parse({ code: "POM", name: "Doppelt" })
      )
    ).toEqual({
      ok: false,
      error: { kind: "conflict", field: "code" },
    });
    expect(await deleteMaterial(admin, 1)).toEqual({
      ok: false,
      error: { kind: "invalid", message: "Das Material wird noch verwendet." },
    });
    const list = await listMaterials(admin);
    expect(
      list.ok && list.value.find((m) => m.code === "PA-6")?.productCount
    ).toBe(1);
  });
});
```

- [ ] **Step 6: Actions**

`app/admin/(protected)/farben/actions.ts` (materials analogous, with `materialSchema`, `saveMaterial`, `deleteMaterial`, `MATERIAL_CONFLICTS`, contexts `[admin] save material` / `[admin] delete material`, `MATERIAL_FIELDS`):

```ts
"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/admin/auth";
import type { AdminError } from "@/lib/admin/errors";
import {
  errorState,
  readFields,
  zodFieldErrors,
  type FormState,
} from "@/lib/admin/form";
import { deleteColor, saveColor } from "@/lib/admin/master-data";
import {
  COLOR_FIELDS,
  colorSchema,
  type ColorMasterValues,
} from "@/lib/admin/master-schema";
import { writeDeps } from "@/lib/admin/server";
import { adminWrite } from "@/lib/admin/write";
import type { Result } from "@/lib/result";
import {
  createSessionSupabase,
  type AdminClient,
} from "@/lib/supabase/session";

const ID = /^[1-9]\d{0,9}$/;
const idOf = (formData: FormData): number | null | "invalid" => {
  const raw = formData.get("id");
  if (raw === null || raw === "") return null;
  return typeof raw === "string" && ID.test(raw) ? Number(raw) : "invalid";
};

async function write<V>(
  values: V,
  context: string,
  run: (client: AdminClient) => Promise<Result<null, AdminError>>,
  messages?: Record<string, string>
): Promise<FormState<V>> {
  const client = await createSessionSupabase();
  const outcome = await adminWrite(writeDeps(client), context, () =>
    run(client)
  );
  if (outcome.kind === "anonymous") redirect(LOGIN_PATH);
  if (!outcome.result.ok)
    return errorState(values, outcome.result.error, messages);
  return { status: "saved", values, fieldErrors: {}, formError: null };
}

export async function saveColorAction(
  _prev: FormState<ColorMasterValues>,
  formData: FormData
): Promise<FormState<ColorMasterValues>> {
  const values = readFields(formData, COLOR_FIELDS);
  const id = idOf(formData);
  if (id === "invalid")
    return {
      status: "error",
      values,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  const parsed = colorSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      values,
      fieldErrors: zodFieldErrors(parsed.error),
      formError: null,
    };
  return write(values, "[admin] save colour", (c) =>
    saveColor(c, id, parsed.data)
  );
}

export async function deleteColorAction(
  _prev: FormState<null>,
  formData: FormData
): Promise<FormState<null>> {
  const id = idOf(formData);
  if (typeof id !== "number")
    return {
      status: "error",
      values: null,
      fieldErrors: {},
      formError: "Ungültige Anfrage.",
    };
  return write(null, "[admin] delete colour", (c) => deleteColor(c, id));
}
```

- [ ] **Step 7: Dialogs**

`components/admin/color-dialog.tsx` follows `components/admin/article-dialog.tsx` (open state, remount on open via `openCount`, close and toast on `saved`):

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { idleState, type FormState } from "@/lib/admin/form";
import type { ColorListItem } from "@/lib/admin/master-data";
import {
  emptyColorValues,
  type ColorMasterValues,
} from "@/lib/admin/master-schema";
import { describedBy, Field } from "./field";

type SaveAction = (
  prev: FormState<ColorMasterValues>,
  formData: FormData
) => Promise<FormState<ColorMasterValues>>;
type Props = {
  action: SaveAction;
  color: ColorListItem | null;
  families: string[];
};

const valuesOf = (c: ColorListItem | null): ColorMasterValues =>
  c
    ? {
        name: c.name,
        ralReference: c.ralReference ?? "",
        hexCode: c.hexCode,
        family: c.family,
      }
    : emptyColorValues();

export function ColorDialog({ action, color, families }: Props) {
  const [open, setOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpenCount((c) => c + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={color ? "outline" : "default"}
          size={color ? "sm" : "default"}
        >
          {color ? "Bearbeiten" : "Farbe anlegen"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {color ? `Farbe „${color.name}“ bearbeiten` : "Farbe anlegen"}
          </DialogTitle>
          <DialogDescription>
            Der Farbcode bestimmt das Farbfeld auf der Produktseite.
          </DialogDescription>
        </DialogHeader>
        <ColorForm
          key={openCount}
          action={action}
          color={color}
          families={families}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ColorForm({
  action,
  color,
  families,
  onSaved,
}: Props & { onSaved: () => void }) {
  const [state, formAction, pending] = useActionState(
    action,
    idleState(valuesOf(color))
  );
  const [hex, setHex] = useState(state.values.hexCode);
  useEffect(() => {
    if (state.status === "saved") {
      toast.success("Farbe gespeichert.");
      onSaved();
    }
  }, [state, onSaved]);
  const e = state.fieldErrors;
  const valid = /^#[0-9A-Fa-f]{6}$/.test(hex);
  return (
    <form action={formAction} className="grid gap-3" noValidate>
      {color ? <input type="hidden" name="id" value={color.id} /> : null}
      <Field id="color-name" label="Name" error={e.name}>
        <Input
          id="color-name"
          name="name"
          defaultValue={state.values.name}
          aria-invalid={Boolean(e.name)}
          aria-describedby={describedBy("color-name", e.name)}
        />
      </Field>
      <Field
        id="color-ral"
        label="RAL-Hinweis (optional)"
        error={e.ralReference}
      >
        <Input
          id="color-ral"
          name="ralReference"
          defaultValue={state.values.ralReference}
          aria-invalid={Boolean(e.ralReference)}
          aria-describedby={describedBy("color-ral", e.ralReference)}
        />
      </Field>
      <Field id="color-hex" label="Farbcode" error={e.hexCode}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-8 rounded border"
            style={{ background: valid ? hex : "transparent" }}
          />
          <Input
            id="color-hex"
            name="hexCode"
            value={hex}
            onChange={(ev) => setHex(ev.target.value)}
            aria-invalid={Boolean(e.hexCode)}
            aria-describedby={describedBy("color-hex", e.hexCode)}
          />
        </div>
      </Field>
      <Field id="color-family" label="Farbfamilie" error={e.family}>
        <Input
          id="color-family"
          name="family"
          list="color-families"
          defaultValue={state.values.family}
          aria-invalid={Boolean(e.family)}
          aria-describedby={describedBy("color-family", e.family)}
        />
      </Field>
      <datalist id="color-families">
        {families.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {state.formError ? (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="justify-self-start">
        Speichern
      </Button>
    </form>
  );
}
```

`components/admin/material-dialog.tsx`: same structure with fields `code` (label "Kürzel") and `name` (label "Name"), titles "Material anlegen" / `Material „{code}“ bearbeiten`, button "Material anlegen", toast "Material gespeichert.", no datalist/swatch.

- [ ] **Step 8: Pages**

- `farben/page.tsx`: `listColors` via `unwrapAdmin`; heading "Farben"; `<ColorDialog action={saveColorAction} color={null} families={…unique sorted families} />`; table columns: Farbe (swatch `<span aria-hidden>` + name), RAL, Code, Familie, Produkte, Aktionen (`ColorDialog` with the colour, and `DeleteRecordButton` with `title="Farbe löschen?"`, `description={`„${c.name}“ wird endgültig gelöscht.`}`, `buttonLabel="Löschen"`).
- `materialien/page.tsx`: same pattern; columns Kürzel, Name, Produkte, Artikel, Aktionen. The delete button is always shown (SC-11 e2e checks the refusal message); the action's `23503` mapping is the guard.

Both tables always show the delete button and the usage counts; the `23503` mapping refuses a deletion of data in use with the D8 message.

- [ ] **Step 9: Navigation**

Write the failing header test (append to `components/admin/admin-header.test.tsx`):

```tsx
it("renders all admin sections (SC-12)", () => {
  render(
    <AdminHeader
      email="a@example.test"
      shortName="Demo"
      logoutAction={async () => {}}
    />
  );
  const nav = screen.getByRole("navigation", { name: "Admin" });
  for (const name of ["Produkte", "Kategorien", "Farben", "Materialien"])
    expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
});
```

Then in `admin-header.tsx` replace the single link with:

```tsx
const SECTIONS = [
  { href: "/admin/produkte", label: "Produkte" },
  { href: "/admin/kategorien", label: "Kategorien" },
  { href: "/admin/farben", label: "Farben" },
  { href: "/admin/materialien", label: "Materialien" },
] as const;
```

rendered as `Link`s with the existing classes, followed by the existing "Zur Website" link.

- [ ] **Step 10: Run checks**

Run: `pnpm vitest run lib/admin components/admin && pnpm typecheck && pnpm lint && pnpm db:test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add lib/admin/master-schema.ts lib/admin/master-schema.test.ts lib/admin/master-data.ts components/admin/color-dialog.tsx components/admin/material-dialog.tsx components/admin/admin-header.tsx components/admin/admin-header.test.tsx "app/admin/(protected)/farben" "app/admin/(protected)/materialien" tests/integration/admin-master-data.test.ts
git commit -m "feat(admin): maintain colours and materials"
```

---

### Task 9: `pnpm media:prune`

**Files:**

- Create: `scripts/media/prune.mts`
- Test: `scripts/media/prune.test.ts`, `tests/integration/media-prune.test.ts`
- Modify: `package.json` (script `media:prune`)

**Interfaces:**

- Consumes: `parseRemoveEnv` (`scripts/import/env.mts`), `CliIo` type (`scripts/import/cli.mts`).
- Produces:
  - `type MediaRow = { id: number; storagePath: string; linked: boolean }`
  - `type StoredObject = { path: string; createdAt: Date }`
  - `planPrune(rows: MediaRow[], objects: StoredObject[], now: Date): { rowIds: number[]; files: string[] }`
  - `type PruneDeps = { readRows(): Promise<Result<MediaRow[], string>>; listObjects(): Promise<Result<StoredObject[], string>>; deleteRows(ids: number[]): Promise<Result<null, string>>; removeFiles(paths: string[]): Promise<Result<null, string>> }`
  - `runPrune(deps: PruneDeps, apply: boolean, io: Pick<CliIo, "log" | "error">, now?: Date): Promise<number>` (exit code)
  - `runPruneCli(argv: readonly string[], io: CliIo): Promise<number>`

- [ ] **Step 1: Write the failing unit tests**

```ts
// scripts/media/prune.test.ts
import { describe, expect, it, vi } from "vitest";
import { planPrune, runPrune, type PruneDeps } from "./prune.mts";

const now = new Date("2026-10-10T12:00:00Z");
const old = new Date("2026-10-10T10:00:00Z");
const young = new Date("2026-10-10T11:30:00Z");

describe("planPrune (SC-7)", () => {
  it("finds unlinked rows and unreferenced old files under products/", () => {
    const plan = planPrune(
      [
        { id: 1, storagePath: "products/a.png", linked: true },
        { id: 2, storagePath: "products/b.png", linked: false },
      ],
      [
        { path: "products/a.png", createdAt: old },
        { path: "products/b.png", createdAt: young }, // file of an unlinked row: removed regardless of age
        { path: "products/c.png", createdAt: old }, // orphan
        { path: "products/d.png", createdAt: young }, // upload in flight
        { path: "certificates/x.pdf", createdAt: old }, // never touched
      ],
      now
    );
    expect(plan).toEqual({
      rowIds: [2],
      files: ["products/b.png", "products/c.png"],
    });
  });
});

function deps(overrides: Partial<PruneDeps> = {}): PruneDeps {
  return {
    readRows: vi.fn(async () => ({
      ok: true as const,
      value: [{ id: 2, storagePath: "products/b.png", linked: false }],
    })),
    listObjects: vi.fn(async () => ({
      ok: true as const,
      value: [{ path: "products/b.png", createdAt: old }],
    })),
    deleteRows: vi.fn(async () => ({ ok: true as const, value: null })),
    removeFiles: vi.fn(async () => ({ ok: true as const, value: null })),
    ...overrides,
  };
}
const io = () => ({ log: vi.fn(), error: vi.fn() });

describe("runPrune (SC-7)", () => {
  it("deletes nothing without --apply", async () => {
    const d = deps();
    const out = io();
    expect(await runPrune(d, false, out, now)).toBe(0);
    expect(d.deleteRows).not.toHaveBeenCalled();
    expect(d.removeFiles).not.toHaveBeenCalled();
    expect(out.log).toHaveBeenCalledWith("unlinked media rows: 1");
    expect(out.log).toHaveBeenCalledWith("orphan files: 1");
  });

  it("deletes rows first, then files with --apply", async () => {
    const order: string[] = [];
    const d = deps({
      deleteRows: vi.fn(async () => {
        order.push("rows");
        return { ok: true as const, value: null };
      }),
      removeFiles: vi.fn(async () => {
        order.push("files");
        return { ok: true as const, value: null };
      }),
    });
    expect(await runPrune(d, true, io(), now)).toBe(0);
    expect(order).toEqual(["rows", "files"]);
  });

  it("exits 1 on a storage error", async () => {
    const d = deps({
      listObjects: vi.fn(async () => ({
        ok: false as const,
        error: "listing failed",
      })),
    });
    const out = io();
    expect(await runPrune(d, true, out, now)).toBe(1);
    expect(out.error).toHaveBeenCalledWith("listing failed");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run scripts/media/prune.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// scripts/media/prune.mts
// Removes media rows without a product and files under products/ without a
// media row (spec D6). Usage: pnpm media:prune [--apply]
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import type { CliIo } from "../import/cli.mts";
import { parseRemoveEnv } from "../import/env.mts";
import { err, ok, type Result } from "../import/result.mts";

export type MediaRow = { id: number; storagePath: string; linked: boolean };
export type StoredObject = { path: string; createdAt: Date };
export type PruneDeps = {
  readRows(): Promise<Result<MediaRow[], string>>;
  listObjects(): Promise<Result<StoredObject[], string>>;
  deleteRows(ids: number[]): Promise<Result<null, string>>;
  removeFiles(paths: string[]): Promise<Result<null, string>>;
};

const PREFIX = "products/";
const MIN_AGE_MS = 60 * 60 * 1000; // protects an upload in flight

export function planPrune(
  rows: MediaRow[],
  objects: StoredObject[],
  now: Date
): { rowIds: number[]; files: string[] } {
  const referenced = new Set(
    rows.filter((r) => r.linked).map((r) => r.storagePath)
  );
  const unlinked = rows.filter((r) => !r.linked);
  const unlinkedPaths = new Set(unlinked.map((r) => r.storagePath));
  const files = objects
    .filter(
      (o) =>
        o.path.startsWith(PREFIX) &&
        !referenced.has(o.path) &&
        (unlinkedPaths.has(o.path) ||
          now.getTime() - o.createdAt.getTime() > MIN_AGE_MS)
    )
    .map((o) => o.path)
    .sort();
  return { rowIds: unlinked.map((r) => r.id).sort((a, b) => a - b), files };
}

export async function runPrune(
  deps: PruneDeps,
  apply: boolean,
  io: Pick<CliIo, "log" | "error">,
  now: Date = new Date()
): Promise<number> {
  const rows = await deps.readRows();
  if (!rows.ok) {
    io.error(rows.error);
    return 1;
  }
  const objects = await deps.listObjects();
  if (!objects.ok) {
    io.error(objects.error);
    return 1;
  }
  const plan = planPrune(rows.value, objects.value, now);
  io.log(`unlinked media rows: ${plan.rowIds.length}`);
  io.log(`orphan files: ${plan.files.length}`);
  for (const path of plan.files) io.log(`  ${path}`);
  if (!apply) {
    io.log("Dry run — re-run with --apply to delete.");
    return 0;
  }
  if (plan.rowIds.length > 0) {
    const deleted = await deps.deleteRows(plan.rowIds);
    if (!deleted.ok) {
      io.error(deleted.error);
      return 1;
    }
  }
  for (let i = 0; i < plan.files.length; i += 100) {
    const removed = await deps.removeFiles(plan.files.slice(i, i + 100));
    if (!removed.ok) {
      io.error(removed.error);
      return 1;
    }
  }
  io.log("Done.");
  return 0;
}

async function listWithDates(
  client: SupabaseClient<Database>,
  prefix: string
): Promise<Result<StoredObject[], string>> {
  const bucket = client.storage.from("catalog");
  const found: StoredObject[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
    if (error) return err(`listing ${prefix} failed: ${error.message}`);
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        // Storage lists folders as entries without an id.
        const nested = await listWithDates(client, path);
        if (!nested.ok) return nested;
        found.push(...nested.value);
      } else {
        found.push({ path, createdAt: new Date(entry.created_at ?? 0) });
      }
    }
    if ((data ?? []).length < 1000) return ok(found);
  }
}

export function supabaseDeps(client: SupabaseClient<Database>): PruneDeps {
  return {
    async readRows() {
      const { data, error } = await client
        .from("media")
        .select("id, storage_path, product_media(product_id)")
        .range(0, 99_999);
      if (error) return err(`reading media failed: ${error.message}`);
      return ok(
        data.map((m) => ({
          id: m.id,
          storagePath: m.storage_path,
          linked: m.product_media.length > 0,
        }))
      );
    },
    listObjects: () => listWithDates(client, "products"),
    async deleteRows(ids) {
      const { error } = await client.from("media").delete().in("id", ids);
      return error
        ? err(`deleting media rows failed: ${error.message}`)
        : ok(null);
    },
    async removeFiles(paths) {
      const { error } = await client.storage.from("catalog").remove(paths);
      return error ? err(`removing files failed: ${error.message}`) : ok(null);
    },
  };
}

export async function runPruneCli(
  argv: readonly string[],
  io: CliIo
): Promise<number> {
  let apply = false;
  try {
    const { values } = parseArgs({
      args: argv.filter((a) => a !== "--"),
      options: { apply: { type: "boolean" } },
      strict: true,
    });
    apply = values.apply ?? false;
  } catch (error: unknown) {
    io.error(error instanceof Error ? error.message : String(error));
    io.error("usage: pnpm media:prune [--apply]");
    return 2;
  }
  const env = parseRemoveEnv(io.env);
  if (!env.ok) {
    io.error(env.error);
    return 1;
  }
  const client = createClient<Database>(
    env.value.IMPORT_SUPABASE_URL,
    env.value.IMPORT_SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  return runPrune(supabaseDeps(client), apply, io);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const code = await runPruneCli(process.argv.slice(2), {
    log: (m) => console.log(m),
    error: (m) => console.error(m),
    env: process.env,
  });
  process.exitCode = code;
}
```

Check the actual `CliIo` shape and the main-module guard in `scripts/import/remove.mts` and mirror them exactly (field names, how `env` is passed).

Add to `package.json` scripts: `"media:prune": "node --env-file-if-exists=.env.import scripts/media/prune.mts"`.

- [ ] **Step 4: Run unit tests**

Run: `pnpm vitest run scripts/media/prune.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Integration test**

```ts
// tests/integration/media-prune.test.ts
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { runPruneCli } from "@/scripts/media/prune.mts";
import { makePng } from "../fixtures/images";

const svc = () =>
  createClient<Database>(
    process.env.IMPORT_SUPABASE_URL ?? "",
    process.env.IMPORT_SUPABASE_SECRET_KEY ?? "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

describe("media:prune (SC-7)", () => {
  it("removes an unlinked row and its file with --apply", async () => {
    const path = `products/int-prune/${Date.now()}.png`;
    const up = await svc()
      .storage.from("catalog")
      .upload(path, makePng(2, 2), { contentType: "image/png" });
    expect(up.error).toBeNull();
    const { error } = await svc()
      .from("media")
      .insert({ storage_path: path, width: 2, height: 2, alt_text: "x" });
    expect(error).toBeNull();
    const logs: string[] = [];
    const code = await runPruneCli(["--apply"], {
      log: (m) => logs.push(m),
      error: (m) => logs.push(m),
      env: process.env,
    });
    expect(code).toBe(0);
    const { data } = await svc()
      .from("media")
      .select("id")
      .eq("storage_path", path);
    expect(data).toEqual([]);
    const listed = await svc()
      .storage.from("catalog")
      .list("products/int-prune");
    expect(listed.data?.map((o) => o.name)).not.toContain(
      path.split("/").pop()
    );
  });
});
```

Use a relative import for `scripts/media/prune.mts` if the alias does not cover `scripts/`.

- [ ] **Step 6: Run DB tests**

Run: `pnpm db:test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/media/prune.mts scripts/media/prune.test.ts tests/integration/media-prune.test.ts package.json
git commit -m "feat(scripts): media:prune removes orphan images"
```

---

### Task 10: End-to-end tests

**Files:**

- Create: `e2e/admin/product-sections.spec.ts`, `e2e/admin/master-data.spec.ts`
- Modify: `e2e/admin/admin.teardown.ts`, `e2e/admin/a11y.spec.ts`, `e2e/admin/support.ts` (shared helpers)

**Interfaces:**

- Consumes: `makePng` (`tests/fixtures/images.ts`), `serviceClient`, `STORAGE_STATE` (`e2e/admin/support.ts`).
- Produces: `createPublishedProduct(slug: string, name: string, articleNumber: string): Promise<number>` and `removeE2eData(): Promise<void>` in `e2e/admin/support.ts`.

- [ ] **Step 1: Teardown without orphans (Review Focus 5)**

Add to `e2e/admin/support.ts`:

```ts
// Published e2e product with one article, created directly (service role).
export async function createPublishedProduct(
  slug: string,
  name: string,
  articleNumber: string
): Promise<number> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("product")
    .insert({ category_id: 1, slug, name, status: "published" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: articleError } = await svc
    .from("article")
    .insert({ product_id: data.id, article_number: articleNumber });
  if (articleError) throw articleError;
  return data.id;
}

// Removes e2e products with their media rows and files, then e2e master data.
export async function removeE2eData(): Promise<void> {
  const svc = serviceClient();
  const { data: products, error } = await svc
    .from("product")
    .select("id, product_media(media(id, storage_path))")
    .like("slug", "e2e-%");
  if (error) throw error;
  const media = products.flatMap((p) => p.product_media.map((pm) => pm.media));
  if (media.length > 0) {
    const { error: rowError } = await svc
      .from("media")
      .delete()
      .in(
        "id",
        media.map((m) => m.id)
      );
    if (rowError) throw rowError;
    const { error: fileError } = await svc.storage
      .from("catalog")
      .remove(media.map((m) => m.storage_path));
    if (fileError) throw fileError;
  }
  for (const [table, column, pattern] of [
    ["product", "slug", "e2e-%"],
    ["category", "slug", "e2e-%"],
    ["color", "name", "E2E %"],
    ["material", "code", "E2E-%"],
  ] as const) {
    const { error: deleteError } = await svc
      .from(table)
      .delete()
      .like(column, pattern);
    if (deleteError) throw deleteError;
  }
}
```

Replace the body of the teardown test in `admin.teardown.ts` with `await removeE2eData();` and update its comment.

- [ ] **Step 2: Product sections spec**

```ts
// e2e/admin/product-sections.spec.ts
import { expect, test } from "@playwright/test";
import { makePng } from "../../tests/fixtures/images";
import { createPublishedProduct, STORAGE_STATE } from "./support";

test.use({ storageState: STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const SLUG = `e2e-bilder-${run}`;
const NAME = `E2E Bilder ${run}`;
const PUBLIC_URL = `/produkte/moebelteile/${SLUG}`;
let editUrl = "";

const publicHtml = async (page: import("@playwright/test").Page) =>
  (await page.request.get(PUBLIC_URL)).text();

test.beforeAll(async () => {
  const id = await createPublishedProduct(SLUG, NAME, `E2E-B-${run}`);
  editUrl = `/admin/produkte/${id}`;
});

test("upload an image (SC-2)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByLabel("Bilddatei").setInputFiles({
    name: "e2e.png",
    mimeType: "image/png",
    buffer: Buffer.from(makePng(40, 30)),
  });
  await page
    .getByLabel("Alt-Text", { exact: true })
    .last()
    .fill(`Erstes Bild ${run}`);
  await page.getByRole("button", { name: "Bild hochladen" }).click();
  await expect(
    page.getByText("Bild hochgeladen.", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Vorschaubild" })).toBeChecked();
  expect(await publicHtml(page)).toContain(`alt="Erstes Bild ${run}"`);
});

test("reject a file that is not an image (SC-1)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByLabel("Bilddatei").setInputFiles({
    name: "fake.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("not an image"),
  });
  await page.getByLabel("Alt-Text", { exact: true }).last().fill("x");
  await page.getByRole("button", { name: "Bild hochladen" }).click();
  await expect(page.getByText("Nur JPEG, PNG oder WebP.")).toBeVisible();
});

test("edit alt text and order (SC-5)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByLabel("Bilddatei").setInputFiles({
    name: "zwei.png",
    mimeType: "image/png",
    buffer: Buffer.from(makePng(30, 30)),
  });
  await page
    .getByLabel("Alt-Text", { exact: true })
    .last()
    .fill(`Zweites Bild ${run}`);
  await page.getByRole("button", { name: "Bild hochladen" }).click();
  await expect(
    page.getByText("Bild hochgeladen.", { exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Bild 2 nach oben" }).click();
  await page.getByRole("radio", { name: "Vorschaubild" }).first().check();
  await page
    .getByLabel("Alt-Text", { exact: true })
    .first()
    .fill(`Zweites Bild neu ${run}`);
  await page.getByRole("button", { name: "Bilder speichern" }).click();
  await expect(
    page.getByText("Bilder gespeichert.", { exact: true })
  ).toBeVisible();

  const html = await publicHtml(page);
  expect(html).toContain(`alt="Zweites Bild neu ${run}"`);
  expect(html.indexOf(`Zweites Bild neu ${run}`)).toBeLessThan(
    html.indexOf(`Erstes Bild ${run}`)
  );
});

test("remove images until none is left, then upload again (SC-6, Review Focus 4)", async ({
  page,
}) => {
  await page.goto(editUrl);
  for (const n of [1, 2]) {
    await page.getByRole("button", { name: "Bild 1 entfernen" }).click();
    await page.getByRole("button", { name: "Endgültig entfernen" }).click();
    await expect(
      page.getByText("Bild entfernt.", { exact: true }).first()
    ).toBeVisible();
    if (n === 1)
      await expect(
        page.getByRole("button", { name: "Bild 1 entfernen" })
      ).toBeVisible();
  }
  await expect(page.getByText("Noch keine Bilder.")).toBeVisible();
  expect(await publicHtml(page)).not.toContain(`Erstes Bild ${run}`);

  await page.getByLabel("Bilddatei").setInputFiles({
    name: "drei.png",
    mimeType: "image/png",
    buffer: Buffer.from(makePng(20, 20)),
  });
  await page
    .getByLabel("Alt-Text", { exact: true })
    .last()
    .fill(`Drittes Bild ${run}`);
  await page.getByRole("button", { name: "Bild hochladen" }).click();
  await expect(page.getByRole("radio", { name: "Vorschaubild" })).toBeChecked();
});

test("add an accessory (SC-9)", async ({ page }) => {
  await page.goto(editUrl);
  await page.getByRole("button", { name: "Zubehör hinzufügen" }).click();
  await page.getByLabel("Artikelnummer").last().fill(" 99211/80 ");
  await page.getByRole("button", { name: "Zubehör speichern" }).click();
  await expect(
    page.getByText("Zubehör gespeichert.", { exact: true })
  ).toBeVisible();
  const html = await publicHtml(page);
  expect(html).toContain("Passendes Zubehör");
  expect(html).toContain("99211/80");

  await page.getByRole("button", { name: "Zubehör hinzufügen" }).click();
  await page.getByLabel("Artikelnummer").last().fill("GIBT-ES-NICHT");
  await page.getByRole("button", { name: "Zubehör speichern" }).click();
  await expect(
    page.getByText("Diese Artikelnummer gibt es nicht.")
  ).toBeVisible();
});
```

Selectors must match the labels implemented in Tasks 4 and 5; if a label differs, change the spec, not the UI text in the plan's interfaces.

- [ ] **Step 3: Master data spec**

```ts
// e2e/admin/master-data.spec.ts
import { expect, test } from "@playwright/test";
import {
  createPublishedProduct,
  serviceClient,
  STORAGE_STATE,
} from "./support";

test.use({ storageState: STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const CATEGORY = `E2E Kategorie ${run}`;
const COLOR = `E2E Farbe ${run}`;
const MATERIAL = `E2E-${run}`.slice(0, 20);
const SLUG = `e2e-stamm-${run}`;
const PUBLIC_URL = `/produkte/moebelteile/${SLUG}`;
let productId = 0;

test.beforeAll(async () => {
  productId = await createPublishedProduct(
    SLUG,
    `E2E Stamm ${run}`,
    `E2E-S-${run}`
  );
});

test("create a category with an attribute (SC-10)", async ({ page }) => {
  await page.goto("/admin/kategorien/neu");
  await page.getByLabel("Name", { exact: true }).fill(CATEGORY);
  await expect(page.getByLabel("Slug")).toHaveValue(`e2e-kategorie-${run}`);
  await page.getByRole("checkbox", { name: "Oberfläche" }).check();
  await page.getByRole("button", { name: "Kategorie anlegen" }).click();
  await expect(page).toHaveURL(/\/admin\/kategorien\/\d+$/);

  await page.goto("/admin/produkte/neu");
  await expect(
    page.getByLabel("Kategorie").locator("option", { hasText: CATEGORY })
  ).toHaveCount(1);
});

test("rename a used colour (SC-11)", async ({ page }) => {
  await page.goto("/admin/farben");
  await page.getByRole("button", { name: "Farbe anlegen" }).click();
  await page.getByLabel("Name").fill(COLOR);
  await page.getByLabel("Farbcode").fill("#aa0000");
  await page.getByLabel("Farbfamilie").fill("rot");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Farbe gespeichert.", { exact: true })
  ).toBeVisible();

  const svc = serviceClient();
  const { data } = await svc
    .from("color")
    .select("id")
    .eq("name", COLOR)
    .single();
  await svc.from("product_color").insert({
    product_id: productId,
    color_id: data!.id,
    suffix: "9",
    is_default: true,
  });

  await page.reload();
  await page
    .getByRole("row", { name: new RegExp(COLOR) })
    .getByRole("button", { name: "Bearbeiten" })
    .click();
  await page.getByLabel("Name").fill(`${COLOR} neu`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Farbe gespeichert.", { exact: true })
  ).toBeVisible();
  expect(await (await page.request.get(PUBLIC_URL)).text()).toContain(
    `${COLOR} neu`
  );
});

test("deleting a used material is refused (SC-11)", async ({ page }) => {
  await page.goto("/admin/materialien");
  await page.getByRole("button", { name: "Material anlegen" }).click();
  await page.getByLabel("Kürzel").fill(MATERIAL);
  await page.getByLabel("Name").fill("E2E Material");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(
    page.getByText("Material gespeichert.", { exact: true })
  ).toBeVisible();

  const svc = serviceClient();
  const { data } = await svc
    .from("material")
    .select("id")
    .eq("code", MATERIAL)
    .single();
  await svc
    .from("product")
    .update({ material_id: data!.id })
    .eq("id", productId);

  await page.reload();
  await page
    .getByRole("row", { name: new RegExp(MATERIAL) })
    .getByRole("button", { name: "Löschen" })
    .click();
  await page.getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Das Material wird noch verwendet." })
  ).toBeVisible();
});
```

The teardown deletes the product first (cascades `product_color`), then e2e categories, colours (`E2E %`) and materials (`E2E-%`) — order in `removeE2eData` already matches.

- [ ] **Step 4: Accessibility, noindex and redirects (SC-12)**

Append to `e2e/admin/a11y.spec.ts` inside the "admin accessibility and noindex" describe:

```ts
test("new admin pages: axe, noindex, banner", async ({ page }) => {
  for (const path of [
    "/admin/kategorien",
    "/admin/kategorien/1",
    "/admin/farben",
    "/admin/materialien",
  ]) {
    const response = await page.goto(path);
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(
      page.getByRole("region", { name: "Hinweis zur Vorschau" })
    ).toBeVisible();
    expect(await blocking(page), path).toEqual([]);
  }
  await page.goto("/admin/farben");
  await page.getByRole("button", { name: "Farbe anlegen" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await blocking(page)).toEqual([]);
  await page.goto("/admin/produkte/1");
  await expect(page.getByRole("heading", { name: "Bilder" })).toBeVisible();
  expect(await blocking(page)).toEqual([]);
});
```

Append to `e2e/admin/auth.spec.ts` (in the describe that runs without a session):

```ts
for (const path of ["/admin/kategorien", "/admin/farben", "/admin/materialien"])
  test(`${path} redirects without a session (SC-12)`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
  });
```

- [ ] **Step 5: Build and run E2E**

Run (see CLAUDE.md for env): `pnpm db:reset && pnpm build && E2E_PORT=3100 pnpm e2e`
Expected: all projects pass. After the run: `docker exec <db container> psql -U postgres -c "select count(*) from media m where not exists (select 1 from product_media pm where pm.media_id = m.id)"` → 0 (Review Focus 5).

- [ ] **Step 6: Commit**

```bash
git add e2e/admin
git commit -m "test(e2e): images, accessories and master data in the admin"
```

---

### Task 11: Documentation

**Files:**

- Modify: `docs/data-model.md`, `docs/deploy.md`, `docs/specs/2026-10-10-admin-media-master-data-design.md` (Status, Deviations)

- [ ] **Step 1: Data model**

In `docs/data-model.md`, "Access rules (RLS)":

- extend the admin-functions bullet with `admin_attach_media`, `admin_set_product_media`, `admin_remove_media`, `admin_delete_product`, `admin_set_product_accessories`, `admin_save_category` (one line each: what it writes, which rule it enforces);
- add "Media lifecycle": images belong to one product; uploads go to `products/{product_id}/{uuid}.{ext}`; removing an image or deleting a product deletes rows first and files second; `pnpm media:prune` removes leftovers;
- add "Master data deletion": categories with products, colours with product assignments and materials in use cannot be deleted (`on delete restrict`).

- [ ] **Step 2: Deploy runbook**

In `docs/deploy.md` add a section "Images":

- upload limit 5 MB, enforced in the app; `serverActions.bodySizeLimit` is 6 MB; the reverse proxy in front of the app must accept request bodies of at least 6 MB;
- `pnpm media:prune` (dry run) and `pnpm media:prune --apply` with `IMPORT_SUPABASE_URL`/`IMPORT_SUPABASE_SECRET_KEY` of the target, when to run it (once after deploying 6b, then after failed deletions show up in the logs).

Add the command to the "Commands" list in `CLAUDE.md`: `- Remove orphan images: pnpm media:prune [--apply] (see docs/deploy.md)`.

- [ ] **Step 3: Spec status and deviations**

Set `- **Status:** implemented (YYYY-MM-DD)` and add a "Deviations" section listing every place the implementation differs from the spec (e.g. delete buttons always shown for colours and materials, accessory lookup outside `adminWrite`, file names). If there are none, write "None."

- [ ] **Step 4: Format and verify**

Run: `pnpm exec prettier --write docs CLAUDE.md && pnpm lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs: images, media lifecycle and master data rules"
```

Roadmap status "done" and the CLAUDE.md status line are updated only after Gate 2 approval (feature workflow).
