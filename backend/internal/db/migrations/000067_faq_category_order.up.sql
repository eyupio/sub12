ALTER TABLE faqs ADD COLUMN IF NOT EXISTS category_order INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_faqs_category_order ON faqs(category_order, category, sort_order);

WITH ranked AS (
    SELECT category, ROW_NUMBER() OVER (ORDER BY MIN(sort_order), category) * 10 AS rn
    FROM faqs
    GROUP BY category
)
UPDATE faqs
SET category_order = ranked.rn
FROM ranked
WHERE faqs.category = ranked.category
  AND faqs.category_order = 0;
