DROP INDEX IF EXISTS idx_faqs_category_order;
ALTER TABLE faqs DROP COLUMN IF EXISTS category_order;
