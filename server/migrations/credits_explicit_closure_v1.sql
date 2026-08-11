-- Make "this credit block is closed" an explicit fact instead of an inferred zero.
--
-- THE DEFECT THIS FIXES
-- `class_credits_remaining === 0` was overloaded. It meant both "an admin
-- deliberately closed this block, stop offering the credits" AND "the number
-- happens to be zero". Two gates read it that way and skip the enrollment
-- BEFORE the bookings ledger is ever consulted:
--     server/routes/classes.js  — booking eligibility
--     server/routes/admin.js    — admin Users list
-- That conflation is why the stored columns could not simply be deleted in
-- favour of the ledger: deleting them would have re-opened 20 closed blocks
-- and handed roughly 100 credits back to students who are not owed them.
--
-- With closure recorded here, the ledger becomes authoritative for the NUMBER
-- and this flag is authoritative for WHETHER the block is open at all. The
-- stored class_credits_* columns demote to a cache recomputed from the ledger.
--
-- See docs/superpowers/specs/2026-08-09-package-display-and-credit-truth-design.md
-- (final open question) and kanban t_2e2ca8cb.

ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS credits_closed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credits_closed_reason TEXT;

COMMENT ON COLUMN course_enrollments.credits_closed_at IS
  'Set when this enrollment''s credit block is deliberately closed. Non-null means "offer no further credits regardless of what the bookings ledger computes". NULL means the ledger decides.';

COMMENT ON COLUMN course_enrollments.credits_closed_reason IS
  'Why the block was closed. Required in practice — a closure with no reason is the failure mode this column exists to prevent.';

-- Partial index: the gates only ever ask "is this one closed?", and open rows
-- are the overwhelming majority.
CREATE INDEX IF NOT EXISTS idx_enrollments_credits_closed
  ON course_enrollments(id) WHERE credits_closed_at IS NOT NULL;
