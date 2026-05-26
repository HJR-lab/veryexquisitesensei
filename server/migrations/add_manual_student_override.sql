-- Adds a flag indicating the enrollment's student_id was manually reassigned
-- away from the Shopify order owner. Sync logic must not rewrite student_id
-- when this is true.
ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS manual_student_override BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN course_enrollments.manual_student_override IS
  'TRUE when student_id was deliberately changed away from the Shopify order owner; sync must not auto-revert.';
