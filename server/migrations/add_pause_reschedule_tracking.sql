-- Migration: Add pause and reschedule tracking
-- Created: 2025-11-08

-- Add new status values for bookings
-- Current statuses: 'booked', 'completed', 'cancelled'
-- New statuses: 'paused', 'rescheduled'

-- Add pause tracking fields to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS course_paused BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pause_start_date DATE,
ADD COLUMN IF NOT EXISTS pause_reason TEXT,
ADD COLUMN IF NOT EXISTS paused_at_week INTEGER,
ADD COLUMN IF NOT EXISTS resume_course_identifier VARCHAR(50);

-- Add reschedule tracking fields to bookings table
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS original_class_instance_id INTEGER REFERENCES class_instances(id),
ADD COLUMN IF NOT EXISTS rescheduled_from_date DATE,
ADD COLUMN IF NOT EXISTS reschedule_reason TEXT,
ADD COLUMN IF NOT EXISTS reschedule_fee_paid DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_makeup_class BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_glazing_reschedule BOOLEAN DEFAULT FALSE;

-- Create a new table for pause/reschedule fees
CREATE TABLE IF NOT EXISTS reschedule_fees (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  fee_type VARCHAR(20) NOT NULL CHECK (fee_type IN ('reschedule', 'makeup', 'pause')),
  amount DECIMAL(10,2) NOT NULL,
  fee_date TIMESTAMP NOT NULL DEFAULT NOW(),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'waived')),
  payment_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_reschedule_fees_student ON reschedule_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_fees_payment_status ON reschedule_fees(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_original_class ON bookings(original_class_instance_id);
CREATE INDEX IF NOT EXISTS idx_customers_paused ON customers(course_paused) WHERE course_paused = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN customers.course_paused IS 'Whether the student has paused their current course';
COMMENT ON COLUMN customers.pause_start_date IS 'Date when the student paused their course';
COMMENT ON COLUMN customers.pause_reason IS 'Reason for pausing (e.g., travel, medical, personal)';
COMMENT ON COLUMN customers.paused_at_week IS 'Which week number they paused at (e.g., 3 means they completed week 3)';
COMMENT ON COLUMN customers.resume_course_identifier IS 'Course identifier where they will resume (e.g., WT1210AM_DL6)';

COMMENT ON COLUMN bookings.original_class_instance_id IS 'Original class if this booking is a reschedule';
COMMENT ON COLUMN bookings.rescheduled_from_date IS 'Original date of the class that was rescheduled';
COMMENT ON COLUMN bookings.reschedule_reason IS 'Reason for rescheduling';
COMMENT ON COLUMN bookings.reschedule_fee_paid IS 'Amount paid for rescheduling to next course';
COMMENT ON COLUMN bookings.is_makeup_class IS 'Whether this is a makeup class from a previous course';
COMMENT ON COLUMN bookings.is_glazing_reschedule IS 'Whether this is a glazing class (6.6) rescheduled up to 2 courses ahead (no fee)';

COMMENT ON TABLE reschedule_fees IS 'Track all reschedule, makeup, and pause-related fees';
COMMENT ON COLUMN reschedule_fees.fee_type IS 'Type: reschedule (single class), makeup (next course), pause (multiple classes)';
