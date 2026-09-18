-- A returned class credit may be restricted to a class category. The source
-- adjustment remains the durable credit row; consumption links it to the new
-- booking so it cannot be spent twice.
ALTER TABLE booking_credit_adjustments
  ADD COLUMN IF NOT EXISTS restriction_type TEXT,
  ADD COLUMN IF NOT EXISTS consumed_by_booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

ALTER TABLE booking_credit_adjustments
  DROP CONSTRAINT IF EXISTS booking_credit_adjustments_restriction_type_check;

ALTER TABLE booking_credit_adjustments
  ADD CONSTRAINT booking_credit_adjustments_restriction_type_check
  CHECK (restriction_type IS NULL OR restriction_type = 'glazing');

CREATE UNIQUE INDEX IF NOT EXISTS idx_bca_consumed_booking
  ON booking_credit_adjustments(consumed_by_booking_id)
  WHERE consumed_by_booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bca_open_restrictions
  ON booking_credit_adjustments(student_id, course_enrollment_id, restriction_type, created_at)
  WHERE restriction_type IS NOT NULL AND consumed_by_booking_id IS NULL;

-- Existing approved Shauna Hun adjustment. Scope by the exact audited source,
-- never by name, so this migration is repeatable and cannot tag another credit.
UPDATE booking_credit_adjustments
SET restriction_type = 'glazing'
WHERE booking_id = 29560
  AND action = 'return_glazing_credit'
  AND reason = 'Studio-approved glazing-only replacement for missed glazing class on 2026-09-05 09:30-12:00'
  AND consumed_by_booking_id IS NULL;
