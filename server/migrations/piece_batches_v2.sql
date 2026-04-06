-- server/migrations/piece_batches_v2.sql

-- Add collection appointment and cabinet placement tracking
ALTER TABLE piece_batches ADD COLUMN IF NOT EXISTS collection_date TIMESTAMPTZ;
ALTER TABLE piece_batches ADD COLUMN IF NOT EXISTS cabinet_placed_at TIMESTAMPTZ;
