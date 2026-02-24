-- Create table to track last sync timestamps
CREATE TABLE IF NOT EXISTS sync_tracking (
  sync_type VARCHAR(50) PRIMARY KEY,
  last_sync_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial record for shopify orders sync
INSERT INTO sync_tracking (sync_type, last_sync_at)
VALUES ('shopify_orders', NOW() - INTERVAL '7 days')
ON CONFLICT (sync_type) DO NOTHING;
