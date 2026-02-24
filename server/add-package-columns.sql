-- Add package tracking columns to course_enrollments table
-- These columns track multi-course packages (e.g., 3-course, 6-course packages)

ALTER TABLE course_enrollments
ADD COLUMN IF NOT EXISTS package_total_courses INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS package_total_classes INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS package_courses_remaining INT DEFAULT NULL;

-- Add comments to document the columns
COMMENT ON COLUMN course_enrollments.package_total_courses IS 'Total number of courses in the package (e.g., 3 for 3-course package)';
COMMENT ON COLUMN course_enrollments.package_total_classes IS 'Total classes in all package courses (e.g., 18 = 3 courses × 6 weeks)';
COMMENT ON COLUMN course_enrollments.package_courses_remaining IS 'Number of courses remaining in the package (decrements as courses complete)';

-- Example values:
-- Student purchases "3-Course Package" (18 weeks total = 3 × 6 weeks)
--   - First enrollment: package_total_courses=3, package_total_classes=18, package_courses_remaining=2 (after enrolling in course 1)
--   - Second enrollment: package_courses_remaining=1 (after completing course 1 and enrolling in course 2)
--   - Third enrollment: package_courses_remaining=0 (after completing course 2 and enrolling in final course)
