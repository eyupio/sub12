-- PT-2: Assisted Measurement — velocity, advanced conditions, image measurements

-- Add velocity / chronograph fields to sessions
ALTER TABLE pellet_test_sessions
    ADD COLUMN IF NOT EXISTS velocity_fps            NUMERIC(6,1),
    ADD COLUMN IF NOT EXISTS velocity_sd             NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS extreme_spread_fps      NUMERIC(6,1);

-- Add advanced condition fields to sessions
ALTER TABLE pellet_test_sessions
    ADD COLUMN IF NOT EXISTS bench_setup             TEXT,
    ADD COLUMN IF NOT EXISTS scope_details           TEXT,
    ADD COLUMN IF NOT EXISTS barometric_pressure_mbar NUMERIC(6,1);

-- Image-based measurements (calibration + bounding box)
CREATE TABLE IF NOT EXISTS pellet_test_measurements (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id              UUID NOT NULL REFERENCES pellet_test_images(id) ON DELETE CASCADE,
    session_id            UUID NOT NULL REFERENCES pellet_test_sessions(id) ON DELETE CASCADE,
    group_id              UUID REFERENCES pellet_test_groups(id) ON DELETE SET NULL,

    -- Calibration data
    calibration_type      TEXT NOT NULL DEFAULT 'target_ring',
    target_preset         TEXT,
    reference_ring_name   TEXT,
    reference_diameter_mm NUMERIC(8,3) NOT NULL,
    reference_pixels      NUMERIC(10,2) NOT NULL,
    pixels_per_mm         NUMERIC(10,4) NOT NULL,

    -- Reference circle position (on the image)
    ref_center_x          NUMERIC(10,2) NOT NULL,
    ref_center_y          NUMERIC(10,2) NOT NULL,
    ref_radius_pixels     NUMERIC(10,2) NOT NULL,

    -- Bounding box around the shot group
    bbox_x                NUMERIC(10,2),
    bbox_y                NUMERIC(10,2),
    bbox_width            NUMERIC(10,2),
    bbox_height           NUMERIC(10,2),

    -- Computed results
    measured_size_mm      NUMERIC(8,3),
    measured_size_moa     NUMERIC(8,4),

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptm_image   ON pellet_test_measurements (image_id);
CREATE INDEX IF NOT EXISTS idx_ptm_session ON pellet_test_measurements (session_id);
