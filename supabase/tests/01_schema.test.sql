begin;
select plan(26);

select tables_are('public', array[
  'category', 'attribute', 'category_attribute', 'material', 'product',
  'article', 'article_attribute', 'article_packaging', 'product_accessory',
  'color', 'product_color', 'media', 'product_media', 'ai_generation',
  'certificate', 'certificate_document'
], 'public schema has exactly the catalog tables');
select views_are('public', array['variant'], 'public schema has exactly the variant view');
select enums_are('public', array['product_status', 'content_origin', 'attribute_data_type', 'media_role'], 'catalog enums exist');
select enum_has_labels('public', 'product_status', array['draft', 'published', 'archived'], 'product_status labels');
select enum_has_labels('public', 'content_origin', array['human', 'ai', 'ai_edited'], 'content_origin labels');
select enum_has_labels('public', 'attribute_data_type', array['decimal', 'text'], 'attribute_data_type labels');
select enum_has_labels('public', 'media_role', array['thumbnail', 'gallery'], 'media_role labels');

select columns_are('public', 'category', array['id', 'slug', 'name', 'intro_text', 'seo_title', 'seo_description', 'sort_order'], 'category columns');
select columns_are('public', 'attribute', array['id', 'key', 'label', 'unit', 'data_type', 'sort_order'], 'attribute columns');
select columns_are('public', 'category_attribute', array['category_id', 'attribute_id', 'sort_order'], 'category_attribute columns');
select columns_are('public', 'material', array['id', 'code', 'name'], 'material columns');
select columns_are('public', 'product', array['id', 'category_id', 'slug', 'name', 'subtitle', 'description', 'material_id', 'material_note', 'status', 'sort_order', 'seo_title', 'seo_description', 'description_origin', 'seo_origin', 'legacy_product_id', 'created_at', 'updated_at', 'search'], 'product columns');
select columns_are('public', 'article', array['id', 'product_id', 'article_number', 'name', 'description', 'note', 'material_id', 'material_note', 'sort_order'], 'article columns');
select columns_are('public', 'article_attribute', array['article_id', 'attribute_id', 'value_decimal', 'value_text'], 'article_attribute columns');
select columns_are('public', 'article_packaging', array['article_id', 'quantity', 'label', 'sort_order'], 'article_packaging columns');
select columns_are('public', 'product_accessory', array['product_id', 'article_id', 'sort_order'], 'product_accessory columns');
select columns_are('public', 'color', array['id', 'name', 'ral_reference', 'hex_code', 'family'], 'color columns');
select columns_are('public', 'product_color', array['product_id', 'color_id', 'suffix', 'is_default', 'sort_order'], 'product_color columns');
select columns_are('public', 'media', array['id', 'storage_path', 'width', 'height', 'alt_text', 'alt_origin'], 'media columns');
select columns_are('public', 'product_media', array['product_id', 'media_id', 'role', 'sort_order'], 'product_media columns');
select columns_are('public', 'ai_generation', array['id', 'entity', 'entity_id', 'field', 'model', 'prompt_version', 'output', 'created_at', 'accepted_at'], 'ai_generation columns');

select col_type_is('public', 'article', 'article_number', 'text', 'article numbers are text (some contain a slash)');
select col_type_is('public', 'article_packaging', 'quantity', 'integer', 'pack sizes are integers');
select col_type_is('public', 'product', 'status', 'product_status', 'product status uses the enum');
select col_type_is('public', 'article_attribute', 'value_decimal', 'numeric', 'decimal attribute values are numeric');
select col_type_is('public', 'product', 'updated_at', 'timestamp with time zone', 'updated_at is timestamptz');

select * from finish();
rollback;
