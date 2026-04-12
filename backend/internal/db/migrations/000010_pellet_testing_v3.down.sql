-- Reverse PT-3: Automation & Detection

ALTER TABLE pellet_test_sessions
    DROP COLUMN IF EXISTS is_public;

ALTER TABLE pellet_test_measurements
    DROP COLUMN IF EXISTS detection_confidence,
    DROP COLUMN IF EXISTS auto_group_size_moa,
    DROP COLUMN IF EXISTS auto_group_size_mm,
    DROP COLUMN IF EXISTS detected_hole_count,
    DROP COLUMN IF EXISTS annotated_image_id,
    DROP COLUMN IF EXISTS detection_method;

DROP TABLE IF EXISTS pellet_test_detections;
