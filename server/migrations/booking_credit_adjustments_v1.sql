-- Audit trail for admin reversals of class-credit state on a booking.
--
-- Why this table exists: the 09/08/26 credit design review (Ryan Ling, section A2)
-- found three interventions over four months where the stored counter and the
-- bookings ledger were edited independently and NOTHING recorded who did it or
-- why. The only record was the info@ves.sg Gmail thread. Any admin action that
-- moves a class credit by hand writes a row here.
--
-- Not to be confused with `credit_transactions`, which tracks VES Credits (money).
-- This table tracks CLASS credits (entitlement to attend a session).

CREATE TABLE IF NOT EXISTS booking_credit_adjustments (
  id                   SERIAL PRIMARY KEY,
  booking_id           INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  student_id           INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  course_enrollment_id INTEGER REFERENCES course_enrollments(id) ON DELETE SET NULL,

  -- What was done. 'unforfeit' = a no-show credit returned on appeal.
  action               TEXT NOT NULL,
  previous_status      TEXT NOT NULL,
  new_status           TEXT NOT NULL,

  -- Required. This is a money-adjacent reversal; it is never silent.
  reason               TEXT NOT NULL,

  -- Who. admin_email is denormalised on purpose so the trail survives the
  -- customer row being renamed, merged, or deleted.
  admin_id             INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  admin_email          TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bca_student  ON booking_credit_adjustments(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bca_booking  ON booking_credit_adjustments(booking_id);
