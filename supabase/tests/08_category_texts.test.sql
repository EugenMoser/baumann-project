begin;
select plan(6);

-- Seed: moebelteile has an intro text, sanitaer gets an empty one.
update public.category set intro_text = '' where slug = 'sanitaer';

select private.import_categories($$[
  {"slug": "moebelteile", "name": "Möbelteile (Beispiel)", "sort_order": 0,
   "intro_text": "Neuer Text", "seo_title": "Titel", "seo_description": "Beschreibung"},
  {"slug": "sanitaer", "name": "Sanitärteile (Beispiel)", "sort_order": 1,
   "intro_text": "Text für Sanitär", "seo_title": null, "seo_description": null},
  {"slug": "neu", "name": "Neue Kategorie", "sort_order": 9,
   "intro_text": "Intro neu", "seo_title": null, "seo_description": null}
]$$::jsonb);

select is((select intro_text from public.category where slug = 'moebelteile'),
  'Beispieltext für die Kategorie Möbelteile.', 'a non-empty intro text is kept');
select is((select seo_title from public.category where slug = 'moebelteile'),
  'Titel', 'an empty SEO title is filled');
select is((select seo_description from public.category where slug = 'moebelteile'),
  'Beschreibung', 'an empty SEO description is filled');
select is((select intro_text from public.category where slug = 'sanitaer'),
  'Text für Sanitär', 'an empty intro text is filled');
select is((select intro_text from public.category where slug = 'neu'),
  'Intro neu', 'a new category gets its intro text');
select ok(
  not has_function_privilege('anon', 'private.import_categories(jsonb)', 'execute'),
  'anon may not execute import_categories');

select * from finish();
rollback;
