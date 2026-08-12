-- Audited, single-seat capacity exceptions.
--
-- Two gates normally stop a booking: the instance's own max_capacity, and the
-- studio-wide wheel cap (STUDIO_WHEELS in utils/bookingDb.js) which counts every
-- cohort sharing a date+time. Both are real constraints — the second is the
-- physical wheel count — so neither should be loosened globally to accommodate
-- a one-off.
--
-- A row here grants ONE named student ONE seat beyond both gates in ONE class
-- instance. It is deliberately not a raised limit: it cannot be claimed by
-- anyone else, it does not survive to the next week's instance, and the reason
-- stays on record after the fact so a roster reading 11/10 is explained rather
-- than looking like a counting bug.

CREATE TABLE IF NOT EXISTS capacity_overrides (
  id                  SERIAL PRIMARY KEY,
  class_instance_id   INTEGER NOT NULL REFERENCES class_instances(id) ON DELETE CASCADE,
  student_id          INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reason              TEXT NOT NULL,
  created_by          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  consumed_at         TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  revoked_by          TEXT
);

-- One live grant per student per class instance. Revoked rows stay for history.
CREATE UNIQUE INDEX IF NOT EXISTS capacity_overrides_live_uniq
  ON capacity_overrides (class_instance_id, student_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS capacity_overrides_instance_idx
  ON capacity_overrides (class_instance_id);

COMMENT ON TABLE capacity_overrides IS
  'Admin-granted permission for one named student to exceed both the class max_capacity and the studio wheel cap in one class instance. Never a raised limit; never transferable.';
COMMENT ON COLUMN capacity_overrides.consumed_booking_id IS
  'Set once the grant is actually used. A consumed grant is spent — if the student later moves away, a fresh grant is required rather than the seat quietly staying open.';
COMMENT ON COLUMN capacity_overrides.revoked_at IS
  'Set when an unused grant is withdrawn. Consumed grants are never revoked; the history is the audit trail.';
