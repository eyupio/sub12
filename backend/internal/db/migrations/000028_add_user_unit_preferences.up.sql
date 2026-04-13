ALTER TABLE users ADD COLUMN IF NOT EXISTS default_distance_unit TEXT NOT NULL DEFAULT 'meters';
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_measurement_unit TEXT NOT NULL DEFAULT 'cm';
