-- Synthetic catalog data for local development and tests.
-- Invented names and numbers (99xxx); never customer data.

insert into public.category (id, slug, name, intro_text, sort_order) overriding system value values
  (1, 'moebelteile', 'Möbelteile (Beispiel)', 'Beispieltext für die Kategorie Möbelteile.', 0),
  (2, 'sanitaer', 'Sanitärteile (Beispiel)', 'Beispieltext für die Kategorie Sanitärteile.', 1);

insert into public.attribute (id, key, label, unit, data_type, sort_order) overriding system value values
  (1, 'height', 'Höhe', 'mm', 'decimal', 0),
  (2, 'pipe_diameter', 'für Rohr Ø', 'mm', 'decimal', 1),
  (3, 'surface', 'Oberfläche', null, 'text', 2);

insert into public.category_attribute (category_id, attribute_id, sort_order) values
  (1, 1, 0), (1, 3, 1), (2, 2, 0);

insert into public.material (id, code, name) overriding system value values
  (1, 'PA-6', 'Polyamid 6'),
  (2, 'POM', 'Polyoxymethylen');

insert into public.color (id, name, ral_reference, hex_code, family) overriding system value values
  (1, 'weiß', 'ähnlich RAL 9016', '#F4F4F4', 'weiß'),
  (2, 'grau', null, '#8A8D8F', 'grau'),
  (3, 'braun', null, '#6B4423', 'braun');

insert into public.product (id, category_id, slug, name, subtitle, description, description_origin, material_id, status, sort_order) overriding system value values
  (1, 1, 'testkeil-mit-daempfung', 'Testkeil mit Dämpfung', 'für Beispielschlösser', 'Gedämpfter Keil für Möbeltüren. Beispieldaten.', 'human', 1, 'published', 0),
  (2, 2, 'testrohrschelle', 'Testrohrschelle', 'für Rohre bis 15 mm', 'Rohrschelle zur Befestigung an der Wand. Beispieldaten.', 'ai', 2, 'published', 0),
  (3, 1, 'testabdeckung', 'Testabdeckung', null, 'Abdeckkappe ohne Farbvarianten. Beispieldaten.', 'human', null, 'published', 1),
  (4, 1, 'entwurfsteil', 'Entwurfsteil', null, 'Noch nicht veröffentlicht.', 'human', null, 'draft', 2),
  (5, 2, 'altteil', 'Altteil', null, 'Nicht mehr im Sortiment.', 'human', null, 'archived', 1);

insert into public.article (id, product_id, article_number, name, sort_order) overriding system value values
  (1, 1, '99010', 'Testkeil 8 mm', 0),
  (2, 1, '99011', 'Testkeil 10 mm', 1),
  (3, 2, '99211/80', 'Testrohrschelle 15 mm', 0),
  (4, 3, '99300', null, 0),
  (5, 4, '99400', null, 0),
  (6, 5, '99500', null, 0);

insert into public.article_attribute (article_id, attribute_id, value_decimal, value_text) values
  (1, 1, 8, null),
  (2, 1, 10, null),
  (3, 2, 15, null),
  (4, 3, null, 'glatt'),
  (5, 1, 12, null);

insert into public.article_packaging (article_id, quantity, sort_order) values
  (1, 100, 0), (1, 500, 1), (3, 50, 0), (5, 10, 0);

insert into public.product_color (product_id, color_id, suffix, is_default, sort_order) values
  (1, 3, '1', true, 0),
  (1, 1, '2', false, 1),
  (2, 2, '0', true, 0),
  (2, 1, '2', false, 1),
  (4, 1, null, true, 0);

insert into public.media (id, storage_path, width, height, alt_text) overriding system value values
  (1, 'products/testkeil-1.webp', 800, 600, 'Testkeil mit Dämpfung, Seitenansicht'),
  (2, 'products/entwurfsteil-1.webp', 800, 600, 'Entwurfsteil');

insert into public.product_media (product_id, media_id, role, sort_order) values
  (1, 1, 'thumbnail', 0),
  (4, 2, 'thumbnail', 0);

-- (3, 2): visible accessory. (1, 5): accessory whose home product is a draft.
insert into public.product_accessory (product_id, article_id, sort_order) values
  (3, 2, 0),
  (1, 5, 0);

insert into public.ai_generation (id, entity, entity_id, field, model, prompt_version, output) overriding system value values
  (1, 'product', 1, 'description', 'test-model', 'v1', 'Beispieltext');

-- Synthetic certificate (no files in Storage; pages render links only).
insert into public.certificate (id, standard, title, preview_path, preview_width, preview_height, preview_alt, sort_order) overriding system value values
  (1, 'ISO 9001 (Beispiel)', 'Qualitätsmanagement (Beispiel)', 'certificates/test-iso-9001.png', 600, 848, 'Beispielzertifikat ISO 9001', 0);

insert into public.certificate_document (certificate_id, language, storage_path) values
  (1, 'de', 'certificates/test-iso-9001-de.pdf'),
  (1, 'en', 'certificates/test-iso-9001-en.pdf');

-- Fixed ids above; move identity sequences past them.
do $$
declare
  t text;
begin
  foreach t in array array['category', 'attribute', 'material', 'color', 'product', 'article', 'media', 'ai_generation', 'certificate'] loop
    execute format(
      'select setval(pg_get_serial_sequence(%L, ''id''), (select max(id) from public.%I))',
      'public.' || t, t);
  end loop;
end;
$$;
