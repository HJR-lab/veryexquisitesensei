-- Create enrollment_pauses table to track when students pause their courses
CREATE TABLE IF NOT EXISTS enrollment_pauses (
  id SERIAL PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Pause details
  paused_at TIMESTAMP NOT NULL DEFAULT NOW(),
  paused_by VARCHAR(255), -- admin email who paused it
  pause_reason TEXT,

  -- Progress tracking
  weeks_completed_at_pause INTEGER DEFAULT 0,
  weeks_remaining INTEGER NOT NULL,

  -- Classes remaining to book
  classes_remaining INTEGER NOT NULL, -- total classes left
  wheelthrowing_remaining INTEGER DEFAULT 0, -- specific WT classes needed
  handbuilding_remaining INTEGER DEFAULT 0, -- specific HB classes needed
  glazing_remaining INTEGER DEFAULT 0, -- glazing classes needed

  -- Resume tracking
  resumed_at TIMESTAMP,
  resumed_by VARCHAR(255), -- admin email who resumed it
  resume_notes TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'paused', -- 'paused', 'resumed', 'cancelled'

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_enrollment_pauses_student ON enrollment_pauses(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_pauses_enrollment ON enrollment_pauses(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_pauses_status ON enrollment_pauses(status);

-- Add pause status to course_enrollments if not exists
ALTER TABLE course_enrollments
ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pause_id INTEGER REFERENCES enrollment_pauses(id);

COMMENT ON TABLE enrollment_pauses IS 'Tracks when students pause their course enrollments and what classes they still need to complete';
