-- Optimise per-user activity lookups for feed construction
CREATE INDEX IF NOT EXISTS idx_activities_user_type ON activities (user_id, type, created_at DESC);
