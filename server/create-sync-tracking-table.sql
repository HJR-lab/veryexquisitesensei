-- Create sync_tracking table to track incremental syncs
CREATE TABLE IF NOT EXISTS sync_tracking (
  sync_type VARCHAR(50) PRIMARY KEY,
  last_sync_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial record for Shopify orders (7 days ago)
INSERT INTO sync_tracking (sync_type, last_sync_at)
VALUES ('shopify_orders', NOW() - INTERVAL '7 days')
ON CONFLICT (sync_type) DO NOTHING;

-- Verify the table was created
SELECT * FROM sync_tracking;
