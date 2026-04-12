-- PT-3: Automation & Detection

-- ── Detected holes from automatic or manual identification ──────────────────

CREATE TABLE IF NOT EXISTS pellet_test_detections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_id  UUID NOT NULL REFERENCES pellet_test_measurements(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES pellet_test_sessions(id) ON DELETE CASCADE,
    center_x        NUMERIC(10,2) NOT NULL,
    center_y        NUMERIC(10,2) NOT NULL,
    radius_pixels   NUMERIC(10,2) NOT NULL,
    diameter_mm     NUMERIC(8,3),
    confidence      NUMERIC(5,4) NOT NULL DEFAULT 0,
    is_confirmed    BOOLEAN NOT NULL DEFAULT false,
    is_rejected     BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptd_measurement ON pellet_test_detections (measurement_id);
CREATE INDEX IF NOT EXISTS idx_ptd_session     ON pellet_test_detections (session_id);

-- ── Detection metadata on measurements ──────────────────────────────────────

ALTER TABLE pellet_test_measurements
    ADD COLUMN IF NOT EXISTS detection_method      TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS annotated_image_id    UUID REFERENCES images(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS detected_hole_count   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS auto_group_size_mm    NUMERIC(8,3),
    ADD COLUMN IF NOT EXISTS auto_group_size_moa   NUMERIC(8,4),
    ADD COLUMN IF NOT EXISTS detection_confidence  NUMERIC(5,4);

-- ── Opt-in public visibility for cross-user leaderboard ─────────────────────

ALTER TABLE pellet_test_sessions
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pts_public ON pellet_test_sessions (is_public) WHERE is_public = true;
