-- Migration: Add course enrollment tracking
-- Created: 2025-11-09
-- Purpose: Track student enrollment in 6-week courses and manage course lifecycle

-- Create course enrollments table to track each 6-week course a student enrolls in
CREATE TABLE IF NOT EXISTS course_enrollments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  course_identifier VARCHAR(50) NOT NULL,
  course_type VARCHAR(50) NOT NULL,
  total_weeks INTEGER NOT NULL DEFAULT 6,
  weeks_completed INTEGER DEFAULT 0,
  weeks_remaining INTEGER DEFAULT 6,
  enrollment_date TIMESTAMP DEFAULT NOW(),
  start_date DATE,
  expected_end_date DATE,
  actual_end_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add course_enrollment_id to bookings to link each class to a course enrollment
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS course_enrollment_id INTEGER REFERENCES course_enrollments(id) ON DELETE SET NULL;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_course_enrollments_student ON course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_status ON course_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_identifier ON course_enrollments(course_identifier);
CREATE INDEX IF NOT EXISTS idx_bookings_course_enrollment ON bookings(course_enrollment_id);

-- Add comment for clarity
COMMENT ON TABLE course_enrollments IS 'Tracks student enrollment in 6-week courses, managing course lifecycle and progress';
COMMENT ON COLUMN course_enrollments.course_identifier IS 'Course identifier (e.g., WT0410AM_DL6) without week number';
COMMENT ON COLUMN course_enrollments.weeks_completed IS 'Number of weeks completed (attended or missed)';
COMMENT ON COLUMN course_enrollments.weeks_remaining IS 'Number of weeks remaining in the course';
COMMENT ON COLUMN bookings.course_enrollment_id IS 'Links this booking to a specific course enrollment';
