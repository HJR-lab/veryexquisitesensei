-- Migration: Add credit system support for Handbuilding courses
-- Date: 2025-12-28

-- Add credit tracking columns to course_enrollments table
ALTER TABLE course_enrollments
ADD COLUMN IF NOT EXISTS class_credits_allocated INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS class_credits_used INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS class_credits_remaining INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS glazing_class_used BOOLEAN DEFAULT FALSE;

-- Add technique column to class_instances table
ALTER TABLE class_instances
ADD COLUMN IF NOT EXISTS class_technique VARCHAR(50);

-- Update all existing week 6 glazing classes
-- Week 6 classes are identified by class_type ending in '.6'
UPDATE class_instances
SET
  max_capacity = 15,
  class_technique = 'glazing'
WHERE
  class_type LIKE '%.6'
  AND class_technique IS NULL;

-- Verify changes
SELECT
  'course_enrollments columns added' AS status,
  column_name
FROM information_schema.columns
WHERE table_name = 'course_enrollments'
  AND column_name IN ('class_credits_allocated', 'class_credits_used', 'class_credits_remaining', 'glazing_class_used');

SELECT
  'class_instances column added' AS status,
  column_name
FROM information_schema.columns
WHERE table_name = 'class_instances'
  AND column_name = 'class_technique';

SELECT
  'glazing classes updated' AS status,
  COUNT(*) AS count
FROM class_instances
WHERE class_type LIKE '%.6'
  AND max_capacity = 15
  AND class_technique = 'glazing';
