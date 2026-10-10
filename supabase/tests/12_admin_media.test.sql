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
