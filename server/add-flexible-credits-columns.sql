-- Add columns to track flexible credits for 10-class packages
-- Flexible credits can be used for either WT or HB classes

ALTER TABLE course_enrollments
ADD COLUMN IF NOT EXISTS flexible_credits_allocated INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS flexible_credits_used INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS flexible_credits_remaining INT DEFAULT 0;

-- Update existing 10-class packages (if any exist)
UPDATE course_enrollments
SET
  flexible_credits_allocated = 4,
  flexible_credits_remaining = 4
WHERE
  (number_of_weeks = 10 OR course_title ILIKE '%10 Classes%' OR course_title ILIKE '%10-Class%')
  AND flexible_credits_allocated = 0;
