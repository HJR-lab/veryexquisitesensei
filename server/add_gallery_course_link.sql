-- Add course_enrollment_id to pottery_pieces to link gallery pieces to courses
ALTER TABLE "pottery_pieces"
ADD COLUMN IF NOT EXISTS "course_enrollment_id" INTEGER REFERENCES "course_enrollments"("id") ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS "idx_pottery_pieces_course_enrollment_id"
  ON "pottery_pieces"("course_enrollment_id");

-- Update images JSONB structure to support multiple images with metadata
-- Each image will have: { url, description, date_added, order }
-- Example: [
--   { "url": "https://...", "description": "First firing", "date_added": "2025-01-15", "order": 1 },
--   { "url": "https://...", "description": "After glazing", "date_added": "2025-01-20", "order": 2 }
-- ]

COMMENT ON COLUMN "pottery_pieces"."course_enrollment_id" IS 'Links gallery piece to the course enrollment where it was made';
COMMENT ON COLUMN "pottery_pieces"."images" IS 'Array of image objects with url, description, date_added, and order (max 10)';
