-- Backfill explicit visibility for existing scoped posts so they don't remain
-- 'inherit' after 000038 adds the column.

UPDATE posts
   SET visibility = 'members'
 WHERE visibility = 'inherit'
   AND (league_id IS NOT NULL OR club_id IS NOT NULL);

UPDATE posts
   SET visibility = 'public'
 WHERE visibility = 'inherit'
   AND league_id IS NULL
   AND club_id IS NULL;
