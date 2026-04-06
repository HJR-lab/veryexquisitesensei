-- server/migrations/firing_runs.sql

-- Firing runs table — groups batches into kiln loads
CREATE TABLE IF NOT EXISTS firing_runs (
  id SERIAL PRIMARY KEY,
  firing_type TEXT NOT NULL CHECK (firing_type IN ('bisque', 'glaze')),
  status TEXT NOT NULL DEFAULT 'loading' CHECK (status IN ('loading', 'firing', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fired_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Join table linking batches to firing runs
CREATE TABLE IF NOT EXISTS firing_run_batches (
  id SERIAL PRIMARY KEY,
  firing_run_id INTEGER NOT NULL REFERENCES firing_runs(id) ON DELETE CASCADE,
  piece_batch_id INTEGER NOT NULL REFERENCES piece_batches(id) ON DELETE CASCADE,
  UNIQUE(piece_batch_id)
);

CREATE INDEX idx_firing_runs_status ON firing_runs(status);
CREATE INDEX idx_firing_run_batches_run ON firing_run_batches(firing_run_id);
CREATE INDEX idx_firing_run_batches_batch ON firing_run_batches(piece_batch_id);
