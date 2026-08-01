-- Gear showcase: per-item opt-in to cross-user comparison, plus the lookup
-- indexes the showcase and admin aggregate queries rely on.
--
-- comparison_opt_in defaults TRUE to match the app's existing public-by-default
-- posture (default_score_visibility, profile_visibility). Aggregates are only
-- ever built from opted-in items owned by non-private profiles, and are gated
-- behind a minimum-owner threshold in the query layer.

ALTER TABLE rifles  ADD COLUMN IF NOT EXISTS comparison_opt_in BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pellets ADD COLUMN IF NOT EXISTS comparison_opt_in BOOLEAN NOT NULL DEFAULT TRUE;

-- Model-identity keys. Gear rows are per-user, so "the same rifle" across users
-- is matched on a normalised (make, model) / (brand, model) pair.
CREATE INDEX IF NOT EXISTS idx_rifles_model_key
    ON rifles (LOWER(BTRIM(make)), LOWER(BTRIM(model)));
CREATE INDEX IF NOT EXISTS idx_pellets_model_key
    ON pellets (LOWER(BTRIM(brand)), LOWER(BTRIM(model)));

-- Showcase reads score cards by gear id; only the user_id index exists today.
CREATE INDEX IF NOT EXISTS idx_score_cards_rifle
    ON score_cards (rifle_id) WHERE rifle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_score_cards_pellet
    ON score_cards (pellet_id) WHERE pellet_id IS NOT NULL;
