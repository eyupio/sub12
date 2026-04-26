UPDATE score_cards sc
SET comment_count = (
    SELECT COUNT(*)::int
    FROM comments
    WHERE target_id = sc.id::text
      AND target_type = 'score_card'
      AND parent_id IS NULL
      AND hidden_at IS NULL
);

UPDATE posts p
SET comment_count = (
    SELECT COUNT(*)::int
    FROM comments
    WHERE target_id = p.id::text
      AND target_type = 'post'
      AND parent_id IS NULL
      AND hidden_at IS NULL
);
