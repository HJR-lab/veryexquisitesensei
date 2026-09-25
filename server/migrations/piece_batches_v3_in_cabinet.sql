-- server/migrations/piece_batches_v3_in_cabinet.sql

-- v2 added cabinet_placed_at but never widened the status check, so every
-- "Place in Cabinet" write was rejected by the constraint.
ALTER TABLE piece_batches DROP CONSTRAINT IF EXISTS piece_batches_status_check;
ALTER TABLE piece_batches ADD CONSTRAINT piece_batches_status_check
  CHECK (status IN ('logged', 'bisque_fired', 'glaze_fired', 'ready', 'collecting', 'delivering', 'in_cabinet', 'collected', 'shipped', 'recycled'));
