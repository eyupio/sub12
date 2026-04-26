DELETE FROM activities a
WHERE a.type = 'post_created'
  AND a.target_type = 'post'
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = a.target_id);
