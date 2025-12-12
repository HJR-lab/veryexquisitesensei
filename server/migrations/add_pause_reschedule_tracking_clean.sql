-- Migration: Add pause and reschedule tracking
-- Created: 2025-11-08

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

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_reschedule_fees_student ON reschedule_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_fees_payment_status ON reschedule_fees(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_original_class ON bookings(original_class_instance_id);
CREATE INDEX IF NOT EXISTS idx_customers_paused ON customers(course_paused) WHERE course_paused = TRUE;
