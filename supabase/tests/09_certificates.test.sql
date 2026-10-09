begin;
select plan(17);

select has_table('public', 'certificate', 'certificate table exists');
select has_table('public', 'certificate_document', 'certificate_document table exists');
select col_is_unique('public', 'certificate', 'standard', 'standard is unique');
select col_is_pk('public', 'certificate_document', array['certificate_id', 'language'], 'one document per language');
select throws_ok(
  $$insert into public.certificate_document (certificate_id, language, storage_path) values (1, 'fr', 'certificates/x.pdf')$$,
  '23514', null, 'only de and en are allowed');
select throws_ok(
  $$insert into public.certificate (standard, title, preview_path, preview_width, preview_height, preview_alt) values ('X', 'X', 'products/x.png', 1, 1, 'x')$$,
  '23514', null, 'preview must live under certificates/');

-- Functions: service role only
select ok(not has_function_privilege('anon', 'public.import_certificates(jsonb)', 'execute'), 'anon cannot import certificates');
select ok(not has_function_privilege('authenticated', 'public.import_certificates(jsonb)', 'execute'), 'authenticated cannot import certificates');
select ok(has_function_privilege('service_role', 'public.import_certificates(jsonb)', 'execute'), 'service_role can import certificates');

-- anon reads, cannot write
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*) from public.certificate), 1::bigint, 'anon reads certificates');
select is((select count(*) from public.certificate_document), 2::bigint, 'anon reads certificate documents');
select throws_ok($$delete from public.certificate$$, '42501', null, 'anon cannot delete certificates');
reset role;

-- import replaces everything
set local role service_role;
select is(
  public.import_certificates($j$[
    {"standard": "ISO 14001 (Test)", "title": "Umwelt", "preview_path": "certificates/a.png",
     "preview_width": 10, "preview_height": 20, "preview_alt": "A", "sort_order": 0,
     "documents": [{"language": "de", "storage_path": "certificates/a-de.pdf"}]}
  ]$j$::jsonb),
  '{"certificates": 1, "documents": 1}'::jsonb, 'import returns counts');
select results_eq($$select standard from public.certificate$$, $$values ('ISO 14001 (Test)')$$,
  'import replaces the previous certificates');
select throws_ok($$select public.import_certificates('[]'::jsonb)$$, 'P0001', null, 'empty payload raises');
select throws_ok(
  $$select public.import_certificates('[{"standard": "X", "title": "X", "preview_path": "certificates/x.png", "preview_width": 1, "preview_height": 1, "preview_alt": "x", "sort_order": 0, "documents": []}]'::jsonb)$$,
  'P0001', null, 'a certificate without documents raises');

-- removal
select ok((public.remove_catalog() ? 'certificates'), 'remove_catalog reports certificates');
reset role;

select * from finish();
rollback;
