-- Create piece_batches table for tracking pottery pieces through the firing pipeline
CREATE TABLE IF NOT EXISTS piece_batches (
  id SERIAL PRIMARY KEY,
  course_enrollment_id INTEGER REFERENCES course_enrollments(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'logged'
    CHECK (status IN ('logged', 'bisque_fired', 'glaze_fired', 'ready', 'collecting', 'delivering', 'collected', 'shipped', 'recycled')),
  piece_count INTEGER NOT NULL DEFAULT 1,
  initials TEXT NOT NULL,
  notes TEXT,
  photo_urls JSONB DEFAULT '[]'::jsonb,
  delivery_method TEXT CHECK (delivery_method IN ('collect', 'deliver')),
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  ready_at TIMESTAMPTZ,
  hold_expires_at TIMESTAMPTZ,
  last_reminder_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_piece_batches_customer ON piece_batches(customer_id);
CREATE INDEX IF NOT EXISTS idx_piece_batches_status ON piece_batches(status);
CREATE INDEX IF NOT EXISTS idx_piece_batches_enrollment ON piece_batches(course_enrollment_id);
CREATE INDEX IF NOT EXISTS idx_piece_batches_initials ON piece_batches(initials);

-- Add initials column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS initials TEXT;

-- Unique constraint: one batch per enrollment
CREATE UNIQUE INDEX IF NOT EXISTS idx_piece_batches_enrollment_unique
  ON piece_batches(course_enrollment_id)
  WHERE course_enrollment_id IS NOT NULL;
