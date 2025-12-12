-- Create course_enrollments table to track course purchases and manage automatic booking creation
CREATE TABLE IF NOT EXISTS "course_enrollments" (
  "id" SERIAL PRIMARY KEY,
  "student_id" INTEGER NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "shopify_order_id" VARCHAR(255) NOT NULL,
  "shopify_line_item_id" VARCHAR(255) NOT NULL,
  "course_title" VARCHAR(500) NOT NULL,
  "course_variant_title" VARCHAR(500),
  "course_type" VARCHAR(255), -- e.g., "Wheelthrowing Beginner", "Handbuilding"
  "schedule_pattern" VARCHAR(255), -- e.g., "TUESDAYS", "WEDNESDAYS"
  "number_of_weeks" INTEGER, -- e.g., 6 for a 6-week course
  "course_start_date" DATE,
  "course_end_date" DATE,
  "class_time" VARCHAR(50), -- e.g., "7:00 PM - 9:30 PM"
  "instructor" VARCHAR(255),
  "room" VARCHAR(255),
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled'
  "pending_student_count" INTEGER DEFAULT 0, -- Track how many students in this cohort
  "threshold_met_at" TIMESTAMP, -- When 4+ students threshold was reached
  "bookings_created_at" TIMESTAMP, -- When bookings were auto-created
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_course_enrollments_student_id" ON "course_enrollments"("student_id");
CREATE INDEX IF NOT EXISTS "idx_course_enrollments_shopify_order_id" ON "course_enrollments"("shopify_order_id");
CREATE INDEX IF NOT EXISTS "idx_course_enrollments_status" ON "course_enrollments"("status");
CREATE INDEX IF NOT EXISTS "idx_course_enrollments_course_type_start_date" ON "course_enrollments"("course_type", "course_start_date");

-- Add unique constraint to prevent duplicate enrollments
CREATE UNIQUE INDEX IF NOT EXISTS "idx_course_enrollments_unique" 
  ON "course_enrollments"("student_id", "shopify_order_id", "shopify_line_item_id");

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_course_enrollments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_course_enrollments_updated_at
  BEFORE UPDATE ON "course_enrollments"
  FOR EACH ROW
  EXECUTE FUNCTION update_course_enrollments_updated_at();
