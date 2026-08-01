DELETE FROM faqs WHERE slug IN (
    'first-things-to-do',
    'what-do-i-need-to-start',
    'getting-started-checklist',
    'shooting-jargon-glossary',
    'who-can-see-what-i-log',
    'using-sub12-at-the-range',
    'how-to-get-help',
    'what-happens-to-my-ticket',
    'suggesting-a-feature'
);

-- Restore the category ordering 000067 produced.
UPDATE faqs SET category_order = 40 WHERE category = 'Getting Started';
UPDATE faqs SET category_order = 10 WHERE category = 'Admin';
