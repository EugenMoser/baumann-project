-- Catalog tables per docs/data-model.md.

create table public.category (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  intro_text text not null default '',
  seo_title text,
  seo_description text,
  sort_order integer not null default 0
);

create table public.attribute (
  id bigint generated always as identity primary key,
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (btrim(label) <> ''),
  unit text,
  data_type public.attribute_data_type not null,
  sort_order integer not null default 0
);

create table public.category_attribute (
  category_id bigint not null references public.category (id) on delete cascade,
  attribute_id bigint not null references public.attribute (id) on delete restrict,
  sort_order integer not null default 0,
  primary key (category_id, attribute_id)
);

create table public.material (
  id bigint generated always as identity primary key,
  code text not null unique check (btrim(code) <> ''),
  name text not null check (btrim(name) <> '')
);

create table public.product (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.category (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  subtitle text,
  description text,
  material_id bigint references public.material (id) on delete restrict,
  material_note text,
  status public.product_status not null default 'draft',
  sort_order integer not null default 0,
  seo_title text,
  seo_description text,
  description_origin public.content_origin not null default 'human',
  seo_origin public.content_origin not null default 'human',
  legacy_product_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create trigger product_set_updated_at
  before update on public.product
  for each row execute function private.set_updated_at();

create table public.article (
  id bigint generated always as identity primary key,
  product_id bigint not null,
  article_number text not null unique check (btrim(article_number) <> ''),
  name text,
  description text,
  note text,
  material_id bigint references public.material (id) on delete restrict,
  material_note text,
  sort_order integer not null default 0,
  -- Named explicitly: PostgREST embeds need it to disambiguate article ↔ product
  -- (direct FK vs. the product_accessory junction).
  constraint article_product_id_fkey foreign key (product_id)
    references public.product (id) on delete cascade
);

create table public.article_attribute (
  article_id bigint not null references public.article (id) on delete cascade,
  attribute_id bigint not null references public.attribute (id) on delete restrict,
  value_decimal numeric,
  value_text text,
  primary key (article_id, attribute_id)
);

-- The value column must match the attribute's data_type.
create function private.check_article_attribute_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected public.attribute_data_type;
begin
  select data_type into expected from public.attribute where id = new.attribute_id;
  if expected is null then
    raise exception 'unknown attribute %', new.attribute_id using errcode = '23503';
  elsif expected = 'decimal' and (new.value_decimal is null or new.value_text is not null) then
    raise exception 'attribute % expects a decimal value', new.attribute_id using errcode = '23514';
  elsif expected = 'text' and (new.value_text is null or new.value_decimal is not null) then
    raise exception 'attribute % expects a text value', new.attribute_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger article_attribute_check_type
  before insert or update on public.article_attribute
  for each row execute function private.check_article_attribute_type();

create table public.article_packaging (
  article_id bigint not null references public.article (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  label text,
  sort_order integer not null default 0,
  primary key (article_id, quantity)
);

create table public.product_accessory (
  product_id bigint not null references public.product (id) on delete cascade,
  article_id bigint not null references public.article (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, article_id)
);

create table public.color (
  id bigint generated always as identity primary key,
  name text not null check (btrim(name) <> ''),
  ral_reference text,
  hex_code text not null check (hex_code ~ '^#[0-9A-Fa-f]{6}$'),
  family text not null check (btrim(family) <> '')
);

create table public.product_color (
  product_id bigint not null references public.product (id) on delete cascade,
  color_id bigint not null references public.color (id) on delete restrict,
  suffix text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  primary key (product_id, color_id)
);

-- At most one default colour per product. Never derive it from suffix = 0.
create unique index product_color_one_default_idx
  on public.product_color (product_id) where is_default;

create table public.media (
  id bigint generated always as identity primary key,
  storage_path text not null unique check (btrim(storage_path) <> ''),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  alt_text text not null,
  alt_origin public.content_origin not null default 'human'
);

create table public.product_media (
  product_id bigint not null references public.product (id) on delete cascade,
  media_id bigint not null references public.media (id) on delete cascade,
  role public.media_role not null,
  sort_order integer not null default 0,
  primary key (product_id, media_id)
);

create unique index product_media_one_thumbnail_idx
  on public.product_media (product_id) where role = 'thumbnail';

create table public.ai_generation (
  id bigint generated always as identity primary key,
  entity text not null check (entity in ('category', 'product', 'article', 'media')),
  entity_id bigint not null,
  field text not null,
  model text not null,
  prompt_version text not null,
  output text not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Foreign keys are not indexed automatically.
create index product_category_id_idx on public.product (category_id);
create index product_material_id_idx on public.product (material_id);
create index article_product_id_idx on public.article (product_id);
create index article_material_id_idx on public.article (material_id);
create index category_attribute_attribute_id_idx on public.category_attribute (attribute_id);
create index article_attribute_attribute_id_idx on public.article_attribute (attribute_id);
create index product_accessory_article_id_idx on public.product_accessory (article_id);
create index product_color_color_id_idx on public.product_color (color_id);
create index product_media_media_id_idx on public.product_media (media_id);
create index ai_generation_entity_idx on public.ai_generation (entity, entity_id);
